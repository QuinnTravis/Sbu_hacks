-- Private, content-addressed narration cache. Only the server can generate,
-- read transcripts, sign audio URLs, or consume the provider allowance.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('journey-audio', 'journey-audio', false, 5242880, array['audio/mpeg'])
on conflict (id) do nothing;

create table public.audio_jobs (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  token uuid,
  lease_until timestamptz not null default '-infinity',
  budget_bucket text,
  reserved integer not null default 0 check (reserved >= 0),
  script jsonb,
  storage_path text,
  updated_at timestamptz not null default now()
);
alter table public.audio_jobs enable row level security;
revoke all on public.audio_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.audio_jobs to service_role;

create table private.audio_budget (
  bucket text primary key,
  used integer not null default 0 check (used >= 0),
  expires_at timestamptz not null
);
alter table private.audio_budget enable row level security;
revoke all on private.audio_budget from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.audio_budget to service_role;

-- A lease prevents parallel callers on different server instances from paying
-- to generate the same clip. Reserve the maximum transcript size before any
-- model call, then return unused characters when the clip is committed.
create function public.claim_audio_job(p_key text, p_client_hash text, p_limit integer)
returns uuid language plpgsql volatile security invoker set search_path = ''
as $$
declare
  monthly text := 'month:' || to_char(now() at time zone 'UTC', 'YYYY-MM');
  hourly text := 'client:' || p_client_hash || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD-HH24');
  job public.audio_jobs%rowtype;
  used_month integer;
  used_hour integer;
  lease uuid;
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_client_hash !~ '^[a-f0-9]{64}$'
    or p_limit < 0 or p_limit > 10000000 then return null; end if;
  insert into public.audio_jobs(id) values(p_key) on conflict do nothing;
  select * into job from public.audio_jobs where id = p_key for update;
  if job.storage_path is not null or job.lease_until > now() then return null; end if;
  insert into private.audio_budget(bucket, expires_at)
    values(monthly, now() + interval '65 days') on conflict do nothing;
  select used into used_month from private.audio_budget where bucket = monthly for update;
  if used_month + 1200 > p_limit then return null; end if;
  insert into private.audio_budget(bucket, expires_at)
    values(hourly, now() + interval '2 hours') on conflict do nothing;
  select used into used_hour from private.audio_budget where bucket = hourly for update;
  if used_hour >= 30 then return null; end if;
  update private.audio_budget set used = used + 1200 where bucket = monthly;
  update private.audio_budget set used = used + 1 where bucket = hourly;
  lease := gen_random_uuid();
  update public.audio_jobs set token = lease, lease_until = now() + interval '150 seconds',
    budget_bucket = monthly, reserved = 1200, updated_at = now() where id = p_key;
  delete from private.audio_budget where expires_at < now();
  return lease;
end;
$$;

create function public.finish_audio_job(p_key text, p_token uuid, p_script jsonb, p_path text, p_used integer)
returns boolean language plpgsql volatile security invoker set search_path = ''
as $$
declare job public.audio_jobs%rowtype;
begin
  select * into job from public.audio_jobs where id = p_key for update;
  if not found or job.token is distinct from p_token or p_token is null
    or p_used < 0 or p_used > job.reserved then return false; end if;
  if p_path is not null and p_path <> p_key || '/' || p_token::text || '.mp3' then return false; end if;
  update private.audio_budget set used = greatest(0, used - (job.reserved - p_used))
    where bucket = job.budget_bucket;
  update public.audio_jobs set script = p_script, storage_path = p_path, token = null,
    reserved = 0, lease_until = case when p_path is null then now() + interval '60 seconds' else now() end,
    updated_at = now() where id = p_key;
  return true;
end;
$$;
revoke all on function public.claim_audio_job(text, text, integer) from public, anon, authenticated;
revoke all on function public.finish_audio_job(text, uuid, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.claim_audio_job(text, text, integer) to service_role;
grant execute on function public.finish_audio_job(text, uuid, jsonb, text, integer) to service_role;

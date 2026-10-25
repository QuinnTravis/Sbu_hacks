-- Private cache for Google-grounded Gemini panorama scenes.
-- A single database counter prevents retries and parallel instances from exceeding
-- the project's 50-scene experimentation limit.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('time-portal-scenes', 'time-portal-scenes', false, 8388608,
  array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.time_portal_jobs (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  token uuid,
  lease_until timestamptz not null default '-infinity',
  storage_path text,
  mime_type text check (mime_type is null or mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  search_suggestions text check (search_suggestions is null or char_length(search_suggestions) <= 100000),
  updated_at timestamptz not null default now(),
  check ((storage_path is null) = (mime_type is null))
);
alter table public.time_portal_jobs enable row level security;
revoke all on public.time_portal_jobs from public, anon, authenticated;
grant select, insert, update on public.time_portal_jobs to service_role;

create table private.time_portal_budget (
  id smallint primary key check (id = 1),
  calls_used integer not null default 0 check (calls_used between 0 and 50)
);
alter table private.time_portal_budget enable row level security;
revoke all on private.time_portal_budget from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant select, update on private.time_portal_budget to service_role;
insert into private.time_portal_budget(id, calls_used) values (1, 0)
on conflict (id) do nothing;

-- Exact-prompt rows serialize duplicate work. The budget row serializes claims
-- across all prompts, enforcing a lifetime limit of 50 provider attempts.
create function public.claim_time_portal_job(p_key text)
returns table(outcome text, lease uuid, storage_path text, mime_type text)
language plpgsql volatile set search_path = ''
as $$
declare
  job public.time_portal_jobs%rowtype;
  calls integer;
  lease_id uuid;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' then
    return query select 'invalid'::text, null::uuid, null::text, null::text;
    return;
  end if;

  insert into public.time_portal_jobs(id) values (p_key) on conflict do nothing;
  select * into job from public.time_portal_jobs where id = p_key for update;

  if job.storage_path is not null then
    return query select 'ready'::text, null::uuid, job.storage_path, job.mime_type;
    return;
  end if;
  if job.lease_until > now() then
    return query select 'busy'::text, null::uuid, null::text, null::text;
    return;
  end if;

  select calls_used into calls from private.time_portal_budget where id = 1 for update;
  if not found then
    return query select 'unavailable'::text, null::uuid, null::text, null::text;
    return;
  end if;
  if calls >= 50 then
    return query select 'limit'::text, null::uuid, null::text, null::text;
    return;
  end if;

  update private.time_portal_budget set calls_used = calls_used + 1 where id = 1;
  lease_id := gen_random_uuid();
  update public.time_portal_jobs
    set token = lease_id, lease_until = now() + interval '150 seconds', updated_at = now()
    where id = p_key;
  return query select 'claimed'::text, lease_id, null::text, null::text;
end;
$$;

create function public.complete_time_portal_job(
  p_key text,
  p_lease uuid,
  p_storage_path text,
  p_mime_type text,
  p_search_suggestions text
)
returns boolean language plpgsql volatile set search_path = ''
as $$
declare
  job public.time_portal_jobs%rowtype;
  expected_path text;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_lease is null or
    p_mime_type not in ('image/png', 'image/jpeg', 'image/webp') or
    char_length(coalesce(p_search_suggestions, '')) > 100000 then
    return false;
  end if;
  expected_path := p_key || '/' || p_lease::text || case p_mime_type
    when 'image/png' then '.png'
    when 'image/jpeg' then '.jpg'
    when 'image/webp' then '.webp'
    else '' end;
  if p_storage_path is distinct from expected_path then return false; end if;

  select * into job from public.time_portal_jobs where id = p_key for update;
  if not found or job.token is distinct from p_lease or job.lease_until <= now() then return false; end if;
  update public.time_portal_jobs set
    storage_path = p_storage_path,
    mime_type = p_mime_type,
    search_suggestions = p_search_suggestions,
    token = null,
    lease_until = now(),
    updated_at = now()
  where id = p_key;
  return true;
end;
$$;

create function public.fail_time_portal_job(p_key text, p_lease uuid)
returns boolean language plpgsql volatile set search_path = ''
as $$
declare
  job public.time_portal_jobs%rowtype;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_lease is null then return false; end if;
  select * into job from public.time_portal_jobs where id = p_key for update;
  if not found or job.token is distinct from p_lease then return false; end if;
  update public.time_portal_jobs set token = null, lease_until = '-infinity', updated_at = now()
    where id = p_key;
  return true;
end;
$$;

revoke all on function public.claim_time_portal_job(text) from public, anon, authenticated;
revoke all on function public.complete_time_portal_job(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_time_portal_job(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_time_portal_job(text) to service_role;
grant execute on function public.complete_time_portal_job(text, uuid, text, text, text) to service_role;
grant execute on function public.fail_time_portal_job(text, uuid) to service_role;

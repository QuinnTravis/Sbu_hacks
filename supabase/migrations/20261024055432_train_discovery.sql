create schema if not exists extensions;
create schema if not exists private;
create extension if not exists postgis with schema extensions;

create table public.rail_routes (
  id text primary key check (id ~ '^[0-9]{1,2}$'),
  data jsonb not null,
  imported_at timestamptz not null default now()
);
create table public.places (
  id text primary key check (id ~ '^osm-(node|way|relation)-[0-9]+$'),
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  route_ids text[] not null,
  data jsonb not null,
  location extensions.geography(Point,4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography) stored,
  updated_at timestamptz not null default now()
);
create index places_location_idx on public.places using gist(location);
create index places_routes_idx on public.places using gin(route_ids);
alter table public.places enable row level security;
alter table public.rail_routes enable row level security;
create policy "Public place information" on public.places for select to anon, authenticated using (true);
create policy "Public rail information" on public.rail_routes for select to anon, authenticated using (true);
revoke all on public.places, public.rail_routes from anon, authenticated;
grant select on public.places, public.rail_routes to anon, authenticated;

create function public.nearby_places(p_lat double precision,p_lon double precision,p_route text)
returns table(data jsonb)
language sql stable security invoker set search_path = ''
as $$
 select p.data from public.places p
 where p_lat between 40.4 and 41.2 and p_lon between -74.2 and -71.7
 and p_route = any(p.route_ids)
 and extensions.st_dwithin(p.location,extensions.st_setsrid(extensions.st_makepoint(p_lon,p_lat),4326)::extensions.geography,1200)
 order by p.location operator(extensions.<->) extensions.st_setsrid(extensions.st_makepoint(p_lon,p_lat),4326)::extensions.geography
 limit 60;
$$;
revoke all on function public.nearby_places(double precision,double precision,text) from public;
grant execute on function public.nearby_places(double precision,double precision,text) to anon, authenticated;

create table private.photo_budget (
  bucket text primary key,
  used integer not null default 0,
  expires_at timestamptz not null
);
alter table private.photo_budget enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on private.photo_budget from public, anon, authenticated;
-- This intentionally public capability only consumes a bounded photo allowance.
-- It cannot read or modify public content. No raw IP addresses are retained.
create function public.consume_photo_budget(p_client_hash text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare
 daily text := 'day:' || to_char(now() at time zone 'UTC','YYYY-MM-DD');
 hourly text := 'client:' || p_client_hash || ':' || to_char(now() at time zone 'UTC','YYYY-MM-DD-HH24');
 n integer;
begin
 if p_client_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 insert into private.photo_budget(bucket,expires_at) values(daily,now()+interval '2 days') on conflict do nothing;
 select used into n from private.photo_budget where bucket=daily for update;
 if n >= 300 then return false; end if;
 insert into private.photo_budget(bucket,expires_at) values(hourly,now()+interval '2 hours') on conflict do nothing;
 update private.photo_budget set used=used+1 where bucket=hourly and used<30 returning used into n;
 if not found then return false; end if;
 update private.photo_budget set used=used+1 where bucket=daily;
 delete from private.photo_budget where expires_at<now();
 return true;
end;
$$;
revoke all on function public.consume_photo_budget(text) from public;
grant execute on function public.consume_photo_budget(text) to anon, authenticated;


-- Atomic catalog publication. Only backend jobs can replace the public dataset.
create function public.refresh_catalog(p_places jsonb,p_routes jsonb)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare n integer;
begin
 if jsonb_typeof(p_places) <> 'array' or jsonb_array_length(p_places) < 1 or jsonb_array_length(p_places) > 10000 then
  raise exception 'A nonempty place catalog of at most 10000 entries is required';
 end if;
 if jsonb_typeof(p_routes) <> 'array' or jsonb_array_length(p_routes) <> 13 then
  raise exception 'All 13 LIRR route/service records are required';
 end if;
 perform pg_advisory_xact_lock(73318584);
 insert into public.rail_routes(id,data,imported_at)
 select r->>'id',r,now() from jsonb_array_elements(p_routes) r
 on conflict(id) do update set data=excluded.data,imported_at=excluded.imported_at;
 insert into public.places(id,name,latitude,longitude,route_ids,data,updated_at)
 select p->>'id',p->>'name',(p->>'lat')::double precision,(p->>'lon')::double precision,
 array(select jsonb_array_elements_text(p->'routeIds')),p,now()
 from jsonb_array_elements(p_places) p
 on conflict(id) do update set name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,route_ids=excluded.route_ids,data=excluded.data,updated_at=excluded.updated_at;
 delete from public.places where id not in(select p->>'id' from jsonb_array_elements(p_places) p);
 get diagnostics n = row_count;
 return jsonb_array_length(p_places);
end;
$$;
revoke all on function public.refresh_catalog(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.refresh_catalog(jsonb,jsonb) to service_role;
grant select,insert,update,delete on public.places,public.rail_routes to service_role;


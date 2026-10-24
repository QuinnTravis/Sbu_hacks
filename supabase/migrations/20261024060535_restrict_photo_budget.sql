-- Only the Next.js server may consume provider budget. Public clients have read-only catalog access.
alter function public.consume_photo_budget(text) security invoker;
revoke all on function public.consume_photo_budget(text) from public, anon, authenticated;
grant execute on function public.consume_photo_budget(text) to service_role;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.photo_budget to service_role;


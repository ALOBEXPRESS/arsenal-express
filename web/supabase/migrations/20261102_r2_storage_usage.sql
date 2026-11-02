-- Ledger entries must survive project deletion until signed upload URLs expire.
alter table public.media_storage_reservations drop constraint media_storage_reservations_project_id_fkey;
alter table public.media_storage_reservations alter column project_id drop not null;
alter table public.media_storage_reservations add constraint media_storage_reservations_project_id_fkey foreign key(project_id) references public.projects(id) on delete set null;
create table public.media_storage_user_limits(user_id uuid primary key references auth.users(id) on delete cascade, limit_bytes bigint not null check(limit_bytes > 0));
alter table public.media_storage_user_limits enable row level security;
revoke all on public.media_storage_user_limits from anon, authenticated;
grant all on public.media_storage_user_limits to service_role;
create or replace function public.media_storage_usage(p_user_id uuid) returns jsonb language sql security definer set search_path = public, pg_temp as $$
 select jsonb_build_object('used', coalesce((select sum(size_bytes) from media_storage_reservations where user_id=p_user_id),0), 'pending', coalesce((select sum(size_bytes) from media_storage_reservations where user_id=p_user_id and state<>'complete'),0), 'limit', coalesce((select limit_bytes from media_storage_user_limits where user_id=p_user_id), c.default_user_limit_bytes), 'maxLimit',c.default_user_limit_bytes, 'globalAvailable',greatest(0,c.limit_bytes-coalesce((select sum(size_bytes) from media_storage_reservations),0))) from media_storage_limits c where scope='global';
$$;
revoke all on function public.media_storage_usage(uuid) from public, anon, authenticated;
grant execute on function public.media_storage_usage(uuid) to service_role;

create or replace function public.reserve_media_storage(p_user_id uuid, p_project_id uuid, p_size_bytes bigint)
returns public.media_storage_reservations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  config public.media_storage_limits;
  used_global bigint;
  used_user bigint;
  reservation public.media_storage_reservations;
begin
  if p_size_bytes <= 0 or p_size_bytes > 500000000 then raise exception 'Tamanho de arquivo inválido'; end if;
  perform pg_advisory_xact_lock(746210501);
  if not exists(select 1 from public.projects where id = p_project_id and user_id = p_user_id) then raise exception 'Projeto não autorizado'; end if;
  select * into strict config from public.media_storage_limits where scope = 'global';
  -- Pending reservations remain counted until their objects are checked and cleaned.
  -- Expiry alone never frees space: an upload might still be present in R2.
  select coalesce(sum(size_bytes), 0), coalesce(sum(size_bytes) filter(where user_id = p_user_id), 0)
  into used_global, used_user from public.media_storage_reservations;
  if used_global + p_size_bytes > config.limit_bytes then raise exception 'Limite global de armazenamento atingido'; end if;
  if used_user + p_size_bytes > coalesce((select limit_bytes from public.media_storage_user_limits where user_id=p_user_id), config.default_user_limit_bytes) then raise exception 'Seu limite de armazenamento foi atingido'; end if;
  insert into public.media_storage_reservations(user_id, project_id, object_key, size_bytes)
  values(p_user_id, p_project_id, p_user_id::text || '/' || p_project_id::text || '/' || gen_random_uuid()::text, p_size_bytes)
  returning * into reservation;
  return reservation;
end;
$$;
revoke all on function public.reserve_media_storage(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.reserve_media_storage(uuid, uuid, bigint) to service_role;


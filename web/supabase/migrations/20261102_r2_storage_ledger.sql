-- R2 capacity ledger. Apply before enabling R2 uploads.
-- Only trusted server code may reserve/finalize uploads.
create table if not exists public.media_storage_limits (
  scope text primary key check (scope = 'global'),
  limit_bytes bigint not null check (limit_bytes > 0),
  default_user_limit_bytes bigint not null check (default_user_limit_bytes > 0)
);
insert into public.media_storage_limits values ('global', 8000000000, 500000000) on conflict do nothing;
create table if not exists public.media_storage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  object_key text unique not null,
  size_bytes bigint not null check (size_bytes > 0),
  state text not null default 'pending' check (state in ('pending', 'complete', 'deleting')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour'
);
alter table public.media_storage_limits enable row level security;
alter table public.media_storage_reservations enable row level security;
create policy media_storage_read_own on public.media_storage_reservations for select to authenticated using (auth.uid() = user_id);
revoke all on public.media_storage_limits from anon, authenticated;
revoke insert, update, delete on public.media_storage_reservations from anon, authenticated;
grant select on public.media_storage_reservations to authenticated;
grant all on public.media_storage_limits, public.media_storage_reservations to service_role;

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
  if used_user + p_size_bytes > config.default_user_limit_bytes then raise exception 'Seu limite de armazenamento foi atingido'; end if;
  insert into public.media_storage_reservations(user_id, project_id, object_key, size_bytes)
  values(p_user_id, p_project_id, p_user_id::text || '/' || p_project_id::text || '/' || gen_random_uuid()::text, p_size_bytes)
  returning * into reservation;
  return reservation;
end;
$$;
revoke all on function public.reserve_media_storage(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.reserve_media_storage(uuid, uuid, bigint) to service_role;

alter table public.media_storage_reservations add column if not exists asset_id uuid;
create or replace function public.complete_media_storage(p_reservation_id uuid, p_user_id uuid, p_asset jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.media_storage_reservations;
  a public.assets;
begin
  select * into strict r from public.media_storage_reservations where id = p_reservation_id and user_id = p_user_id for update;
  if r.state = 'complete' then select * into strict a from public.assets where id = r.asset_id; return to_jsonb(a); end if;
  if r.expires_at <= now() then raise exception 'Upload expirado'; end if;
  if r.state <> 'pending' then raise exception 'Estado de upload inválido'; end if;
  if not exists(select 1 from public.projects where id = r.project_id and user_id = p_user_id) then raise exception 'Projeto não autorizado'; end if;
  if p_asset->>'kind' not in ('video', 'audio', 'image') or length(p_asset->>'filename') > 500 then raise exception 'Mídia inválida'; end if;
  insert into public.assets(project_id, kind, origin, filename, storage_path, duration_seconds, file_size_bytes, metadata)
  values(r.project_id, p_asset->>'kind', 'upload', p_asset->>'filename', r.object_key, nullif(p_asset->>'duration_seconds','')::double precision, r.size_bytes,
  coalesce(p_asset->'metadata','{}'::jsonb) || jsonb_build_object('storage_provider','r2')) returning * into a;
  update public.media_storage_reservations set state = 'complete', asset_id = a.id where id = r.id;
  return to_jsonb(a);
end;
$$;
revoke all on function public.complete_media_storage(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_media_storage(uuid, uuid, jsonb) to service_role;

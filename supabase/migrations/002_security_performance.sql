-- =========================================================================
-- 002 — Segurança + performance + operações atômicas (SyncExpress)
-- Idempotente: pode rodar mais de uma vez. Tudo em uma transação.
-- Aplicar: Supabase Dashboard → SQL Editor → colar → Run.
-- Rollback: ver bloco no fim do arquivo.
-- =========================================================================
begin;

-- -------------------------------------------------------------------------
-- 1. Funções com search_path fixo (advisor: function_search_path_mutable)
-- -------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, preferences)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), '{}'::jsonb)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Ownership check usado por RLS de tabelas e do Storage.
-- security definer + stable: 1 lookup indexado (projects.pkey) em vez de subquery por linha.
create or replace function public.owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.user_id = (select auth.uid())
  );
$$;

-- Versão para paths do Storage: "<project_id>/<kind>/<arquivo>"
create or replace function public.owns_storage_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  begin
    v_id := split_part(p_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.owns_project(v_id);
end;
$$;

revoke all on function public.owns_project(uuid) from public;
revoke all on function public.owns_storage_path(text) from public;
grant execute on function public.owns_project(uuid) to authenticated;
grant execute on function public.owns_storage_path(text) to authenticated;

-- -------------------------------------------------------------------------
-- 2. RLS das tabelas: (select auth.uid()) avaliado 1x por query (initplan),
--    só para usuários autenticados.
-- -------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists projects_all_own on public.projects;
create policy projects_all_own on public.projects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists assets_all_own on public.assets;
create policy assets_all_own on public.assets
  for all to authenticated
  using (public.owns_project(project_id))
  with check (public.owns_project(project_id));

drop policy if exists scenes_all_own on public.scenes;
create policy scenes_all_own on public.scenes
  for all to authenticated
  using (public.owns_project(project_id))
  with check (public.owns_project(project_id));

drop policy if exists renders_all_own on public.renders;
create policy renders_all_own on public.renders
  for all to authenticated
  using (public.owns_project(project_id))
  with check (public.owns_project(project_id));

drop policy if exists ai_generations_all_own on public.ai_generations;
create policy ai_generations_all_own on public.ai_generations
  for all to authenticated
  using (public.owns_project(project_id))
  with check (public.owns_project(project_id));

-- -------------------------------------------------------------------------
-- 3. Storage: remove as policies temporárias "allow all" e trava por dono
-- -------------------------------------------------------------------------
drop policy if exists media_select_all on storage.objects;
drop policy if exists media_insert_all on storage.objects;
drop policy if exists media_update_all on storage.objects;
drop policy if exists media_delete_all on storage.objects;
drop policy if exists media_select_own on storage.objects;
drop policy if exists media_insert_own on storage.objects;
drop policy if exists media_update_own on storage.objects;
drop policy if exists media_delete_own on storage.objects;
drop policy if exists renders_select_own on storage.objects;
drop policy if exists renders_insert_own on storage.objects;
drop policy if exists renders_update_own on storage.objects;
drop policy if exists renders_delete_own on storage.objects;

create policy media_select_own on storage.objects
  for select to authenticated
  using (bucket_id in ('media', 'renders') and public.owns_storage_path(name));
create policy media_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id in ('media', 'renders') and public.owns_storage_path(name));
create policy media_update_own on storage.objects
  for update to authenticated
  using (bucket_id in ('media', 'renders') and public.owns_storage_path(name))
  with check (bucket_id in ('media', 'renders') and public.owns_storage_path(name));
create policy media_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id in ('media', 'renders') and public.owns_storage_path(name));

-- WAV no Windows/Chrome às vezes chega como audio/x-wav ou audio/wave
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/quicktime','video/x-msvideo','video/webm',
  'audio/mpeg','audio/wav','audio/x-wav','audio/wave','audio/mp4','audio/x-m4a','audio/aac'
]
where id = 'media';

-- -------------------------------------------------------------------------
-- 4. Índices guiados pelos padrões de acesso do app
-- -------------------------------------------------------------------------
-- Dashboard: where user_id = ? order by updated_at desc
drop index if exists public.idx_projects_user_id;
create index if not exists idx_projects_user_updated on public.projects (user_id, updated_at desc);
-- Baixa cardinalidade e sem query que filtre por eles: só custam escrita
drop index if exists public.idx_projects_status;
drop index if exists public.idx_projects_mode;
-- Redundantes com unique(project_id, order_index)
drop index if exists public.idx_scenes_project;
drop index if exists public.idx_scenes_order;
-- FKs "on delete set null": sem índice, apagar um asset faz seq scan em scenes
create index if not exists idx_scenes_video_asset on public.scenes (video_asset_id) where video_asset_id is not null;
create index if not exists idx_scenes_audio_asset on public.scenes (audio_asset_id) where audio_asset_id is not null;
create index if not exists idx_scenes_image_asset on public.scenes (image_asset_id) where image_asset_id is not null;
create index if not exists idx_renders_output_asset on public.renders (output_asset_id) where output_asset_id is not null;
-- dhash quase sempre null hoje: índice parcial
drop index if exists public.idx_assets_dhash;
create index if not exists idx_assets_dhash on public.assets (dhash) where dhash is not null;

-- -------------------------------------------------------------------------
-- 5. Integridade
-- -------------------------------------------------------------------------
-- unique deferrable: permite reordenar cenas num único UPDATE
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.scenes'::regclass and contype = 'u' and not condeferrable
      and conname = 'scenes_project_id_order_index_key'
  ) then
    alter table public.scenes drop constraint scenes_project_id_order_index_key;
    alter table public.scenes add constraint scenes_project_id_order_index_key
      unique (project_id, order_index) deferrable initially immediate;
  end if;
end $$;

alter table public.scenes drop constraint if exists scenes_audio_duration_positive;
alter table public.scenes add constraint scenes_audio_duration_positive
  check (audio_duration is null or audio_duration > 0) not valid;
alter table public.scenes validate constraint scenes_audio_duration_positive;

alter table public.assets drop constraint if exists assets_duration_nonneg;
alter table public.assets add constraint assets_duration_nonneg
  check (duration_seconds is null or duration_seconds >= 0) not valid;
alter table public.assets validate constraint assets_duration_nonneg;

-- width/height eram gravados no jsonb: promove para as colunas que já existem
update public.assets
set width = (metadata->>'width')::int,
    height = (metadata->>'height')::int
where width is null and metadata ? 'width' and metadata ? 'height';

-- -------------------------------------------------------------------------
-- 6. RPCs atômicas (security invoker → RLS continua valendo)
-- -------------------------------------------------------------------------

-- Substitui todas as cenas + mescla config do projeto numa transação só
create or replace function public.replace_scenes(p_project_id uuid, p_scenes jsonb, p_config_patch jsonb default '{}'::jsonb)
returns setof public.scenes
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.owns_project(p_project_id) then
    raise exception 'project not found' using errcode = '42501';
  end if;

  delete from public.scenes where project_id = p_project_id;

  return query
  insert into public.scenes (
    project_id, order_index, narration_text, media_type,
    image_asset_id, video_asset_id, audio_asset_id,
    audio_start, audio_duration, animation_type, transition_in,
    generated_in_flow, metadata
  )
  select
    p_project_id,
    (s->>'order_index')::int,
    coalesce(s->>'narration_text', ''),
    coalesce(s->>'media_type', 'video_clip'),
    nullif(s->>'image_asset_id', '')::uuid,
    nullif(s->>'video_asset_id', '')::uuid,
    nullif(s->>'audio_asset_id', '')::uuid,
    (s->>'audio_start')::real,
    (s->>'audio_duration')::real,
    s->>'animation_type',
    s->>'transition_in',
    coalesce((s->>'generated_in_flow')::boolean, false),
    coalesce(s->'metadata', '{}'::jsonb)
  from jsonb_array_elements(p_scenes) as s
  order by (s->>'order_index')::int
  returning *;

  if p_config_patch is not null and p_config_patch <> '{}'::jsonb then
    update public.projects set config = config || p_config_patch where id = p_project_id;
  end if;
end;
$$;

-- Reordena num único UPDATE (constraint adiada até o fim do statement)
create or replace function public.reorder_scenes(p_project_id uuid, p_scene_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  set constraints public.scenes_project_id_order_index_key deferred;
  update public.scenes s
  set order_index = x.ord - 1
  from unnest(p_scene_ids) with ordinality as x(id, ord)
  where s.id = x.id and s.project_id = p_project_id;
end;
$$;

-- Merge atômico de config (sem read-modify-write no cliente)
create or replace function public.patch_project_config(p_project_id uuid, p_patch jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  update public.projects set config = config || p_patch
  where id = p_project_id
  returning config;
$$;

revoke all on function public.replace_scenes(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.reorder_scenes(uuid, uuid[]) from public, anon;
revoke all on function public.patch_project_config(uuid, jsonb) from public, anon;
grant execute on function public.replace_scenes(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.reorder_scenes(uuid, uuid[]) to authenticated;
grant execute on function public.patch_project_config(uuid, jsonb) to authenticated;

-- Estatísticas frescas para o planner depois das mudanças
analyze public.projects;
analyze public.assets;
analyze public.scenes;

commit;

-- =========================================================================
-- ROLLBACK (manual, se precisar):
--   drop function if exists public.replace_scenes(uuid, jsonb, jsonb);
--   drop function if exists public.reorder_scenes(uuid, uuid[]);
--   drop function if exists public.patch_project_config(uuid, jsonb);
--   e re-executar o bloco de policies do 001_schema_v2.sql.
-- =========================================================================

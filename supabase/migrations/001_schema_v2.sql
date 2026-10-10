-- Video Assembler Web Platform - Schema v2.0
-- Criado: 10/10/2026
-- Baseado na spec v2.0

-- Extensões necessárias
create extension if not exists pgcrypto;

-- Função para atualizar updated_at automaticamente
create or replace function set_updated_at() 
returns trigger as $$
begin 
  new.updated_at = now(); 
  return new; 
end; 
$$ language plpgsql;

-- Função para criar perfil automaticamente quando um novo usuário se registra
create or replace function handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, name, preferences)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    '{}'
  );
  return new;
end;
$$ language plpgsql security definer;

-- =========================================================================
-- TABELA: profiles (1:1 com auth.users)
-- =========================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  avatar_url text,
  openai_api_key_enc text,    -- AES-GCM no backend, chave mestra em env
  gemini_api_key_enc text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'Perfil do usuário (1:1 com auth.users)';
comment on column profiles.openai_api_key_enc is 'Chave OpenAI criptografada (AES-GCM)';
comment on column profiles.gemini_api_key_enc is 'Chave Gemini criptografada (AES-GCM)';

-- =========================================================================
-- TABELA: projects
-- =========================================================================
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  mode_id text not null default 'news',
  idea text,
  reference_text text,
  outline jsonb,
  script text,
  aspect_ratio text not null default '16:9' check (aspect_ratio in ('16:9','9:16')),
  target_platforms text[] not null default array['youtube'],
  text_provider text not null default 'openai',
  text_model text not null default 'gpt-4o',
  tts_voice text,
  tts_style_prompt text,
  style_bible text,
  status text not null default 'draft',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table projects is 'Projetos de vídeo do usuário';
comment on column projects.mode_id is 'Modo de geração: news, shorts, custom';
comment on column projects.status is 'draft, script_ready, scenes_ready, prompts_ready, audio_ready, assets_uploaded, timeline_ready, rendering, done';

create index idx_projects_user_id on projects(user_id);
create index idx_projects_status on projects(status);
create index idx_projects_mode on projects(mode_id);

-- =========================================================================
-- TABELA: assets (imagens, vídeos, áudios)
-- =========================================================================
create table assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in ('image','video','audio')),
  origin text not null default 'upload' check (origin in ('upload','tts','render')),
  filename text not null,
  storage_path text not null,
  duration_seconds real,
  width int, 
  height int, 
  fps real,
  sample_rate int, 
  channels int,
  file_size_bytes bigint,
  dhash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table assets is 'Todos os assets de mídia (imagem, vídeo, áudio)';
comment on column assets.dhash is 'Perceptual hash para detecção de duplicatas';

create index idx_assets_project on assets(project_id, kind);
create index idx_assets_dhash on assets(dhash);

-- =========================================================================
-- TABELA: scenes
-- =========================================================================
create table scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  order_index int not null,
  section_index int,
  narration_text text not null,
  image_prompt text,
  video_prompt text,
  media_type text not null default 'video_clip' check (media_type in ('video_clip','still_image')),
  image_asset_id uuid references assets(id) on delete set null,
  video_asset_id uuid references assets(id) on delete set null,
  audio_asset_id uuid references assets(id) on delete set null,
  audio_start real,
  audio_duration real,
  animation_type text,
  transition_in text,
  generated_in_flow boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, order_index)
);

comment on table scenes is 'Cenas do projeto (entidade central)';
comment on column scenes.audio_duration is 'Fonte da verdade para duração da cena';

create index idx_scenes_project on scenes(project_id);
create index idx_scenes_order on scenes(project_id, order_index);

-- =========================================================================
-- TABELA: renders
-- =========================================================================
create table renders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null default 'full' check (kind in ('full','preview','short')),
  platform text,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','canceled')),
  progress int not null default 0 check (progress between 0 and 100),
  timeline_snapshot jsonb not null,
  output_asset_id uuid references assets(id),
  error_message text,
  started_at timestamptz, 
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table renders is 'Fila de renderização';
comment on column renders.timeline_snapshot is 'Congela timeline para reprodutibilidade';

create index idx_renders_project on renders(project_id);
create index idx_renders_status on renders(status);

-- =========================================================================
-- TABELA: ai_generations
-- =========================================================================
create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null,
  provider text not null,
  model text not null,
  prompt text not null,
  response text,
  tokens_in int, 
  tokens_out int, 
  cost_usd numeric(10,4),
  created_at timestamptz not null default now()
);

comment on table ai_generations is 'Histórico de chamadas de IA';
comment on column ai_generations.type is 'outline, script, scenes, image_prompt, video_prompt, metadata, tts';

create index idx_ai_generations_project on ai_generations(project_id, type);

-- =========================================================================
-- TRIGGERS: updated_at
-- =========================================================================
create trigger t_profiles_updated before update on profiles 
  for each row execute function set_updated_at();

create trigger t_projects_updated before update on projects 
  for each row execute function set_updated_at();

create trigger t_scenes_updated before update on scenes 
  for each row execute function set_updated_at();

-- =========================================================================
-- TRIGGER: Auto-criar perfil quando usuário se registra
-- =========================================================================
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- ROW LEVEL SECURITY (RLS)
-- =========================================================================

-- Profiles
alter table profiles enable row level security;

create policy profiles_select_own on profiles
  for select using (id = auth.uid());

create policy profiles_update_own on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- Projects
alter table projects enable row level security;

create policy projects_all_own on projects
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Assets
alter table assets enable row level security;

create policy assets_all_own on assets
  for all using (
    exists (
      select 1 from projects p 
      where p.id = assets.project_id 
      and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects p 
      where p.id = assets.project_id 
      and p.user_id = auth.uid()
    )
  );

-- Scenes
alter table scenes enable row level security;

create policy scenes_all_own on scenes
  for all using (
    exists (
      select 1 from projects p 
      where p.id = scenes.project_id 
      and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects p 
      where p.id = scenes.project_id 
      and p.user_id = auth.uid()
    )
  );

-- Renders
alter table renders enable row level security;

create policy renders_all_own on renders
  for all using (
    exists (
      select 1 from projects p 
      where p.id = renders.project_id 
      and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects p 
      where p.id = renders.project_id 
      and p.user_id = auth.uid()
    )
  );

-- AI Generations
alter table ai_generations enable row level security;

create policy ai_generations_all_own on ai_generations
  for all using (
    exists (
      select 1 from projects p 
      where p.id = ai_generations.project_id 
      and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects p 
      where p.id = ai_generations.project_id 
      and p.user_id = auth.uid()
    )
  );

-- =========================================================================
-- FIM DO SCHEMA V2.0
-- =========================================================================

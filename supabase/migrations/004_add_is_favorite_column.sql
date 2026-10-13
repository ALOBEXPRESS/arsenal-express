-- Add is_favorite column to assets table
-- Used to mark favorite assets for quick access in overlay/montagem settings

alter table assets
add column if not exists is_favorite boolean not null default false;

comment on column assets.is_favorite is 'Marks asset as favorite for quick access in overlays and montagem';

-- Create index for faster queries filtering by favorites
create index if not exists idx_assets_favorite on assets(project_id, is_favorite) where is_favorite = true;

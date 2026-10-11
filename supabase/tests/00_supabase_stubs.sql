-- Minimal stand-ins for Supabase's auth/storage schemas so migrations can be tested
-- on plain Postgres (docker). Mirrors how Supabase implements auth.uid().
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on functions to authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
-- the "temporary allow-all" policies that exist in the live project today
create policy media_select_all on storage.objects for select to public using (bucket_id = 'media');
create policy media_insert_all on storage.objects for insert to public with check (bucket_id = 'media');
create policy media_update_all on storage.objects for update to public using (bucket_id = 'media');
create policy media_delete_all on storage.objects for delete to public using (bucket_id = 'media');

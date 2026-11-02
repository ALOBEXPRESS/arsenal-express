alter table public.assets alter column project_id drop not null;
alter table public.assets add column library_user_id uuid references auth.users(id) on delete cascade;
create index assets_library_user_idx on public.assets(library_user_id) where library_user_id is not null;
update public.assets a set library_user_id = p.user_id, project_id = null from public.projects p where a.project_id=p.id and a.metadata->>'original_type'='asset';
create function public.assign_extra_asset_library() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='UPDATE' and old.library_user_id is not null then
    if new.library_user_id is distinct from old.library_user_id or new.project_id is not null or new.metadata->>'original_type' is distinct from 'asset' then raise exception 'Biblioteca compartilhada não pode mudar de proprietário'; end if;
  elsif new.metadata->>'original_type'='asset' then
    select user_id into new.library_user_id from public.projects where id=new.project_id;
    if new.library_user_id is null then raise exception 'Projeto inválido para asset extra'; end if;
    new.project_id := null;
  else
    new.library_user_id := null;
  end if;
  return new;
end $$;
create trigger assign_extra_asset_library before insert or update on public.assets for each row execute function public.assign_extra_asset_library();
drop policy assets_all_own on public.assets;
create policy assets_all_own on public.assets for all to authenticated
using ((library_user_id=auth.uid() and project_id is null) or (library_user_id is null and public.owns_project(project_id)))
with check ((library_user_id=auth.uid() and project_id is null and metadata->>'original_type'='asset') or (library_user_id is null and public.owns_project(project_id)));
create policy media_library_select on storage.objects for select to authenticated using (bucket_id='media' and exists(select 1 from public.assets a where a.storage_path=name and a.library_user_id=auth.uid()));
create policy media_library_delete on storage.objects for delete to authenticated using (bucket_id='media' and exists(select 1 from public.assets a where a.storage_path=name and a.library_user_id=auth.uid()));

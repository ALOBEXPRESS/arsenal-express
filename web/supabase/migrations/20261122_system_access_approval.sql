-- Apply in the Arsenal Express project's SQL Editor before deploying the app gate.
begin;
create schema if not exists private;
create table if not exists public.system_access_allowlist (
  email text primary key check (email=lower(btrim(email)) and length(email) between 5 and 254),
  is_enabled boolean not null default true,
  authorized_at timestamptz not null default now(),
  authorized_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);
alter table public.system_access_allowlist enable row level security;
revoke all on public.system_access_allowlist from public,anon,authenticated;
grant select on public.system_access_allowlist to authenticated;
grant all on public.system_access_allowlist to service_role;

create or replace function private.system_access_for_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null
    and (lower(u.email)='empresaalob@gmail.com' or exists(select 1 from public.system_access_allowlist a where a.email=lower(u.email) and a.is_enabled)));
$$;
revoke all on function private.system_access_for_user(uuid) from public,anon,authenticated;

create or replace function public.is_system_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users where id=(select auth.uid()) and lower(email)='empresaalob@gmail.com' and email_confirmed_at is not null);
$$;
create or replace function public.has_system_access()
returns boolean language sql stable security definer set search_path='' as $$
  select private.system_access_for_user((select auth.uid()));
$$;
create or replace function public.system_access_status()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('allowed',public.has_system_access(),'isAdmin',public.is_system_admin());
$$;
revoke all on function public.is_system_admin(),public.has_system_access(),public.system_access_status() from public,anon;
grant execute on function public.is_system_admin(),public.has_system_access(),public.system_access_status() to authenticated;

drop policy if exists system_allowlist_admin_read on public.system_access_allowlist;
create policy system_allowlist_admin_read on public.system_access_allowlist for select to authenticated using ((select public.is_system_admin()));

create or replace function public.grant_system_access(p_email text)
returns void language plpgsql security definer set search_path='' as $$
declare v_email text := lower(btrim(p_email));
begin
  if not public.is_system_admin() then raise insufficient_privilege using message='Apenas o administrador pode autorizar acesso'; end if;
  if v_email is null or length(v_email) not between 5 and 254 or position('@' in v_email)<2 or v_email ~ '[[:space:]]' or v_email ~ '@.*@' then raise exception 'E-mail inválido'; end if;
  insert into public.system_access_allowlist(email,is_enabled,authorized_by) values(v_email,true,auth.uid())
  on conflict(email) do update set is_enabled=true,authorized_at=now(),authorized_by=auth.uid(),revoked_at=null,revoked_by=null;
end $$;
create or replace function public.revoke_system_access(p_email text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_system_admin() then raise insufficient_privilege using message='Apenas o administrador pode revogar acesso'; end if;
  if lower(btrim(p_email))='empresaalob@gmail.com' then raise exception 'O administrador não pode ser revogado'; end if;
  update public.system_access_allowlist set is_enabled=false,revoked_at=now(),revoked_by=auth.uid() where email=lower(btrim(p_email));
end $$;
revoke all on function public.grant_system_access(text),public.revoke_system_access(text) from public,anon;
grant execute on function public.grant_system_access(text),public.revoke_system_access(text) to authenticated;

-- RESTRICTIVE policies add the approval gate without replacing existing ownership policies.
do $$ declare r record; begin
  for r in select schemaname,tablename from pg_tables where schemaname='public' and rowsecurity and tablename<>'system_access_allowlist' loop
    execute format('drop policy if exists system_approval_required on %I.%I',r.schemaname,r.tablename);
    execute format('create policy system_approval_required on %I.%I as restrictive for all to authenticated using ((select public.has_system_access())) with check ((select public.has_system_access()))',r.schemaname,r.tablename);
  end loop;
end $$;
drop policy if exists system_approval_required on storage.objects;
create policy system_approval_required on storage.objects as restrictive for all to authenticated
using ((select public.has_system_access())) with check ((select public.has_system_access()));

-- Protect direct Data API/RPC calls, including older SECURITY DEFINER RPCs.
create or replace function public.check_system_access_request()
returns void language plpgsql security definer set search_path='' as $$
declare claims jsonb := coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
begin
  if claims->>'role'='authenticated' and current_setting('request.path',true)='/rpc/system_access_status' then return; end if;
  if claims->>'role' is distinct from 'service_role' and not public.has_system_access() then
    raise sqlstate 'PT403' using message='Acesso não autorizado. Solicite autorização a empresaalob@gmail.com.';
  end if;
end $$;
revoke all on function public.check_system_access_request() from public;
grant execute on function public.check_system_access_request() to anon,authenticated,service_role;
do $$ declare existing text; begin
  select option into existing from pg_roles r cross join lateral unnest(r.rolconfig) as option
    where r.rolname='authenticator' and option like 'pgrst.db_pre_request=%';
  if existing is not null and existing not in ('pgrst.db_pre_request=public.check_system_access_request','pgrst.db_pre_request=') then
    raise exception 'Existing Data API pre-request hook must be composed with check_system_access_request before applying this migration';
  end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.check_system_access_request';
notify pgrst,'reload config';
notify pgrst,'reload schema';

-- Enable these TWO functions in Supabase Authentication > Hooks after applying SQL.
create or replace function public.system_access_token_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.system_access_for_user((event->>'user_id')::uuid) then
    raise insufficient_privilege using message='Acesso não autorizado. Solicite autorização a empresaalob@gmail.com.';
  end if;
  return jsonb_build_object('claims',event->'claims');
end $$;
create or replace function public.system_access_signup_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text := lower(btrim(event->'user'->>'email'));
begin
  if v_email='empresaalob@gmail.com' or exists(select 1 from public.system_access_allowlist where email=v_email and is_enabled) then return '{}'::jsonb; end if;
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Solicite autorização a empresaalob@gmail.com antes de criar sua conta.'));
end $$;
revoke all on function public.system_access_token_hook(jsonb),public.system_access_signup_hook(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.system_access_token_hook(jsonb),public.system_access_signup_hook(jsonb) to supabase_auth_admin;
commit;

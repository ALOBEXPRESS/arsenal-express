begin;

create table public.system_access_requests (

 id uuid primary key default gen_random_uuid(),

 email text not null,

 name text not null,

 status text not null default 'pending' check(status in ('pending','approved','rejected')),

 created_at timestamptz not null default now(),

 reviewed_at timestamptz,

 reviewed_by uuid references auth.users(id) on delete set null

);

create index on public.system_access_requests(email,created_at desc);

alter table public.system_access_requests enable row level security;

revoke all on public.system_access_requests from public,anon,authenticated;

grant select on public.system_access_requests to authenticated;

create policy admin_read on public.system_access_requests for select to authenticated using ((select public.is_system_admin()));



create function public.submit_access_request(p_email text,p_name text) returns uuid

language plpgsql security definer set search_path='' as $$

declare v_email text:=lower(btrim(p_email)); v_name text:=btrim(p_name); v_id uuid;

begin

 if v_email is null or length(v_email) not between 5 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or v_name is null or length(v_name) not between 2 and 100 then raise exception 'Dados inválidos'; end if;

 perform pg_advisory_xact_lock(87234012);

 if exists(select 1 from public.system_access_requests where email=v_email and created_at>now()-interval '1 hour') or (select count(*) from public.system_access_requests where created_at>now()-interval '1 hour')>=100 then raise exception 'Aguarde antes de enviar outra solicitação. Use seu código para consultar o pedido anterior.'; end if;

 insert into public.system_access_requests(email,name) values(v_email,v_name) returning id into v_id;

 return v_id;

end $$;

create function public.access_request_status(p_id uuid) returns text

language sql stable security definer set search_path='' as $$

 select status from public.system_access_requests where id=p_id;

$$;

create function public.review_access_request(p_id uuid,p_approve boolean) returns void

language plpgsql security definer set search_path='' as $$

declare v_email text;

begin

 if not public.is_system_admin() then raise insufficient_privilege; end if;

 select email into v_email from public.system_access_requests where id=p_id and status='pending' for update;

 if not found then raise exception 'Pedido não está pendente'; end if;

 if p_approve then perform public.grant_system_access(v_email); end if;

 update public.system_access_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid() where id=p_id;

end $$;

revoke all on function public.submit_access_request(text,text),public.access_request_status(uuid),public.review_access_request(uuid,boolean) from public,anon,authenticated;

grant execute on function public.submit_access_request(text,text),public.access_request_status(uuid) to anon,authenticated;

grant execute on function public.review_access_request(uuid,boolean) to authenticated;

create or replace function public.check_system_access_request()

returns void language plpgsql security definer set search_path='' as $$

declare claims jsonb := coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;

begin

 if current_setting('request.path',true) in ('/rpc/submit_access_request','/rpc/access_request_status') then return; end if;

 if claims->>'role'='authenticated' and current_setting('request.path',true)='/rpc/system_access_status' then return; end if;

 if claims->>'role' is distinct from 'service_role' and not public.has_system_access() then

 raise sqlstate 'PT403' using message='Acesso não autorizado. Solicite acesso pelo formulário do sistema.';

 end if;

end $$;

create or replace function public.system_access_signup_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text := lower(btrim(event->'user'->>'email'));
begin
  if v_email='empresaalob@gmail.com' or exists(select 1 from public.system_access_allowlist where email=v_email and is_enabled) then return '{}'::jsonb; end if;
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Solicite acesso pelo formulário do sistema antes de criar sua conta.'));
end $$;

notify pgrst,'reload schema';

commit;


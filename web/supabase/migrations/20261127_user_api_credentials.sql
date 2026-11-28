-- Secrets remain encrypted in Supabase Vault. Only trusted server code can access them.
revoke all on vault.secrets,vault.decrypted_secrets from public,anon,authenticated;
create table public.user_api_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check(provider in ('openai','google')),
  secret_id uuid not null references vault.secrets(id) on delete cascade,
  last_four text not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,provider)
);
alter table public.user_api_credentials enable row level security;
revoke all on public.user_api_credentials from public,anon,authenticated;
grant select,insert,update,delete on public.user_api_credentials to service_role;

create function public.save_user_api_credential(p_user_id uuid,p_provider text,p_key text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare secret_uuid uuid;
begin
  if p_provider not in ('openai','google') or p_provider is null then raise exception 'Invalid provider'; end if;
  if p_key is null or length(p_key)<20 or length(p_key)>1024 or p_key ~ '\s' then raise exception 'Invalid key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_provider,0));
  select secret_id into secret_uuid from public.user_api_credentials where user_id=p_user_id and provider=p_provider;
  if secret_uuid is null then
    secret_uuid:=vault.create_secret(p_key);
    insert into public.user_api_credentials(user_id,provider,secret_id,last_four) values(p_user_id,p_provider,secret_uuid,right(p_key,4));
  else
    perform vault.update_secret(secret_uuid,p_key);
    update public.user_api_credentials set last_four=right(p_key,4),updated_at=now() where user_id=p_user_id and provider=p_provider;
  end if;
end $$;

create function public.read_user_api_credential(p_user_id uuid,p_provider text)
returns text language sql security definer set search_path=public,pg_temp as $$
  select v.decrypted_secret from public.user_api_credentials c join vault.decrypted_secrets v on v.id=c.secret_id where c.user_id=p_user_id and c.provider=p_provider;
$$;

create function public.remove_user_api_credential(p_user_id uuid,p_provider text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare secret_uuid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_provider,0));
  select secret_id into secret_uuid from public.user_api_credentials where user_id=p_user_id and provider=p_provider;
  delete from public.user_api_credentials where user_id=p_user_id and provider=p_provider;
  if secret_uuid is not null then delete from vault.secrets where id=secret_uuid; end if;
end $$;
revoke all on function public.save_user_api_credential(uuid,text,text) from public,anon,authenticated;
revoke all on function public.read_user_api_credential(uuid,text) from public,anon,authenticated;
revoke all on function public.remove_user_api_credential(uuid,text) from public,anon,authenticated;
grant execute on function public.save_user_api_credential(uuid,text,text) to service_role;
grant execute on function public.read_user_api_credential(uuid,text) to service_role;
grant execute on function public.remove_user_api_credential(uuid,text) to service_role;

-- Also erase the secret if its owner account is removed through Auth.
create function public.cleanup_user_api_credential() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from vault.secrets where id=old.secret_id;
  return old;
end $$;
revoke all on function public.cleanup_user_api_credential() from public,anon,authenticated;
create trigger cleanup_user_api_credential after delete on public.user_api_credentials for each row execute function public.cleanup_user_api_credential();

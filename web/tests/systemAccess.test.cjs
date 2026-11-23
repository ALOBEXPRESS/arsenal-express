const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('access approval, revocation, RLS, administrator checks and Auth hooks', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create role authenticator; create role supabase_auth_admin;
      create schema auth; create schema storage;
      grant usage on schema public,auth,storage to anon,authenticated,service_role,supabase_auth_admin;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.objects(id text primary key);
      alter table storage.objects enable row level security;
      create table public.gated_documents(id int primary key,owner_id uuid);
      alter table public.gated_documents enable row level security;
      grant select,insert,update,delete on public.gated_documents to authenticated;
      create policy own on public.gated_documents for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
      insert into auth.users values
        ('${uid(1)}','empresaalob@gmail.com',now(),'{}'),
        ('${uid(2)}','approved@example.com',now(),'{}'),
        ('${uid(3)}','blocked@example.com',now(),'{"role":"admin","email":"empresaalob@gmail.com"}'),
        ('${uid(4)}','unconfirmed@example.com',null,'{}');
      insert into public.gated_documents values(1,'${uid(1)}'),(2,'${uid(2)}'),(3,'${uid(3)}');
    `)
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261122_system_access_approval.sql'), 'utf8'))
    const actor = async (id, role = 'authenticated', requestPath = '/gated_documents') => {
      await db.exec('reset role; set role ' + role)
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('request.path',$3,false)", [id || '', JSON.stringify({ sub: id, role }), requestPath])
    }
    const status = async () => (await db.query('select public.system_access_status() as value')).rows[0].value
    await actor(uid(1))
    assert.deepEqual(await status(), { allowed: true, isAdmin: true })
    await db.query('select public.grant_system_access($1)', [' Approved@Example.Com '])
    await db.query('select public.grant_system_access($1)', ['unconfirmed@example.com'])
    await actor(uid(2))
    assert.deepEqual(await status(), { allowed: true, isAdmin: false })
    assert.equal((await db.query('select * from public.gated_documents')).rows.length, 1)
    await assert.rejects(db.query("select public.grant_system_access('blocked@example.com')"), /administrador/)
    await assert.rejects(db.query("insert into public.system_access_allowlist(email) values('blocked@example.com')"), /permission denied/)
    await actor(uid(3))
    assert.deepEqual(await status(), { allowed: false, isAdmin: false })
    assert.equal((await db.query('select * from public.gated_documents')).rows.length, 0)
    await assert.rejects(db.query('select public.check_system_access_request()'), error => error.code === 'PT403')
    await actor(uid(3), 'authenticated', '/rpc/system_access_status')
    await db.query('select public.check_system_access_request()')
    await actor(uid(4))
    assert.equal((await status()).allowed, false)
    await actor(uid(1))
    await assert.rejects(db.query("select public.revoke_system_access('empresaalob@gmail.com')"), /administrador/)
    await db.query("select public.revoke_system_access('approved@example.com')")
    await actor(uid(2))
    assert.equal((await status()).allowed, false)
    assert.equal((await db.query('select * from public.gated_documents')).rows.length, 0)
    await actor(null, 'anon')
    await assert.rejects(db.query('select public.check_system_access_request()'), error => error.code === 'PT403')
    await actor(null, 'supabase_auth_admin')
    const signup = await db.query('select public.system_access_signup_hook($1::jsonb) as value', [JSON.stringify({ user: { email: 'blocked@example.com' } })])
    assert.equal(signup.rows[0].value.error.http_code, 403)
    await assert.rejects(db.query('select public.system_access_token_hook($1::jsonb)', [JSON.stringify({ user_id: uid(2), claims: {} })]), /autorizado/)
    const ownerToken = await db.query('select public.system_access_token_hook($1::jsonb) as value', [JSON.stringify({ user_id: uid(1), claims: { sub: uid(1) } })])
    assert.deepEqual(ownerToken.rows[0].value.claims, { sub: uid(1) })
  } finally { await db.close() }
})

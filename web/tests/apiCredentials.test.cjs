const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite')
test('personal credentials are server-only, isolated by account/provider, rotated without duplicates and erased on account deletion',async()=>{
 const db=new PGlite()
 try{
   // Vault is mocked locally; encryption itself is supplied by the production extension.
   await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
     create table auth.users(id uuid primary key);
     create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);
     create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
     create function vault.create_secret(new_secret text) returns uuid language sql as $$insert into vault.secrets(secret) values(new_secret) returning id$$;
     create function vault.update_secret(secret_id uuid,new_secret text) returns void language sql as $$update vault.secrets set secret=new_secret where id=secret_id$$;
     insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`)
   await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261127_user_api_credentials.sql'),'utf8'))
   const one='00000000-0000-0000-0000-000000000001',two='00000000-0000-0000-0000-000000000002'
   await db.exec('set role service_role')
   const save=(id,provider,key)=>db.query('select save_user_api_credential($1,$2,$3)',[id,provider,key])
   const read=async(id,provider)=>(await db.query('select read_user_api_credential($1,$2) as value',[id,provider])).rows[0].value
   await save(one,'openai','fake-credential-user-one-only')
   await save(two,'openai','fake-credential-user-two-only')
   await save(one,'google','fake-credential-google-only')
   assert.equal(await read(one,'google'),'fake-credential-google-only')
   assert.equal(await read(two,'google'),null)
   await save(one,'openai','fake-credential-rotated-user-one')
   assert.equal(await read(one,'openai'),'fake-credential-rotated-user-one')
   assert.equal(await read(two,'openai'),'fake-credential-user-two-only')
   assert.equal((await db.query('select count(*)::int as n from user_api_credentials')).rows[0].n,3)
   for(const role of ['anon','authenticated']){
     await db.exec('reset role;set role '+role)
     await assert.rejects(read(one,'openai'),/permission denied/)
     await assert.rejects(save(one,'openai','fake-credential-forbidden'),/permission denied/)
     await assert.rejects(db.query('select * from user_api_credentials'),/permission denied/)
     await assert.rejects(db.query('select remove_user_api_credential($1,$2)',[one,'openai']),/permission denied/)
   }
   await db.exec('reset role;set role service_role')
   await assert.rejects(save(one,'other','fake-credential-invalid-provider'),/Invalid provider/)
   await db.query('select remove_user_api_credential($1,$2)',[one,'openai'])
   assert.equal(await read(one,'openai'),null)
   await db.exec('reset role')
   assert.equal((await db.query('select count(*)::int as n from vault.secrets')).rows[0].n,2)
   await db.query('delete from auth.users where id=$1',[one])
   assert.equal((await db.query('select count(*)::int as n from vault.secrets')).rows[0].n,1)
 }finally{await db.close()}
})

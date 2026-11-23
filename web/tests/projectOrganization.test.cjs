const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

const sql = fs.readFileSync(path.join(__dirname, '../scripts/organize-mountain-projects.sql'), 'utf8')
const sourceIds = [...sql.matchAll(/'([a-f0-9-]{36})'/g)].map(m => m[1])
const owner = '00000000-0000-0000-0000-000000000001'
const stranger = '00000000-0000-0000-0000-000000000002'

test('organization preserves scene edits, media identities and per-sequence settings; retry is idempotent', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create table projects(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users,
        name text, mode_id text, status text, aspect_ratio text, config jsonb);
      create table assets(id uuid primary key default gen_random_uuid(), project_id uuid references projects,
        library_user_id uuid references auth.users, kind text, is_favorite boolean default false,
        metadata jsonb, storage_path text);
      create table scenes(id uuid primary key default gen_random_uuid(), project_id uuid references projects,
        order_index integer, metadata jsonb, video_asset_id uuid references assets,
        unique(project_id, order_index));
      insert into auth.users values('${owner}','empresaalob@gmail.com',now()),('${stranger}','other@example.com',now());
    `)
    // Use the production ownership trigger to exercise favorite-image promotion.
    const library = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261102_account_extra_asset_library.sql'), 'utf8')
    await db.exec(library.slice(library.indexOf('create function'), library.indexOf('drop policy')))
    const originals = []
    for (const [index, id] of sourceIds.entries()) {
      const config = { output_format: index % 2 ? '16:9' : '9:16', sync: { marker: index }, subprojects: [{
        id: 'main', name: 'Sequência 1', narration_track: [{ asset_id: 'narration-' + index, start: 0, duration: 5, volume: 0.5 }],
        overlays: [{ id: 'caption-' + index, text_content: 'Legenda ' + index }], audio_clips: [], image_overlays: [], adjustments: [],
      }] }
      await db.query('insert into projects(id,user_id,name,config) values($1,$2,$3,$4)', [id, owner, 'Episode ' + index, config])
      const asset = (await db.query('insert into assets(project_id,kind,metadata,storage_path) values($1,$2,$3,$4) returning id', [id, 'video', { custom: index }, id + '/original.mp4'])).rows[0]
      const scene = (await db.query('insert into scenes(project_id,order_index,metadata,video_asset_id) values($1,0,$2,$3) returning id', [id, { sub: 'main', props: { in_point: 1, trim: 5, speed: 1.2, x: 0.1 } }, asset.id])).rows[0]
      originals.push({ scene: scene.id, asset: asset.id, config })
    }
    const other = (await db.query("insert into projects(user_id,name,config) values($1,'Unrelated','{}') returning id", [owner])).rows[0].id
    const otherUser = (await db.query("insert into projects(user_id,name,config) values($1,'Other user','{}') returning id", [stranger])).rows[0].id
    await db.query("insert into assets(project_id,kind,is_favorite,metadata) values($1,'image',true,'{}'),($2,'image',true,'{}')", [other, otherUser])
    await db.exec(sql)
    const target = (await db.query("select * from projects where config->>'organization_version'='mountain-sequences-v1'")).rows[0]
    assert.equal(target.name, 'Mestre da Montanha')
    const subs = target.config.subprojects
    assert.equal(subs.length, 7)
    assert.equal(new Set(subs.map(s => s.id)).size, 7)
    for (const [index, original] of originals.entries()) {
      const scene = (await db.query('select * from scenes where id=$1', [original.scene])).rows[0]
      assert.equal(scene.project_id, target.id)
      assert.equal(scene.metadata.sub, subs[index].id)
      assert.deepEqual(scene.metadata.props, { in_point: 1, trim: 5, speed: 1.2, x: 0.1 })
      assert.equal(scene.video_asset_id, original.asset)
      const asset = (await db.query('select * from assets where id=$1', [original.asset])).rows[0]
      assert.equal(asset.project_id, target.id)
      assert.equal(asset.metadata.sequence_id, subs[index].id)
      assert.equal(asset.storage_path, sourceIds[index] + '/original.mp4')
      assert.deepEqual(subs[index].source_settings.sync, original.config.sync)
      assert.deepEqual(subs[index].overlays, original.config.subprojects[0].overlays)
      assert.deepEqual(subs[index].narration_track, original.config.subprojects[0].narration_track)
    }
    assert.equal(target.config.organization_backup.scene_links.length, 7)
    assert.equal(target.config.organization_backup.favorite_images.length, 1)
    assert.equal((await db.query("select count(*)::int as n from projects where config ? 'archived_into'")).rows[0].n, 7)
    assert.deepEqual((await db.query('select config from projects where id=$1', [other])).rows[0].config, {})
    assert.equal((await db.query('select count(*)::int as n from assets where library_user_id=$1', [owner])).rows[0].n, 1)
    assert.equal((await db.query('select count(*)::int as n from assets where project_id=$1', [otherUser])).rows[0].n, 1)
    await db.exec(sql)
    assert.equal((await db.query("select count(*)::int as n from projects where config->>'organization_version'='mountain-sequences-v1'")).rows[0].n, 1)
    assert.equal((await db.query('select count(*)::int as n from scenes')).rows[0].n, 7)
  } finally {
    await db.close()
  }
})

-- Behavioural tests for migration 002 (run after 001 + 002). Raises on any failure.
\set ON_ERROR_STOP on

-- two users
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test'),
  ('22222222-2222-2222-2222-222222222222', 'b@test');

-- grants (Supabase does this by default for the API roles)
grant all on all tables in schema public to authenticated;

-- ---------- as user A ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.projects (id, user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A project');
insert into public.assets (id, project_id, kind, filename, storage_path, duration_seconds) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'video', 'v1.mp4', 'aaaaaaaa-0000-0000-0000-000000000001/video/v1.mp4', 8),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'video', 'v2.mp4', 'aaaaaaaa-0000-0000-0000-000000000001/video/v2.mp4', 10);

-- replace_scenes: atomic insert + config merge
select count(*) as inserted from public.replace_scenes(
  'aaaaaaaa-0000-0000-0000-000000000001',
  '[{"order_index":0,"narration_text":"Cena 1","video_asset_id":"a0000000-0000-0000-0000-000000000001","audio_duration":5.6,"animation_type":"zoom_suave","transition_in":"cut"},
    {"order_index":1,"narration_text":"Cena 2","video_asset_id":"a0000000-0000-0000-0000-000000000002","audio_duration":7.1,"animation_type":"quicar","transition_in":"fusao"}]'::jsonb,
  '{"sync":{"variable_rhythm":true}}'::jsonb
);
do $$ begin
  assert (select count(*) from public.scenes) = 2, 'replace_scenes should insert 2';
  assert (select config->'sync'->>'variable_rhythm' from public.projects) = 'true', 'config patch merged';
end $$;

-- replace again (idempotent replace, not append)
select count(*) from public.replace_scenes('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"order_index":0,"narration_text":"Only","audio_duration":3}]'::jsonb);
do $$ begin assert (select count(*) from public.scenes) = 1, 'replace must delete old scenes'; end $$;

-- restore 3 scenes and reorder in one statement (deferrable unique)
select count(*) from public.replace_scenes('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"order_index":0,"narration_text":"s0","audio_duration":1},{"order_index":1,"narration_text":"s1","audio_duration":1},{"order_index":2,"narration_text":"s2","audio_duration":1}]'::jsonb);
select public.reorder_scenes('aaaaaaaa-0000-0000-0000-000000000001',
  array(select id from public.scenes order by order_index desc));
do $$ begin
  assert (select string_agg(narration_text, ',' order by order_index) from public.scenes) = 's2,s1,s0', 'reorder';
end $$;

-- patch_project_config keeps other keys
select public.patch_project_config('aaaaaaaa-0000-0000-0000-000000000001', '{"narration_track":[]}'::jsonb);
do $$ begin
  assert (select config ? 'sync' and config ? 'narration_track' from public.projects), 'patch merge keeps keys';
end $$;

-- storage: owner may write inside own project folder only
insert into storage.objects (bucket_id, name) values ('media', 'aaaaaaaa-0000-0000-0000-000000000001/video/ok.mp4');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('media', 'not-a-uuid/video/x.mp4');
    raise exception 'FAIL: wrote outside own folder';
  exception when insufficient_privilege then null;  -- RLS violation expected
  end;
end $$;

-- invalid values rejected
do $$ begin
  begin
    update public.scenes set audio_duration = -1;
    raise exception 'FAIL: negative duration accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------- as user B (attacker) ----------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.projects) = 0, 'B must not see A projects';
  assert (select count(*) from public.scenes) = 0, 'B must not see A scenes';
  assert (select count(*) from public.assets) = 0, 'B must not see A assets';
  assert (select count(*) from storage.objects) = 0, 'B must not see A files';
end $$;
do $$ begin
  begin
    perform public.replace_scenes('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb);
    raise exception 'FAIL: B replaced A scenes';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('media', 'aaaaaaaa-0000-0000-0000-000000000001/video/evil.mp4');
    raise exception 'FAIL: B uploaded into A folder';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.projects set name = 'hacked';  -- silently affects 0 rows under RLS
reset role;
do $$ begin
  assert (select name from public.projects) = 'A project', 'B must not update A project';
  assert (select count(*) from public.scenes) = 3, 'A scenes intact after B attempts';
end $$;

-- ---------- anon ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform public.replace_scenes('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb);
    raise exception 'FAIL: anon could call RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- planner uses the new index for the dashboard query
set enable_seqscan = off;
explain (costs off) select * from public.projects where user_id = '11111111-1111-1111-1111-111111111111' order by updated_at desc;

select 'ALL TESTS PASSED' as result;

-- Explicit one-time organization for empresaalob@gmail.com. Transactional and idempotent.
begin;
do $$
declare
 owner_id uuid; target_id uuid; p record; s record; a record; sub jsonb; list jsonb; next_sub text; first_sub text; original_sub text;
 sequence_list jsonb:='[]'::jsonb; scene_position integer:=0; sequence_count integer:=0; backup jsonb;
 source_ids uuid[]:=array['ff2291a1-7653-47fa-ac21-e3e5624aa60c','d142322c-2e6b-46f1-9b45-fa18c66bb50c','4f866635-a6a6-4766-8706-d7fb66d00e8b','8d8e9925-44ba-459c-bf48-9fcdc3e43d9b','b8063d8f-e503-485c-b517-b9747c728985','cc5e143d-6e9e-480d-bc5b-2db248a5cf95','3ada117d-cf59-4f38-8a3e-884c1112edfa']::uuid[];
 mapping jsonb:='{}'::jsonb;
begin
 select id into strict owner_id from auth.users where lower(email)='empresaalob@gmail.com' and email_confirmed_at is not null;
 perform pg_advisory_xact_lock(87234013);
 if exists(select 1 from public.projects where user_id=owner_id and config->>'organization_version'='mountain-sequences-v1') then raise notice 'Already organized'; return; end if;
 if (select count(*) from public.projects where id=any(source_ids) and user_id=owner_id)<>7 then raise exception 'Source projects do not match the verified owner'; end if;
 perform 1 from public.projects where id=any(source_ids) for update;
 select jsonb_build_object(
 'projects',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'config',config)) from public.projects where id=any(source_ids)),
 'scene_links',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'project_id',project_id,'order_index',order_index,'metadata',metadata)),'[]'::jsonb) from public.scenes where project_id=any(source_ids)),
 'favorite_images',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'project_id',x.project_id,'metadata',x.metadata)),'[]'::jsonb) from public.assets x join public.projects owner_project on owner_project.id=x.project_id where owner_project.user_id=owner_id and x.kind='image' and x.is_favorite=true and x.library_user_id is null),
 'asset_links',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'project_id',project_id,'sequence_id',metadata->'sequence_id')),'[]'::jsonb) from public.assets where project_id=any(source_ids))) into backup;
 insert into public.projects(user_id,name,mode_id,status,aspect_ratio,config) values(owner_id,'Mestre da Montanha','custom','draft','9:16',jsonb_build_object('output_format','auto','fps',30,'sequence_creation_required',false,'organization_version','mountain-sequences-v1','organization_backup',backup)) returning id into target_id;
 for p in select * from public.projects where id=any(source_ids) order by array_position(source_ids,id) loop
   list:=p.config->'subprojects';
   if list is null or jsonb_array_length(list)=0 then list:=jsonb_build_array(jsonb_build_object('id','main','name','Sequência 1','narration_track',coalesce(p.config->'narration_track','[]'::jsonb),'overlays',coalesce(p.config->'overlays','[]'::jsonb),'audio_clips',coalesce(p.config->'audio_clips','[]'::jsonb),'image_overlays','[]'::jsonb,'adjustments','[]'::jsonb)); end if;
   first_sub:=null;mapping:='{}'::jsonb;
   for sub in select value from jsonb_array_elements(list) loop
     original_sub:=coalesce(nullif(sub->>'id',''),'main');
     next_sub:=case when sequence_count=0 then 'main' else p.id::text||':'||original_sub end;
     if first_sub is null then first_sub:=next_sub; end if;
     mapping:=mapping||jsonb_build_object(original_sub,next_sub);
     sub:=sub||jsonb_build_object('id',next_sub,'name',case when jsonb_array_length(list)=1 then case when p.id=source_ids[1] then 'Mestre da Montanha – Episódio 01' else p.name end else p.name||' / '||coalesce(sub->>'name','Sequência') end,'source_settings',coalesce(p.config,'{}'::jsonb)-'subprojects'-'narration_track'-'overlays'-'audio_clips'-'image_overlays'-'adjustments','source_project_id',p.id);
     sequence_list:=sequence_list||jsonb_build_array(sub);sequence_count:=sequence_count+1;
   end loop;
   for s in select * from public.scenes where project_id=p.id order by order_index,id for update loop
     next_sub:=coalesce(mapping->>coalesce(s.metadata->>'sub','main'),first_sub);
     update public.scenes set project_id=target_id,order_index=scene_position,metadata=coalesce(s.metadata,'{}'::jsonb)||jsonb_build_object('sub',next_sub) where id=s.id;
     scene_position:=scene_position+1;
   end loop;
   update public.assets set project_id=target_id,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('sequence_id',first_sub) where project_id=p.id;
   update public.projects set config=coalesce(config,'{}'::jsonb)||jsonb_build_object('archived_into',target_id,'archived_sequence',first_sub) where id=p.id;
 end loop;
 update public.projects set config=config||jsonb_build_object('subprojects',sequence_list) where id=target_id;
 -- Promote favorite images to the existing account library without copying files.
 for a in select x.* from public.assets x join public.projects owner_project on owner_project.id=x.project_id where owner_project.user_id=owner_id and x.kind='image' and x.is_favorite=true and x.library_user_id is null loop
   update public.assets set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('original_type','asset','shared_image',true) where id=a.id;
 end loop;
 if (select count(*) from public.scenes where project_id=target_id)<>jsonb_array_length(backup->'scene_links') then raise exception 'Scene count mismatch'; end if;
 if (select count(*) from public.assets where id in (select (value->>'id')::uuid from jsonb_array_elements(backup->'asset_links')))<>jsonb_array_length(backup->'asset_links') then raise exception 'Asset count mismatch'; end if;
 if jsonb_array_length(sequence_list)<>7 then raise exception 'Unexpected sequence count; review before applying'; end if;
 raise notice 'Created % with % sequences and % scenes',target_id,sequence_count,scene_position;
end $$;
commit;
select id,name,jsonb_array_length(config->'subprojects') as sequences,(select count(*) from public.scenes where project_id=p.id) as scenes from public.projects p where config->>'organization_version'='mountain-sequences-v1';

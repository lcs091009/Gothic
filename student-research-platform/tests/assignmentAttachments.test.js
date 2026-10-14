import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("multiple-attachment SQL preserves existing records and RLS and removes the old file count bound",async()=>{
 const db=new PGlite();try{
  await db.exec("create table public.teacher_shared_files(id text primary key,file_url text);insert into teacher_shared_files values('old','https://example.test/old');alter table teacher_shared_files enable row level security;create policy existing_read on teacher_shared_files for select using(true);");
  const sql=await readFile(new URL('../supabase/migrations/20261014000000_teacher_assignment_attachments.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  const upgraded=await readFile(new URL('../supabase/migrations/20261014025345_global_ai_quota_and_attachment_capacity.sql',import.meta.url),'utf8');
  await db.exec(upgraded.slice(upgraded.indexOf('-- Preserve')));
  const old=(await db.query('select * from teacher_shared_files')).rows[0];assert.equal(old.file_url,'https://example.test/old');assert.deepEqual(old.attachments,[]);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.teacher_shared_files'::regclass")).rows[0].relrowsecurity,true);
  assert.equal((await db.query("select count(*)::int as n from pg_policies where tablename='teacher_shared_files'")).rows[0].n,1);
  await db.query('insert into teacher_shared_files(id,attachments) values($1,$2)',['valid',JSON.stringify(Array(20).fill({id:'file',name:'name',url:'https://example.test'}))]);
  await db.query('insert into teacher_shared_files(id,attachments) values($1,$2)',['many',JSON.stringify(Array(40).fill({}))]);
  await assert.rejects(db.query('insert into teacher_shared_files(id,attachments) values($1,$2)',['object','{}']));
 }finally{await db.close();}
});

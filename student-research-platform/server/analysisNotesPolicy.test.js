import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("analysis notes isolate accounts and reject forged owner insert/update",async()=>{
  const db=new PGlite();
  const a="00000000-0000-4000-8000-000000000001",b="00000000-0000-4000-8000-000000000002",note="00000000-0000-4000-8000-000000000003";
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    await db.exec(await readFile(new URL("../supabase/migrations/20261016021247_analysis_notes.sql",import.meta.url),"utf8"));
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);insert into public.analysis_notes(id,user_id,title,content) values('${note}','${a}','나의 분석','{"version":1,"analysis":"실제 설명"}');`);
    assert.equal((await db.query("select count(*)::int as n from public.analysis_notes")).rows[0].n,1);
    await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
    assert.equal((await db.query("select count(*)::int as n from public.analysis_notes")).rows[0].n,0);
    assert.equal((await db.query("update public.analysis_notes set title='forged' returning id")).rows.length,0);
    await assert.rejects(db.exec(`insert into public.analysis_notes(user_id,title,content) values('${a}','forged','{"version":1}')`),/row-level security/);
    await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);`);
    await assert.rejects(db.exec(`update public.analysis_notes set user_id='${b}' where id='${note}'`),/row-level security/);
    await db.exec("set role anon");await assert.rejects(db.query("select * from public.analysis_notes"),/permission denied/);
  } finally {await db.close();}
});

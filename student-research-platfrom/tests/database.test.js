import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
test("database migrations enforce ownership, roles and persistent AI quotas", async () => {
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;`);
const base = fileURLToPath(new URL('../supabase/migrations', import.meta.url));
for (const file of (await readdir(base)).sort()) { await db.exec(await readFile(`${base}/${file}`, 'utf8')); console.log('Migration passed:',file); }
await db.exec(await readFile(`${base}/20261006000000_security_and_ai_quota.sql`, 'utf8'));
await db.exec(await readFile(`${base}/20261006001000_teacher_student_directory.sql`, 'utf8'));
console.log('Security and directory migrations are safe to apply again in order.');
const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'];
const emails=['27-1234@gochon.hs.kr','28-2345@gochon.hs.kr','teacher@gochon.hs.kr','outsider@example.com'];
for(let i=0;i<ids.length;i++) await db.query('insert into auth.users values($1,$2,now())',[ids[i],emails[i]]);
async function asUser(i,fn) {
  await db.exec('begin; set local role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$2,true)",[ids[i],JSON.stringify({sub:ids[i],email:emails[i]})]);
  try { const value=await fn();await db.exec('commit');return value; } catch(e) {await db.exec('rollback');throw e;}
}
for(let i=0;i<ids.length;i++) {
 const r=await asUser(i,()=>db.query("insert into public.profiles(id,email,name,role) values($1,'fake','Test','teacher') returning role,email",[ids[i]]));
 assert.equal(r.rows[0].role, i<2 ? 'student':'pending');assert.equal(r.rows[0].email,emails[i]);
}
console.log('Verified identity trigger prevents self-assigned teacher role and accepts multiple cohorts.');
await assert.rejects(asUser(0,()=>db.query("update public.profiles set role='teacher' where id=$1",[ids[0]])),/administrator-managed/);
await assert.rejects(asUser(0,()=>db.query("update public.profiles set email=$1 where id=$2",[emails[1],ids[0]])),/administrator-managed/);
await db.query("update public.profiles set role='teacher' where id=$1",[ids[2]]);
await asUser(0,()=>db.query("insert into research_records(user_id,subject,title,content) values($1,'biology','Enzyme','Experiment')",[ids[0]]));
await assert.rejects(asUser(1,()=>db.query("insert into research_records(user_id,subject,title,content) values($1,'biology','Stolen','fake')",[ids[0]])),/row-level security/);
assert.equal((await asUser(1,()=>db.query('select * from research_records'))).rows.length,0);
assert.equal((await asUser(0,()=>db.query('select * from research_records'))).rows.length,1);
await asUser(0,()=>db.query("insert into student_academic_profiles(user_id,grade,current_grade,selected_choices) values($1,'2학년','2학년','{\"science\":[\"생명과학\"]}')",[ids[0]]));
assert.equal((await asUser(1,()=>db.query('select * from student_academic_profiles'))).rows.length,0);
await assert.rejects(asUser(0,()=>db.query("insert into teacher_shared_files(teacher_id,student_email,file_name) values($1,$2,'Forbidden')",[ids[0],emails[1]])),/row-level security/);
await asUser(2,()=>db.query("insert into teacher_shared_files(teacher_id,student_email,file_name) values($1,$2,'Teacher material')",[ids[2],emails[0]]));
assert.equal((await asUser(0,()=>db.query('select * from teacher_shared_files'))).rows.length,1);
assert.equal((await asUser(1,()=>db.query('select * from teacher_shared_files'))).rows.length,0);
assert.equal((await asUser(2,()=>db.query('select * from teacher_shared_files'))).rows.length,1);
assert.equal((await asUser(0,()=>db.query("update teacher_shared_files set description='Changed' returning id"))).rows.length,0);
console.log('RLS passed: ownership, teacher-only sharing, recipient-only visibility, role escalation blocked.');
for(let n=0;n<5;n++) assert.equal((await asUser(0,()=>db.query('select consume_ai_analysis_quota() q'))).rows[0].q.allowed,true);
const blocked=(await asUser(0,()=>db.query('select consume_ai_analysis_quota() q'))).rows[0].q;
assert.equal(blocked.allowed,false);assert.ok(blocked.retry_after>0);
assert.equal((await asUser(1,()=>db.query('select consume_ai_analysis_quota() q'))).rows[0].q.allowed,true);
await assert.rejects(asUser(3,()=>db.query('select consume_ai_analysis_quota()')),/Approved student required/);
await assert.rejects(asUser(0,()=>db.query('update ai_analysis_quotas set day_count=0')),/permission denied/);
await db.query("update ai_analysis_quotas set window_start=now()-interval '11 minutes',day_count=20 where user_id=$1",[ids[0]]);
assert.equal((await asUser(0,()=>db.query('select consume_ai_analysis_quota() q'))).rows[0].q.allowed,false);
await db.query("update ai_analysis_quotas set day_start=now()-interval '25 hours' where user_id=$1",[ids[0]]);
assert.equal((await asUser(0,()=>db.query('select consume_ai_analysis_quota() q'))).rows[0].q.allowed,true);
console.log('Distributed quota passed: 5/10min, 20/24h, reset, independent users, no direct client edits.');
await db.exec('begin; set local role anon;');
await assert.rejects(db.query('select * from research_records'),/permission denied/);await db.exec('rollback');
console.log('Anonymous access denied. All database checks passed.');

for (const [id, email] of [['00000000-0000-0000-0000-000000000005','27-10315@gochon.hs.kr'],['00000000-0000-0000-0000-000000000006','27-20315@gochon.hs.kr']]) {
  ids.push(id); emails.push(email);
  await db.query('insert into auth.users values($1,$2,now())',[id,email]);
  await asUser(ids.length-1,()=>db.query("insert into profiles(id,email,name) values($1,$2,'Directory Student')",[id,email]));
}
const directory = await asUser(2,()=>db.query("select directory_grade,directory_class,directory_number from profiles where role='student' and directory_grade=1"));
assert.deepEqual(directory.rows,[{directory_grade:1,directory_class:3,directory_number:15}]);
assert.equal((await asUser(2,()=>db.query("select id from profiles where role='student' and directory_class=3"))).rows.length,2);
assert.equal((await asUser(2,()=>db.query("select id from profiles where role='student' and directory_number=15"))).rows.length,2);
assert.equal((await asUser(2,()=>db.query("select id from profiles where role='student' and directory_grade=2 and directory_class=3 and directory_number=15"))).rows.length,1);
assert.equal((await asUser(2,()=>db.query('select * from research_records'))).rows.length,1);
assert.equal((await asUser(2,()=>db.query('select * from student_academic_profiles'))).rows.length,1);
assert.equal((await asUser(2,()=>db.query("update research_records set title='Forbidden' returning id"))).rows.length,0);
assert.equal((await asUser(0,()=>db.query("select id from profiles where role='student' and id <> auth.uid()"))).rows.length,0);
assert.equal((await asUser(3,()=>db.query("select id from profiles where role='student'"))).rows.length,0);
await db.exec(await readFile(`${base}/20261006001000_teacher_student_directory.sql`, 'utf8'));
console.log('Teacher directory passed: independent filters, exact placement, read-only details, student/pending isolation, migration reapplication.');
await db.close();

});

import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { buildAssignmentRows, deliverAssignmentRows, fetchTeacherAssignments, groupAssignmentDeliveries, recallAssignmentRows } from "./teacherAssignments.js";
const draft = { teacher: { id: "teacher", email: "teacher@example.test" },
  students: [{ id: "student1", email: "27-10101@example.test", student_number: "10101" }, { id: "student2", email: "27-10102@example.test", student_number: "10102" }],
  title: " 실험 결과 비교 ", description: " 본인의 결과와 오차 원인을 정리해 주세요. " };
test("one assignment reaches every selected recipient without filenames or admission-year guessing", () => {
  let id = 0;
  const rows = buildAssignmentRows({ ...draft, dueDate: "2026-10-20", fileUrl: "https://example.test/report" }, () => `row-${++id}`);
  assert.equal(rows.length, 2);assert.notEqual(rows[0].id, rows[1].id);
  assert.deepEqual(rows.map(r=>r.student_email), draft.students.map(s=>s.email));
  assert.ok(rows.every(r=>r.teacher_id===draft.teacher.id && r.match_status==="matched"));
  assert.equal(rows[0].file_name,"실험 결과 비교");assert.match(rows[0].description,/^제출 기한: 2026-10-20\n\n본인의 결과/);
  assert.equal(rows[0].file_url,"https://example.test/report");
  assert.equal(buildAssignmentRows(draft,()=>"id")[0].file_url,null);
});
test("empty/duplicate/oversized recipients, incomplete tasks, unsafe links and impossible dates fail before writing", () => {
  for(const change of [{students:[]},{students:Array(101).fill(draft.students[0])},{students:[draft.students[0],draft.students[0]]},
    {title:" "},{description:" "},{title:"x".repeat(161)},{description:"x".repeat(4001)},
    {fileUrl:"javascript:alert(1)"},{fileUrl:"https://user:pass@example.test"},{dueDate:"2026-02-30"},{dueDate:"invalid"},{dueDate:"2026-99-99"}]) {
    assert.throws(()=>buildAssignmentRows({...draft,...change}));
  }
});
test("one bulk request reuses the exact draft IDs and ignores duplicates instead of overwriting", async () => {
  let id=0;const rows=buildAssignmentRows(draft,()=>`id-${++id}`);const calls=[];
  const client={from(table){assert.equal(table,"teacher_shared_files");return {async upsert(data,options){calls.push({data,options});return {error:null};}};}};
  await deliverAssignmentRows(rows,client);await deliverAssignmentRows(rows,client);
  assert.equal(calls.length,2);assert.equal(calls[0].data,rows);assert.equal(calls[1].data,rows);
  assert.deepEqual(calls[0].options,{onConflict:"id",ignoreDuplicates:true});
});
test("delivery errors propagate without automatically repeating writes",async()=>{
  let calls=0;const error={message:"timeout"};
  const client={from(){return {async upsert(){calls++;return {error};}};}};
  await assert.rejects(deliverAssignmentRows([],client),e=>e===error);assert.equal(calls,1);
});
test("bulk insert and conflict-ignore work under INSERT/SELECT-only owner and recipient RLS",async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role assignment_client;create table deliveries(id text primary key, teacher_id text not null, student_email text not null, title text);
      alter table deliveries enable row level security;grant select,insert on deliveries to assignment_client;
      create policy teacher_insert on deliveries for insert to assignment_client with check(teacher_id=current_setting('test.actor'));
      create policy owner_read on deliveries for select to assignment_client using(teacher_id=current_setting('test.actor'));
      create policy recipient_read on deliveries for select to assignment_client using(student_email=current_setting('test.actor'));
      set role assignment_client;set test.actor='teacher';
      insert into deliveries values('1','teacher','student1','original'),('2','teacher','student2','original') on conflict(id) do nothing;
      insert into deliveries values('1','teacher','student1','changed'),('2','teacher','student2','changed') on conflict(id) do nothing;`);
    const result=await db.query('select * from deliveries');assert.equal(result.rows.length,2);assert.ok(result.rows.every(r=>r.title==='original'));
    await db.exec("set test.actor='student1'");assert.equal((await db.query('select * from deliveries')).rows.length,1);
    await db.exec("set test.actor='unrelated'");assert.equal((await db.query('select * from deliveries')).rows.length,0);
    await assert.rejects(db.exec("insert into deliveries values('3','teacher','unrelated','forged')"));
  }finally{await db.close();}
});

test("history groups one batch while keeping distinct deliveries with the same title",()=>{
 const rows=buildAssignmentRows(draft,()=>crypto.randomUUID()).map(row=>({...row,created_at:"2026-10-12T01:00:00Z"}));
 const later={...rows[0],id:"later",created_at:"2026-10-12T02:00:00Z"};
 const result=groupAssignmentDeliveries([...rows,later]);assert.equal(result.length,2);assert.equal(result[0].recipients.length,2);assert.equal(result[1].recipients.length,1);
 assert.deepEqual(result[0].recipients.map(r=>r.email),draft.students.map(s=>s.email));
});

test("all validated attachments are stored per recipient, with legacy first-link compatibility",()=>{
 const attachments=Array.from({length:40},(_,i)=>({id:`file${i}`,name:`자료${i}.pdf`,url:`https://drive.google.com/file/d/file${i}/view`}));
 const rows=buildAssignmentRows({...draft,attachments,fileUrl:attachments[0].url,fileId:attachments[0].id},()=>crypto.randomUUID());
 assert.equal(rows[0].attachments.length,40);assert.deepEqual(rows[0].attachments,rows[1].attachments);assert.equal(rows[0].file_id,"file0");
 for(const files of [[{id:"huge",url:"https://example.test",size:501*1024*1024}],[{id:"bad",url:"javascript:alert(1)"}],[attachments[0],attachments[0]]])assert.throws(()=>buildAssignmentRows({...draft,attachments:files}));
});

test("history keeps each recipient row id so one delivery can be recalled",()=>{
 let id=0;const rows=buildAssignmentRows(draft,()=>`row-${++id}`).map(row=>({...row,created_at:"2026-10-12T01:00:00Z"}));
 assert.deepEqual(groupAssignmentDeliveries(rows)[0].recipients.map(r=>r.id),["row-1","row-2"]);
});
test("teacher history loads beyond 1000 rows without splitting recipient groups or skipping after concurrent deletion",async()=>{
  const stamp="2026-10-12T01:00:00Z";
  const rows=Array.from({length:1100},(_,i)=>({id:String(1100-i).padStart(4,"0"),teacher_id:"teacher",student_email:`s${i}@school.test`,file_name:`과제${Math.floor(i/100)}`,created_at:stamp}));
  const calls=[];
  const client={from(table){assert.equal(table,"teacher_shared_files");let cursor,limit;const q={
    select(value){assert.equal(value,"*");return q;},eq(column,value){assert.deepEqual([column,value],["teacher_id","teacher"]);return q;},
    order(column,options){assert.ok(["created_at","id"].includes(column));assert.equal(options.ascending,false);return q;},
    limit(value){limit=value;assert.equal(value,500);return q;},or(value){cursor=value;return q;},
    then(resolve,reject){
      if(calls.length===1) rows.shift();
      const lastId=cursor?.match(/id\.lt\.([^)]+)\)$/)?.[1];
      if(cursor) assert.equal(cursor,`created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${lastId})`);
      const data=rows.filter(row=>!lastId || row.id<lastId).slice(0,limit);calls.push(cursor);
      return Promise.resolve({data,error:null}).then(resolve,reject);
    }
  };return q;}};
  const files=await fetchTeacherAssignments("teacher",client);
  assert.equal(files.length,1100);assert.equal(new Set(files.map(row=>row.id)).size,1100);assert.equal(calls.length,3);
  const groups=groupAssignmentDeliveries(files);assert.equal(groups.length,11);assert.ok(groups.every(group=>group.recipients.length===100));
  let deleted=[];
  const recallClient={from(){const q={delete(){return q;},in(column,ids){deleted=ids;return q;},eq(){return q;},select(){return q;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};return q;}};
  assert.equal(await recallAssignmentRows(groups.at(-1).recipients.map(r=>r.id),"teacher",recallClient),100);assert.equal(deleted.length,100);
  const failing={from(){const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},then(resolve){return Promise.resolve({error:new Error("read failed")}).then(resolve);}};return q;}};
  await assert.rejects(fetchTeacherAssignments("teacher",failing),/read failed/);
});
test("recall verifies all requested rows are absent, including already-removed recipients",async()=>{
 const calls=[];
 const remaining=new Set(["row-1"]);
 const client={from(table){assert.equal(table,"teacher_shared_files");let deleting=false,ids=[],owner;const q={delete(){deleting=true;calls.push("delete");return q;},in(c,v){ids=v;calls.push(["in",c,v]);return q;},eq(c,v){owner=v;calls.push(["eq",c,v]);return q;},select(c){calls.push(["select",c]);return q;},then(resolve,reject){assert.equal(owner,"teacher");const data=ids.filter(id=>remaining.has(id)).map(id=>({id}));if(deleting)for(const {id} of data)remaining.delete(id);return Promise.resolve({data,error:null}).then(resolve,reject);}};return q;}};
 assert.equal(await recallAssignmentRows(["row-1","row-2"],"teacher",client),2);
 assert.equal(remaining.size,0);
 assert.deepEqual(calls,["delete",["in","id",["row-1","row-2"]],["eq","teacher_id","teacher"],["select","id"],["select","id"],["in","id",["row-1","row-2"]],["eq","teacher_id","teacher"]]);
 for(const [ids,teacher] of [[[], "teacher"],[["row-1"],""],[[""],"teacher"],[null,"teacher"]]) await assert.rejects(recallAssignmentRows(ids,teacher,client));
});

import test from "node:test";
import assert from "node:assert/strict";
import {createAnalysisJobsHandler} from "./analysisJobs.js";
const id="00000000-0000-4000-8000-000000000001",parent="00000000-0000-4000-8000-000000000002";
function fixture() {
  const tables={analysis_jobs:new Map(),analysis_notes:new Map()};const tasks=[];let finish,calls=0;
  const client={auth:{getUser:async()=>({data:{user:{id:"owner",email_confirmed_at:"yes"}}})},from(table){let key,owner,action,payload;
    const run=async()=>{const rows=tables[table];if(action==="insert") {if(rows.has(payload.id)) return {error:{code:"23505"}};rows.set(payload.id,{...payload,created_at:new Date().toISOString()});return {data:null};}const row=rows.get(key);const data=row?.user_id===owner ? row:null;if(action==="update" && data) rows.set(key,{...data,...payload});return {data};};
    return {select(){return this;},eq(column,value){if(column==="id") key=value;if(column==="user_id") owner=value;return this;},insert(value){action="insert";payload=value;return this;},update(value){action="update";payload=value;return this;},maybeSingle:run,single:run,then(resolve,reject){return run().then(resolve,reject);}};
  }};
  const handler=createAnalysisJobsHandler({env:{SUPABASE_URL:"test",SUPABASE_PUBLISHABLE_KEY:"test"},clientFactory:()=>client,waitUntil:task=>tasks.push(task),analyzeFactory:({onResult})=>async(request,response)=>{
    calls++;await new Promise(resolve=>{finish=resolve;});
    const payload={analysis:"실제 분석",exploration:{intro:"다음 안내",choices:[],guidelines:[]},scope:{},warning:null};
    await onResult(payload,{user:{id:"owner"},records:[{id:"r",title:"효소",subject:"생명과학"}],teacherSharedFiles:[],extraContext:"",explorationSubject:"생명과학",explorationPath:request.body.explorationPath});
    return response.status(200).json(payload);
  }});
  async function call(method="POST",body={jobId:id},query={}) {const response={code:200,setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};await handler({method,body,query,headers:{authorization:"Bearer session"}},response);return response;}
  return {tables,tasks,call,finish:()=>finish(),get calls(){return calls;}};
}
test("job returns acceptance immediately and saves the note after the browser request has ended",async()=>{
  const f=fixture();const response=await f.call();assert.equal(response.code,202);assert.equal(f.tables.analysis_jobs.get(id).status,"processing");
  assert.equal((await f.call()).code,202);assert.equal(f.calls,1);
  f.finish();await Promise.all(f.tasks);
  const job=(await f.call("GET",{}, {id})).body;assert.equal(job.status,"completed");assert.equal(job.result.noteId,id);assert.equal(f.tables.analysis_notes.get(id).content.analysis,"실제 분석");
  assert.ok(!JSON.stringify(f.tables.analysis_jobs.get(id)).includes("Bearer"));
});
test("foreign jobs and parent notes cannot be read or continued",async()=>{
  const f=fixture();f.tables.analysis_jobs.set(id,{id,user_id:"other",status:"completed",result:{analysis:"PRIVATE"}});
  assert.equal((await f.call("GET",{}, {id})).code,404);
  f.tables.analysis_notes.set(parent,{id:parent,user_id:"other"});assert.equal((await f.call("POST",{jobId:id,noteId:parent})).code,403);assert.equal(f.tasks.length,0);
});
test("a completed follow-up is appended to the owner's existing notebook on the server",async()=>{
  const f=fixture();f.tables.analysis_notes.set(parent,{id:parent,user_id:"owner",content:{version:1,analysis:"첫 분석",exploration:{intro:"자료",choices:[]},explorationState:{subject:"생명과학",steps:[{path:[],result:{intro:"자료",choices:[]}}]}}});
  await f.call("POST",{jobId:id,noteId:parent,explorationPath:["효소의 온도 영향"]});f.finish();await Promise.all(f.tasks);
  const content=f.tables.analysis_notes.get(parent).content;assert.equal(content.analysis,"첫 분석");assert.equal(content.explorationState.steps.length,2);assert.equal(content.explorationState.steps[1].result.intro,"다음 안내");
});

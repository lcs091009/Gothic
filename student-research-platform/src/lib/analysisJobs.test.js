import test from "node:test";
import assert from "node:assert/strict";
import {runAnalysisJob,getAnalysisAccessToken} from "./analysisJobs.js";
test("returning from a suspended screen checks saved completion before the local timeout",async()=>{
  let clock=0,polls=0,posts=0;const result={analysis:"서버에서 끝난 분석",noteId:"saved-note"};
  const response=value=>({ok:true,json:async()=>value});
  const actual=await runAnalysisJob({selectedRecordIds:[]},{getToken:async()=>"session",now:()=>clock,sleep:async()=>{clock=200000;},fetchImpl:async(url,options)=>{
    if(options.method==="POST") {posts++;assert.equal(options.headers.Authorization,"Bearer session");return response({jobId:"job"});}
    polls++;return response(polls===1 ? {status:"processing"}:{status:"completed",result});
  }});
  assert.equal(posts,1);assert.equal(polls,2);assert.deepEqual(actual,result);
});
test("stopping browser polling does not send a cancellation or restart request to the server",async()=>{
  const controller=new AbortController();let posts=0;
  await assert.rejects(runAnalysisJob({},{getToken:async()=>"session",signal:controller.signal,sleep:async()=>controller.abort(),fetchImpl:async(url,options)=>{if(options.method==="POST") posts++;return {ok:true,json:async()=>options.method==="POST" ? {jobId:"job"}:{status:"processing"}};}}),{name:"AbortError"});
  assert.equal(posts,1);
});

test("refreshes a nearly expired app session without opening any Google authorization",async()=>{
  let refreshes=0;
  const token=await getAnalysisAccessToken({getSession:async()=>({data:{session:{access_token:"old",expires_at:Math.floor(Date.now()/1000)+60}}}),refreshSession:async()=>{refreshes++;return {data:{session:{access_token:"fresh"}}};}});
  assert.equal(token,"fresh");assert.equal(refreshes,1);
});

import test from "node:test";
import assert from "node:assert/strict";
import {createElement,act} from "react";
import {create} from "react-test-renderer";
import {useStudentData} from "./useStudentData.js";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test("same-user auth refresh preserves loaded data; actual account change clears old ownership",async()=>{
  let calls=0,value,release;
  const service={ensureProfile:async user=>{calls++;if(user.id==="two") await new Promise(resolve=>{release=resolve;});return {id:user.id,role:"student"};},fetchAcademicProfile:async id=>({id,current_grade:"2학년"}),fetchResearchRecords:async id=>[{id,content:"original source"}],fetchTeacherSharedFiles:async()=>[]};
  function Harness({session}) {value=useStudentData(session,()=>{},service);return null;}
  const session=id=>({user:{id,email:`${id}@school.test`},access_token:Math.random().toString()});
  let root;await act(async()=>{root=create(createElement(Harness,{session:session("one")}));});
  assert.equal(calls,1);const original=value.records;assert.equal(value.profile.id,"one");
  await act(async()=>root.update(createElement(Harness,{session:session("one")})));
  assert.equal(calls,1);assert.equal(value.records,original);assert.equal(value.isAcademicProfileLoading,false);
  await act(async()=>root.update(createElement(Harness,{session:session("two")})));
  assert.equal(value.profile,null);assert.deepEqual(value.records,[]);assert.equal(calls,2);
  await act(async()=>release());assert.equal(value.profile.id,"two");assert.equal(value.records[0].id,"two");
  await act(async()=>root.update(createElement(Harness,{session:null})));assert.equal(value.profile,null);assert.deepEqual(value.records,[]);
  await act(async()=>root.unmount());
});

test("failed teacher or academic fetch cannot discard successfully loaded records; errors survive until retry",async()=>{
  let hook,root,fail=true;
  const service={ensureProfile:async user=>({id:user.id,role:"student"}),fetchResearchRecords:async()=>[{id:"record"}],fetchTeacherSharedFiles:async()=>{if(fail) throw Error("materials unavailable");return [{id:"material"}];},fetchAcademicProfile:async()=>{if(fail) throw Error("academic unavailable");return {current_grade:"2"};}};
  function Harness(){hook=useStudentData({user:{id:"one",email:"one@test"}},()=>{},service);return null;}
  try {
    await act(async()=>{root=create(createElement(Harness));});
    assert.equal(hook.records.length,1);assert.ok(hook.dataErrors.materials);assert.ok(hook.dataErrors.academic);assert.equal(hook.isLoadingResearchRecords,false);
    fail=false;await act(async()=>hook.reloadStudentData());
    assert.equal(hook.records.length,1);assert.equal(hook.teacherSharedFiles.length,1);assert.equal(hook.dataErrors.materials,"");assert.equal(hook.academicProfile.current_grade,"2");
  } finally {if(root) await act(async()=>root.unmount());}
});

test("record errors are explicit and retryable; a delayed initial read cannot overwrite a newer refresh",async()=>{
  let hook,root,release,call=0;
  const service={ensureProfile:async user=>({id:user.id,role:"student"}),fetchAcademicProfile:async()=>({}),fetchTeacherSharedFiles:async()=>[],fetchResearchRecords:async()=>{call++;if(call===1) throw Error("records unavailable");if(call===2) return new Promise(resolve=>{release=resolve;});return [{id:"new-record"}];}};
  function Harness(){hook=useStudentData({user:{id:"one",email:"one@test"}},()=>{},service);return null;}
  try {
    await act(async()=>{root=create(createElement(Harness));});
    assert.ok(hook.dataErrors.records);assert.equal(hook.isLoadingResearchRecords,false);
    await act(async()=>hook.reloadStudentData());assert.equal(hook.isLoadingResearchRecords,true);
    await act(async()=>hook.loadResearchRecords("one"));assert.equal(hook.records[0].id,"new-record");
    await act(async()=>release([{id:"stale-record"}]));assert.equal(hook.records[0].id,"new-record");assert.equal(hook.dataErrors.records,"");
  } finally {if(root) await act(async()=>root.unmount());}
});

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

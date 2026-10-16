import test from "node:test";
import assert from "node:assert/strict";
import {createElement,act} from "react";
import {create} from "react-test-renderer";
import {useAnalysisNotes} from "./useAnalysisNotes.js";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test("note autosave serializes snapshots so a slower earlier write cannot overwrite the latest cards",async()=>{
  const stored=new Map(),writes=[];let releaseFirst;
  const client={from(){let payload,owner;return {select(){return this;},eq(key,value){if(key==="user_id") owner=value;return this;},order(){return this;},limit:async()=>({data:[...stored.values()].filter(note=>note.user_id===owner)}),upsert(value){payload=value;return this;},async single(){writes.push(payload);if(writes.length===1) await new Promise(resolve=>{releaseFirst=resolve;});const item={...payload,created_at:"2026-10-16"};stored.set(item.id,item);return {data:item};}};}};
  let hook,root;function Harness({user}) {hook=useAnalysisNotes(user,client);return createElement("span",null,hook.status);}
  await act(async()=>{root=create(createElement(Harness,{user:"a"}));});
  await act(async()=>{hook.save({id:"note",title:"첫 결과",content:{analysis:"one"}});hook.save({id:"note",title:"후속 카드",content:{analysis:"two"}});});
  assert.equal(writes.length,1);
  await act(async()=>{releaseFirst();});
  assert.equal(writes.length,2);assert.equal(stored.get("note").content.analysis,"two");assert.equal(hook.notes.length,1);assert.match(hook.status,/저장됨/);
  await act(async()=>root.update(createElement(Harness,{user:"b"})));
  assert.equal(hook.notes.length,0);assert.ok(writes.every(note=>note.user_id==="a"));
  await act(async()=>root.unmount());
});

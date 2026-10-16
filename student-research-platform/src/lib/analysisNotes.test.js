import test from "node:test";
import assert from "node:assert/strict";
import {analysisNoteContent,createAnalysisNotesService,noteTitle} from "./analysisNotes.js";
test("note snapshots retain actual answers and source metadata while excluding file bodies and tokens",()=>{
  const inputs={subject:"生物",records:[{id:"r",title:"효소",subject:"생명과학",content:"PRIVATE RECORD BODY",drive_file_id:"pdf"}],files:[{id:"pdf",name:"자료",url:"PRIVATE SIGNED URL"}],documentTexts:[{text:"PRIVATE DOCUMENT BODY"}],access_token:"PRIVATE TOKEN"};
  const content=analysisNoteContent({analysis:"온도 비교",exploration:{intro:"원문 안내"},inputs,explorationState:{steps:[{path:["효소"],result:{intro:"후속 설명"}}]}});
  const json=JSON.stringify(content);assert.doesNotMatch(json,/PRIVATE/);assert.match(json,/후속 설명/);assert.match(json,/온도 비교/);assert.equal(noteTitle(inputs),"生物 · 효소");
});
test("note queries filter by owner and ignore supplied owner fields when saving",async()=>{
  const calls=[];const query={select(...args){calls.push(["select",...args]);return this;},eq(...args){calls.push(["eq",...args]);return this;},order(){return this;},limit(){return Promise.resolve({data:[]});},single(){return Promise.resolve({data:{id:"note"}});},upsert(value){calls.push(["upsert",value]);return this;}};
  const service=createAnalysisNotesService({from:()=>query},"owner");await service.list();await service.open("note");await service.save({id:"note",user_id:"other",title:"제목",content:{version:1}});
  assert.equal(calls.filter(call=>call[0]==="eq" && call[1]==="user_id" && call[2]==="owner").length,2);
  assert.equal(calls.find(call=>call[0]==="upsert")[1].user_id,"owner");
});

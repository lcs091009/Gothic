import test from "node:test";
import assert from "node:assert/strict";
import { readAssignmentDraft, writeAssignmentDraft, clearAssignmentDraft, assignmentDeliveryKey, ASSIGNMENT_DRAFT_TTL } from "./assignmentDraft.js";
const memory=()=>{const items=new Map();return{items,getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)};};
const data={title:"효소 탐구",description:"실험 결과와 한계를 정리해 주세요.",students:[{id:"student1",email:"s@example.test",name:"학생",directory_grade:2,directory_class:3,directory_number:15}],attachments:[{id:"file1",name:"자료.pdf",url:"https://drive.google.com/file/d/file1/view"}],dueDate:"2026-10-20"};
test("drafts survive returning later with recipients and completed attachments, isolated per account",()=>{
 const storage=memory();assert.equal(writeAssignmentDraft("teacher1",data,storage,100),true);
 const restored=readAssignmentDraft("teacher1",storage,100+ASSIGNMENT_DRAFT_TTL-1);assert.equal(restored.title,data.title);assert.equal(restored.students.length,1);assert.equal(restored.attachments[0].id,"file1");
 assert.equal(readAssignmentDraft("teacher2",storage,100).title,"");clearAssignmentDraft("teacher1",storage);assert.equal(readAssignmentDraft("teacher1",storage,100).title,"");
});
test("expired/corrupt/wrong-owner snapshots do not restore",()=>{
 const storage=memory();writeAssignmentDraft("teacher",data,storage,100);assert.equal(readAssignmentDraft("teacher",storage,100+ASSIGNMENT_DRAFT_TTL+1).title,"");assert.equal(storage.items.size,0);
 writeAssignmentDraft("teacher",data,storage,100);const key=[...storage.items.keys()][0];storage.setItem(key,"broken json");assert.equal(readAssignmentDraft("teacher",storage,100).title,"");
 storage.setItem(key,JSON.stringify({version:1,ownerId:"other",savedAt:100,data}));assert.equal(readAssignmentDraft("teacher",storage,100).title,"");
});
test("only bounded draft fields and delivery IDs persist, without credentials or file bytes",()=>{
 const storage=memory();writeAssignmentDraft("teacher",{...data,title:"x".repeat(500),access_token:"SECRET_TOKEN",file:new Blob(["PRIVATE_BYTES"]),
  students:[{...data.students[0],refresh_token:"SECRET_TOKEN",directory_grade:{access_token:"SECRET_TOKEN"}}],delivery:{key:"same-draft",ids:["row-id"]}},storage,100);
 const serialized=[...storage.items.values()][0];assert.doesNotMatch(serialized,/SECRET_TOKEN|PRIVATE_BYTES|access_token|refresh_token/);
 const restored=readAssignmentDraft("teacher",storage,100);assert.equal(restored.title.length,160);assert.deepEqual(restored.delivery.ids,["row-id"]);
});
test("storage restrictions do not crash editing and report save failure",()=>{
 const storage={getItem(){throw Error("blocked");},setItem(){throw Error("quota");},removeItem(){throw Error("blocked");}};
 assert.equal(readAssignmentDraft("teacher",storage).title,"");assert.equal(writeAssignmentDraft("teacher",data,storage),false);assert.equal(clearAssignmentDraft("teacher",storage),false);
});
test("delivery identity is stable after restore/property ordering, but changes with recipients or task content",()=>{
 const draft={...data,teacher:{id:"teacher",email:"t@example.test"},category:"탐구",fileUrl:data.attachments[0].url,fileId:"file1",attachments:data.attachments};
 const reordered={...draft,students:[{name:"학생",email:"s@example.test",id:"student1"}]};
 assert.equal(assignmentDeliveryKey(draft),assignmentDeliveryKey(reordered));
 assert.notEqual(assignmentDeliveryKey(draft),assignmentDeliveryKey({...draft,title:"다른 과제"}));
 assert.notEqual(assignmentDeliveryKey(draft),assignmentDeliveryKey({...draft,students:[{id:"other",email:"other@example.test"}]}));
});

import test from "node:test";
import assert from "node:assert/strict";
import { uploadDriveFile, shareDriveFile, MAX_DRIVE_UPLOAD_BYTES } from "./googleDriveFiles.js";
test("native files upload as resumable raw data and produce a usable attachment URL",async()=>{
 const file=Object.assign(new Blob(["report"],{type:"application/pdf"}),{name:"과제.pdf"});const calls=[];
 const result=await uploadDriveFile(file,"test-token",{fetchImpl:async(url,options)=>{
  calls.push({url,options});return calls.length===1 ? {ok:true,headers:{get:()=>"https://www.googleapis.com/upload/drive/v3/files?upload_id=test"}} : {ok:true,json:async()=>({id:"file_123",name:file.name})};
 }});
 assert.equal(calls[0].options.method,"POST");assert.match(calls[0].url,/uploadType=resumable/);
 assert.equal(calls[1].options.method,"PUT");assert.equal(calls[1].options.body,file);assert.equal(result.url,"https://drive.google.com/file/d/file_123/view");
});
test("oversized files and foreign upload endpoints are rejected without leaking auth or file bytes",async()=>{
 let calls=0;await assert.rejects(uploadDriveFile({name:"big",size:MAX_DRIVE_UPLOAD_BYTES+1},"token",{fetchImpl:async()=>{calls++;}}),/50MB/);assert.equal(calls,0);
 await assert.rejects(uploadDriveFile({name:"file",size:1},"token",{fetchImpl:async()=>{calls++;return{ok:true,headers:{get:()=>"https://foreign.test/upload"}};}}),/연결/);assert.equal(calls,1);
});
test("sharing grants only named recipients reader access, with notifications off, in sequence",async()=>{
 let active=0;const calls=[];const completed=new Set();
 await shareDriveFile("file123",["a@example.test","b@example.test","a@example.test"],"token",{completed,fetchImpl:async(url,options)=>{
  assert.equal(active,0);active++;await Promise.resolve();calls.push({url,body:JSON.parse(options.body)});active--;return{ok:true};
 }});
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.body.type==="user"&&c.body.role==="reader"));assert.ok(calls.every(c=>c.url.includes("sendNotificationEmail=false")));assert.equal(completed.size,2);
 await shareDriveFile("file123",["a@example.test","b@example.test"],"token",{completed,fetchImpl:async()=>{throw Error("must not repeat");}});
});
test("partial sharing failures keep successful recipients for retry and stop before remaining recipients",async()=>{
 const completed=new Set();const calls=[];
 await assert.rejects(shareDriveFile("file123",["a@example.test","b@example.test","c@example.test"],"token",{completed,fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body).emailAddress);return{ok:calls.length===1};}}),/열람 권한/);
 assert.deepEqual(calls,["a@example.test","b@example.test"]);assert.deepEqual([...completed],["a@example.test"]);
 const retry=[];await shareDriveFile("file123",["a@example.test","b@example.test","c@example.test"],"token",{completed,fetchImpl:async(url,options)=>{retry.push(JSON.parse(options.body).emailAddress);return{ok:true};}});
 assert.deepEqual(retry,["b@example.test","c@example.test"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { uploadDriveFile, shareDriveFile, MAX_DRIVE_UPLOAD_BYTES, DRIVE_CHUNK_BYTES, mergeDriveAttachments } from "./googleDriveFiles.js";
test("native files upload as resumable raw data and produce a usable attachment URL",async()=>{
 const file=Object.assign(new Blob(["report"],{type:"application/pdf"}),{name:"과제.pdf"});const calls=[];
 const result=await uploadDriveFile(file,"test-token",{fetchImpl:async(url,options)=>{
  calls.push({url,options});return calls.length===1 ? {ok:true,headers:{get:()=>"https://www.googleapis.com/upload/drive/v3/files?upload_id=test"}} : {ok:true,json:async()=>({id:"file_123",name:file.name})};
 }});
 assert.equal(calls[0].options.method,"POST");assert.match(calls[0].url,/uploadType=resumable/);
 assert.equal(calls[1].options.method,"PUT");assert.equal(calls[1].options.body,file);assert.equal(result.url,"https://drive.google.com/file/d/file_123/view");
});
test("oversized files and foreign upload endpoints are rejected without leaking auth or file bytes",async()=>{
 let calls=0;await assert.rejects(uploadDriveFile({name:"big",size:MAX_DRIVE_UPLOAD_BYTES+1},"token",{fetchImpl:async()=>{calls++;}}),/500MB/);assert.equal(calls,0);
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

test("large files stream in bounded chunks and report total progress",async()=>{
 const file=Object.assign(new Blob([new Uint8Array(DRIVE_CHUNK_BYTES+17)]),{name:"large.pdf"});const calls=[],progress=[];
 const result=await uploadDriveFile(file,"token",{onProgress:(done,total)=>progress.push([done,total]),fetchImpl:async(url,options)=>{
  calls.push(options);
  if(options.method==="POST")return{ok:true,headers:{get:()=>"https://www.googleapis.com/upload/drive/v3/files?upload_id=large"}};
  if(calls.length===2)return{ok:false,status:308,headers:{get:()=>`bytes=0-${DRIVE_CHUNK_BYTES-1}`}};
  return{ok:true,json:async()=>({id:"large_file"})};
 }});
 assert.equal(calls[1].body.size,DRIVE_CHUNK_BYTES);assert.equal(calls[2].body.size,17);
 assert.equal(calls[2].headers["Content-Range"],`bytes ${DRIVE_CHUNK_BYTES}-${file.size-1}/${file.size}`);
 assert.equal(result.id,"large_file");assert.deepEqual(progress.at(-1),[file.size,file.size]);
});
test("interrupted uploads query received bytes and continue without restarting the session",async()=>{
 const file=Object.assign(new Blob(["1234567890"]),{name:"small.txt"});let calls=0;let resumed;
 await uploadDriveFile(file,"token",{fetchImpl:async(url,options)=>{
  calls++;
  if(calls===1)return{ok:true,headers:{get:()=>"https://www.googleapis.com/upload/drive/v3/files?upload_id=resume"}};
  if(calls===2)throw Error("network");
  if(calls===3){assert.equal(options.headers["Content-Range"],"bytes */10");return{ok:false,status:308,headers:{get:()=>"bytes=0-3"}};}
  resumed=options;return{ok:true,json:async()=>({id:"done"})};
 }});
 assert.equal(calls,4);assert.equal(resumed.body.size,6);assert.equal(resumed.headers["Content-Range"],"bytes 4-9/10");
});
test("multiple attachments deduplicate files, support append and enforce a 20-file cap",()=>{
 const first={id:"file1",name:"one",url:"https://drive.google.com/file/d/file1/view"};
 assert.equal(mergeDriveAttachments([first],[first,{id:"file2",name:"two"}]).length,2);
 assert.equal(mergeDriveAttachments([],[{id:"file3"}])[0].url,"https://drive.google.com/file/d/file3/view");
 assert.throws(()=>mergeDriveAttachments([],Array.from({length:21},(_,i)=>({id:`file${i}`}))),/20/);
});
test("an interrupted first chunk with no received bytes retries within the same session",async()=>{
 const file=Object.assign(new Blob(["1234"]),{name:"file.txt"});let calls=0;
 await uploadDriveFile(file,"token",{fetchImpl:async(url,options)=>{
  calls++;
  if(calls===1)return{ok:true,headers:{get:()=>"https://www.googleapis.com/upload/drive/v3/files?upload_id=one"}};
  if(calls===2)return{ok:false,status:503};
  if(calls===3)return{ok:false,status:308,headers:{get:()=>null}};
  assert.equal(options.body,file);return{ok:true,json:async()=>({id:"file"})};
 }});assert.equal(calls,4);
});

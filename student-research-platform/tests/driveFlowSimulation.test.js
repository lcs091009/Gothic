import test from "node:test";
import assert from "node:assert/strict";
import { cacheLoginDriveToken } from "../src/lib/loginDriveToken.js";
import { validatePickedFiles, shareDriveFile } from "../src/lib/googleDriveFiles.js";
const client = "test.apps.googleusercontent.com";
const scope = "https://www.googleapis.com/auth/drive.file";
const session = { user: { id: "app-user" }, provider_token: "mock-google-token" };
function storage() { const map = new Map(); return { getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key) }; }

test("simulation: valid login grant is reusable without another login; JWT is never the Drive token", async () => {
  const target = storage(); let calls = 0;
  const fetchImpl = async url => { calls++; assert.match(url, /access_token=mock-google-token/); return {ok:true,json:async()=>({aud:client,scope,expires_in:1800})}; };
  assert.equal(await cacheLoginDriveToken(session,client,{storage:target,fetchImpl,now:()=>1000}),true);
  assert.equal(target.getItem("googleDriveAccessToken"),session.provider_token);
  assert.equal(target.getItem("googleDriveTokenExpiresAt"),"1801000");
  assert.equal(await cacheLoginDriveToken(session,client,{storage:target,fetchImpl,now:()=>2000}),true);
  assert.equal(calls,1);
});
test("simulation: missing Drive scope, wrong client and expired login tokens are not reused", async () => {
  for(const info of [{aud:client,scope:"openid email",expires_in:1800},{aud:"other-client",scope,expires_in:1800},{aud:client,scope,expires_in:30}]) {
    const target=storage();
    assert.equal(await cacheLoginDriveToken(session,client,{storage:target,fetchImpl:async()=>({ok:true,json:async()=>info})}),false);
    assert.equal(target.getItem("googleDriveAccessToken"),null);
  }
});
test("simulation: sign-out while validating cannot restore a previous user's token", async () => {
  const target=storage(); let finish;
  const response=new Promise(resolve=>finish=resolve);
  const request=cacheLoginDriveToken(session,client,{storage:target,fetchImpl:()=>response});
  await cacheLoginDriveToken(null,client,{storage:target});
  finish({ok:true,json:async()=>({aud:client,scope,expires_in:1800})});
  assert.equal(await request,false);
  assert.equal(target.getItem("googleDriveAccessToken"),null);
});
test("simulation: picked file 404 fails before attachment success or permission writes", async () => {
  const file={id:"missing-file",name:"자료.pdf"}; let calls=0;
  const fetchImpl=async (url,options)=>{calls++;assert.match(url,/files\/missing-file/);assert.notEqual(options.method,"POST");return {ok:false,status:404,json:async()=>({error:{errors:[{reason:"notFound"}]}})};};
  await assert.rejects(validatePickedFiles([file],"token",{fetchImpl}),error=>error.stage==="pickerAccess" && /파일 선택 확인/.test(error.message));
  await assert.rejects(shareDriveFile(file.id,["student@example.com"],"token",{fetchImpl}),error=>error.status===404);
  assert.equal(calls,2);
});
test("simulation: 20-file access checks run with at most four concurrent reads", async () => {
  let running=0,peak=0,calls=0;
  const files=Array.from({length:20},(_,i)=>({id:`file-${i}`}));
  await validatePickedFiles(files,"token",{fetchImpl:async()=>{running++;peak=Math.max(peak,running);calls++;await Promise.resolve();running--;return {ok:true,json:async()=>({size:"1024"})};}});
  assert.equal(calls,20);assert.equal(peak,4);
});

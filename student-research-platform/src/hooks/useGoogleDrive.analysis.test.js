import test from "node:test";
import assert from "node:assert/strict";
import {createElement,act} from "react";
import {create} from "react-test-renderer";
import {createServer} from "vite";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test("analysis reuses a valid Drive connection and never opens a popup when it is missing or expired",async()=>{
  const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
  const values=new Map();let popupCalls=0,root,hook;
  globalThis.window={sessionStorage:{getItem:key=>values.get(key) || null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)},google:{accounts:{oauth2:{initTokenClient(){popupCalls++;throw new Error("unexpected popup");}}}}};
  globalThis.fetch=async()=>({ok:true,json:async()=>({user:{permissionId:"drive-owner",emailAddress:"owner@example.com"}})});
  const server=await createServer({server:{middlewareMode:true},define:{"import.meta.env.VITE_GOOGLE_CLIENT_ID":JSON.stringify("test-client")}});
  try {
    const {useGoogleDrive}=await server.ssrLoadModule("/src/hooks/useGoogleDrive.js");
    function Harness(){hook=useGoogleDrive({userId:"student",setMessage:()=>{},accessOnly:true});return createElement("span");}
    await act(async()=>{root=create(createElement(Harness));});
    await assert.rejects(hook.getGoogleAccessToken({interactive:false}),/Google 자료 계정 연결/);assert.equal(popupCalls,0);
    for(const [key,value] of Object.entries({googleDriveUserId:"student",googleDriveClientId:"test-client",googleDriveAccessToken:"cached-token",googleDriveTokenExpiresAt:String(Date.now()+3600000)})) values.set(key,value);
    await act(async()=>{assert.equal(await hook.getGoogleAccessToken({interactive:false}),"cached-token");});assert.equal(popupCalls,0);
    values.set("googleDriveTokenExpiresAt","1");values.delete("googleDriveAccessToken");
    await act(async()=>root.unmount());root=null;
    await act(async()=>{root=create(createElement(Harness));});
    await assert.rejects(hook.getGoogleAccessToken({interactive:false}),/Google 자료 계정 연결/);assert.equal(popupCalls,0);
  } finally {if(root) await act(async()=>root.unmount());await server.close();globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});

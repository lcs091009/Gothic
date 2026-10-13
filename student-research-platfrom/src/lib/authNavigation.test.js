import test from "node:test";
import assert from "node:assert/strict";
import {cleanAuthCallbackUrl,createSessionReadGuard,beginGoogleLogin} from "./authNavigation.js";
test("callback history removes consumed credentials/errors and keeps app location",()=>{
  const href=cleanAuthCallbackUrl("https://example.com/?view=home&code=old#error=access_denied&access_token=old&refresh_token=old");
  assert.equal(href,"https://example.com/?view=home");
  assert.equal(cleanAuthCallbackUrl("https://example.com/?view=home#activities"),"https://example.com/?view=home#activities");
});
test("fresh account choice clears only the local session before replacing navigation",async()=>{
  const calls=[];
  const client={auth:{async signOut(options){calls.push(["out",options]);return {};},async signInWithOAuth(options){calls.push(["login",options]);return {data:{url:"https://auth.example.com/authorize"}};}}};
  await beginGoogleLogin(client,"https://example.com",url=>calls.push(["replace",url]),()=>calls.push(["cleared"]));
  assert.deepEqual(calls.map(c=>c[0]),["out","cleared","login","replace"]);
  assert.equal(calls[0][1].scope,"local");assert.equal(calls[2][1].options.skipBrowserRedirect,true);assert.equal(calls[2][1].options.queryParams.prompt,"select_account");
  client.auth.signInWithOAuth=async()=>({error:new Error("cancelled")});
  let navigated=false;await assert.rejects(beginGoogleLogin(client,"https://example.com",()=>{navigated=true;}),/cancelled/);assert.equal(navigated,false);
});
test("late session reads cannot roll back a newly selected account or newer restore",()=>{
  const guard=createSessionReadGuard();
  const oldRead=guard.begin();guard.invalidate();assert.equal(oldRead(),false);
  const firstRestore=guard.begin(),secondRestore=guard.begin();
  assert.equal(firstRestore(),false);assert.equal(secondRestore(),true);
});

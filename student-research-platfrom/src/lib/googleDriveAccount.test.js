import test from "node:test";
import assert from "node:assert/strict";
import { getDriveAccount, assertDriveAccount } from "./googleDriveAccount.js";
import { mergeDriveAttachments } from "./googleDriveFiles.js";
import { cleanAssignmentDraft } from "./assignmentDraft.js";
import { requestDriveAccessToken } from "./googleDriveAuth.js";

test("uses verified Drive identity and fails closed when identity is unavailable", async () => {
  const result = await getDriveAccount("token", { fetchImpl: async (url, options) => {
    assert.match(url, /about\?fields=user/); assert.equal(options.headers.Authorization, "Bearer token");
    return {ok:true, json:async()=>({user:{permissionId:"owner-a",emailAddress:"a@example.com"}})};
  }});
  assert.equal(result.id,"owner-a");
  await assert.rejects(getDriveAccount("token", {fetchImpl:async()=>({ok:false})}), /다시/);
  await assert.rejects(getDriveAccount("token", {fetchImpl:async()=>({ok:true,json:async()=>({})})}), /계정 정보/);
});
test("attachment account survives merge and draft restore; account changes stop sharing", () => {
  const files=mergeDriveAttachments([], [{id:"file-a",name:"수업자료",url:"https://drive.google.com/file/d/file-a/view",accountId:"owner-a"}]);
  const restored=cleanAssignmentDraft({attachments:files}).attachments;
  assert.equal(restored[0].accountId,"owner-a");
  assert.doesNotThrow(()=>assertDriveAccount({id:"owner-a"},restored));
  assert.throws(()=>assertDriveAccount({id:"owner-b"},restored), error=>error.scope==="driveSharing" && /수업자료/.test(error.message));
  assert.doesNotThrow(()=>assertDriveAccount({id:"owner-a"},[{id:"legacy-file"}]));
});
test("refresh hints the previous account while explicit reconnect allows choosing another", async () => {
  for (const selectAccount of [false,true]) {
    let config;
    const promise=requestDriveAccessToken({clientId:"client",loginHint:"a@example.com",selectAccount,
      oauth2:{initTokenClient(value){config=value;return {requestAccessToken(){value.callback({access_token:"test-token"});}};}}});
    await promise;
    assert.equal(config.login_hint,selectAccount ? undefined : "a@example.com");
  }
});

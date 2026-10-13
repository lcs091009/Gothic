import test from "node:test";
import assert from "node:assert/strict";
import {recallAssignmentRows} from "./teacherAssignments.js";
test("recall scopes both writes and verification to owner and supports already-absent retries",async()=>{
  const calls=[];
  const client={from(table){const call={table,filters:[]};calls.push(call);const q={delete(){call.delete=true;return q;},select(){return q;},in(...args){call.filters.push(args);return q;},eq(...args){call.filters.push(args);return q;},then(resolve){return Promise.resolve({data:[]}).then(resolve);}};return q;}};
  assert.equal(await recallAssignmentRows(["delivery-1"],"teacher-1",client),1);
  assert.equal(calls.length,2);
  for(const call of calls) assert.deepEqual(call.filters,[["id",["delivery-1"]],["teacher_id","teacher-1"]]);
});
test("a silently blocked DELETE is not reported as completed",async()=>{
  const client={from(){const q={delete(){return q;},select(){return q;},in(){return q;},eq(){return q;},then(resolve){return Promise.resolve({data:[{id:"delivery-1"}]}).then(resolve);}};return q;}};
  await assert.rejects(recallAssignmentRows(["delivery-1"],"teacher-1",client),/권한/);
  await assert.rejects(recallAssignmentRows(["delivery-1","delivery-1"],"teacher-1",client),/확인/);
});

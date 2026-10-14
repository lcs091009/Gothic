import test from "node:test";
import assert from "node:assert/strict";
import {explorationContextPath} from "./explorationPath.js";
test("long conversations keep the original topic with eleven recent choices",()=>{
  const path=["중심 주제",...Array.from({length:20},(_,i)=>`선택 ${i}`)];
  const context=explorationContextPath(path);
  assert.equal(context.length,12);assert.equal(context[0],"중심 주제");assert.equal(context.at(-1),"선택 19");assert.deepEqual(context.slice(1),path.slice(-11));
  assert.deepEqual(explorationContextPath([]),[]);
});

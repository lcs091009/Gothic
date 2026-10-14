import test from "node:test";
import assert from "node:assert/strict";
import {explorationSubjects} from "./explorationSubjects.js";
test("subject options include electives, record subjects and common courses without duplicates",()=>{
  const result=explorationSubjects({selected_choices:{a:[" 미적분 ","생명과학"],b:"invalid"}},[{subject:"생명과학"},{subject:"음악"},{subject:null}]);
  assert.equal(result[0],"미적분");assert.ok(result.includes("음악"));assert.ok(result.includes("국어"));assert.ok(result.includes("정보"));
  assert.equal(result.filter(subject=>subject==="생명과학").length,1);assert.ok(!result.includes("invalid"));
  assert.ok(explorationSubjects(null).length>0);
});

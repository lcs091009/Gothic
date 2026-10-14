import test from "node:test";
import assert from "node:assert/strict";
import {parseExploration,validExplorationPath,readableReferences} from "./exploration.js";
test("references use actual server record order and safe unknown labels",()=>{
  assert.equal(readableReferences("근거 [R1, R2]와 [T1], R99",[{title:"효소 실험"},{title:"독서"}],[{file_name:"수업 자료"}]),"근거 「효소 실험 · 독서」와 「수업 자료」, 「근거 확인 필요」");
});
test("older method responses remain readable as evidence connections",()=>{
  const choice={title:"효소",question:"효소의 성질은 어떤 의미일까?",why:"온도 기록과 연결",method:"방법 안내"};
  const result=parseExploration(JSON.stringify({intro:"기록의 연결",choices:[choice,{...choice,question:"내 선택과 어떻게 이어질까?"}]}));
  assert.equal(result.choices[0].connection,choice.why);assert.equal(result.choices[0].method,undefined);
});
test("bounded exploration rejects malformed, duplicate and oversized choices",()=>{
  const a={title:"비교",question:"온도는 어떤 영향을 줄까?",why:"앞선 온도 기록",connection:"온도 기록과 효소의 성질이 연결됨"};
  const result={intro:"선택에 따라 비교할 수 있어요.",choices:[a,{...a,question:"산도는 어떤 영향을 줄까?"}]};
  assert.deepEqual(parseExploration(JSON.stringify(result)),result);
  for(const bad of ["bad",JSON.stringify({...result,choices:[a,a]}),JSON.stringify({...result,choices:[{...a,question:"x".repeat(401)},a]})]) assert.equal(parseExploration(bad),null);
  for(const path of [null,{},[""],Array(13).fill("질문"),["x".repeat(401)]]) assert.equal(validExplorationPath(path),false);
  assert.ok(validExplorationPath([]));assert.ok(validExplorationPath(["온도 영향"]));
});

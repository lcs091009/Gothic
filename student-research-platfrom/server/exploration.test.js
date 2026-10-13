import test from "node:test";
import assert from "node:assert/strict";
import {parseExploration,validExplorationPath,readableReferences} from "./exploration.js";
test("references use actual server record order and safe unknown labels",()=>{
  assert.equal(readableReferences("근거 [R1, R2]와 [T1], R99",[{title:"효소 실험"},{title:"독서"}],[{file_name:"수업 자료"}]),"근거 「효소 실험 · 독서」와 「수업 자료」, 「근거 확인 필요」");
});
test("bounded exploration rejects malformed, duplicate and oversized choices",()=>{
  const a={title:"비교",question:"온도는 어떤 영향을 줄까?",why:"앞선 온도 기록",method:"온도를 바꾸어 비교"};
  const result={intro:"선택에 따라 비교할 수 있어요.",choices:[a,{...a,question:"산도는 어떤 영향을 줄까?"}]};
  assert.deepEqual(parseExploration(JSON.stringify(result)),result);
  for(const bad of ["bad",JSON.stringify({...result,choices:[a,a]}),JSON.stringify({...result,choices:[{...a,question:"x".repeat(401)},a]})]) assert.equal(parseExploration(bad),null);
  for(const path of [null,{},[""],Array(13).fill("질문"),["x".repeat(401)]]) assert.equal(validExplorationPath(path),false);
  assert.ok(validExplorationPath([]));assert.ok(validExplorationPath(["온도 영향"]));
});

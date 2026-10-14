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
test("bounded exploration rejects malformed input and preserves useful choices",()=>{
  const a={title:"비교",question:"온도는 어떤 영향을 줄까?",why:"앞선 온도 기록",connection:"온도 기록과 효소의 성질이 연결됨"};
  const result={intro:"선택에 따라 비교할 수 있어요.",choices:[a,{...a,question:"산도는 어떤 영향을 줄까?"}]};
  assert.deepEqual(parseExploration(JSON.stringify(result)),result);
  assert.equal(parseExploration("bad"),null);
  assert.equal(parseExploration(JSON.stringify({...result,choices:[a,a]})).choices.length,1);
  assert.equal(parseExploration(JSON.stringify({...result,choices:[{...a,question:"x".repeat(401)},a]})).choices[0].question.length,400);
  for(const path of [null,{},[""],Array(13).fill("질문"),["x".repeat(401)]]) assert.equal(validExplorationPath(path),false);
  assert.ok(validExplorationPath([]));assert.ok(validExplorationPath(["온도 영향"]));
});

test("extracts complete JSON through prose, code fences and quoted braces",()=>{
  const choice={title:"효소",question:'왜 {온도}와 "구조"가 연결될까?',connection:"기록과 연결"};
  const data={intro:'활동에서 {변화}와 "구조"를 비교합니다.',choices:[choice]};
  const json=JSON.stringify(data);
  for(const text of [json,`다음은 설명입니다.\n${json}\n참고해 주세요.`,`설명\n\`\`\`json\n${json}\n\`\`\``]) {
    const parsed=parseExploration(text);assert.equal(parsed.intro,data.intro);assert.equal(parsed.choices[0].question,choice.question);
  }
});
test("long useful explanations and missing optional reasons do not discard a whole reply",()=>{
  const result=parseExploration(JSON.stringify({intro:"설명".repeat(1000),choices:[
    {question:"이 선택은 어떤 의미일까?"},null,{title:"중복",question:"이 선택은 어떤 의미일까?"},
    {title:"구조",question:"구조와 어떻게 이어질까?",connection:"원래 활동의 단백질 구조와 연결"}]}));
  assert.equal(result.intro.length,2000);assert.equal(result.choices.length,2);
  assert.equal(result.choices[0].title,result.choices[0].question);assert.equal(result.choices[0].connection,"");
  assert.equal(result.choices[1].why,result.choices[1].connection);
});
test("retains explanation-only responses and string paragraph arrays without inventing choices",()=>{
  assert.deepEqual(parseExploration(JSON.stringify({intro:["첫 문단","둘째 문단"],choices:[]})),{intro:"첫 문단\n\n둘째 문단",choices:[]});
});
test("rejects incomplete JSON, missing explanations and hostile response sizes without code evaluation",()=>{
  for(const text of ['{"intro":"설명","choices":[', '{"intro":42,"choices":[]}', '{"intro":" ","choices":[]}',
    '({intro:"설명",choices:[]})',"x".repeat(100001),JSON.stringify({intro:["설명",{}],choices:[]})]) assert.equal(parseExploration(text),null);
});

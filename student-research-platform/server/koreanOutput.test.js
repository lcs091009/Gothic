import test from "node:test";
import assert from "node:assert/strict";
import {ensureKoreanOutput,unexpectedLanguage} from "./koreanOutput.js";
test("Korean and scientific English need no rewrite; quoted source language is preserved",async()=>{
  let calls=0;const result=await ensureKoreanOutput({analysis:"**DNA와 PCR**을 비교해요. 작품명은 ‘봄’이에요.",exploration:null},async()=>{calls++;});assert.equal(calls,0);assert.equal(result.languageAdjusted,false);
  assert.equal(unexpectedLanguage('일본어 원문 「こんにちは」의 뜻을 비교해요.'),false);
});
test("one targeted rewrite removes accidental Japanese or Chinese without changing Korean evidence",async()=>{
  let calls=0;const result=await ensureKoreanOutput({analysis:"온도 기록을 比較分析해요.",exploration:{intro:"例えば, 효소의 구조와 연결해요.",choices:[]}},async fields=>{calls++;return Object.fromEntries(fields.map(field=>[field.id,field.text.replace("比較分析","비교·분석").replace("例えば","예를 들어")]));});
  assert.equal(calls,1);assert.equal(result.analysis,"온도 기록을 비교·분석해요.");assert.equal(result.languageOmitted,false);assert.equal(unexpectedLanguage(result.exploration.intro),false);
});
test("unavailable rewriting keeps complete Korean sentences with an explicit omission flag",async()=>{
  const result=await ensureKoreanOutput({analysis:"**실제 온도 기록**이 있어요. これは別の文です。\n반복 횟수를 확인해 봐요.",exploration:null},async()=>{throw new Error("timeout");});
  assert.match(result.analysis,/실제 온도 기록/);assert.match(result.analysis,/반복 횟수/);assert.equal(unexpectedLanguage(result.analysis),false);assert.equal(result.languageOmitted,true);
});

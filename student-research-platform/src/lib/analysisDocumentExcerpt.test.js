import test from "node:test";
import assert from "node:assert/strict";
import {requestDocumentTexts} from "./analysisDocumentExcerpt.js";
import {validDocumentTexts} from "./analysisDocuments.js";
test("request body uses the server evidence budget and keeps full text available for later topics",()=>{
  const text="배경 ".repeat(50000)+"효소 촉매 활성화 에너지 ".repeat(100)+"후반 ".repeat(50000);
  const documents=[{id:"doc",text,characters:text.length,pages:100,unreadPages:0,partial:false}];
  const result=requestDocumentTexts(documents,"효소 촉매");
  assert.ok(result[0].text.length<=12000);assert.match(result[0].text,/효소 촉매/);assert.equal(result[0].partial,true);
  assert.ok(validDocumentTexts(result));assert.equal(documents[0].text,text);assert.equal(documents[0].partial,false);
  assert.ok(JSON.stringify(result).length<JSON.stringify(documents).length/20);
  const many=requestDocumentTexts(Array.from({length:20},(_,index)=>({...documents[0],id:`doc${index}`})),"효소");
  assert.ok(many.reduce((sum,file)=>sum+file.text.length,0)<=60000);assert.ok(validDocumentTexts(many));
  assert.deepEqual(requestDocumentTexts([]),[]);
});

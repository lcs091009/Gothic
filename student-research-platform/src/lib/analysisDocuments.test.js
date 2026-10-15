import test from "node:test";
import assert from "node:assert/strict";
import {analysisDocuments,allowedDocumentIds,packDocumentTexts,validDocumentTexts,DOCUMENT_TEXT_BUDGET} from "./analysisDocuments.js";
test("document sources deduplicate student/teacher attachments and exclude instructions-only links",()=>{
  const records=[{drive_file_id:"same",drive_file_name:"내 자료"},{drive_file_id:"own",drive_file_name:"내 원본"}];
  const files=[{id:"same",name:"공유 자료"},{id:"teacher",name:"수업"},{id:"__instructions__"},{id:"https://evil.test"}];
  assert.deepEqual(analysisDocuments(records,files).map(file=>file.id),["same","own","teacher"]);
  assert.deepEqual([...allowedDocumentIds(records,[{id:"task",attachments:files}])],["same","own","teacher"]);
});
test("long files share a fixed text budget and declare partial content",()=>{
  const documents=Array.from({length:30},(_,index)=>({id:`file${index}`,text:"앞"+"가".repeat(30000)+"끝",characters:30002,pages:3,unreadPages:0,partial:false}));
  const packed=packDocumentTexts(documents);
  assert.equal(packed.length,30);assert.ok(packed.every(file=>file.partial && file.text.startsWith("앞") && file.text.endsWith("끝")));
  assert.ok(packed.reduce((sum,file)=>sum+file.text.length,0)<=DOCUMENT_TEXT_BUDGET);assert.ok(validDocumentTexts(packed));
  for(const value of [null,{},[packed[0],packed[0]],[{...packed[0],characters:0}],[{...packed[0],unreadPages:4}],[{...packed[0],id:"__link__"}]]) assert.equal(validDocumentTexts(value),false);
});

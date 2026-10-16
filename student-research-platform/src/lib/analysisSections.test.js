import test from "node:test";
import assert from "node:assert/strict";
import { analysisSections } from "./analysisSections.js";
import { materialOptions, selectTeacherMaterials } from "./analysisMaterials.js";

test("analysis sections preserve legacy answers and hostile text as text",()=>{
  assert.deepEqual(analysisSections("기존 답변")[0].lines,["기존 답변"]);
  const sections=analysisSections("## 1. 핵심 흐름\n내용 [R1]\n2. 교과 연결\n<script>alert(1)</script>");
  assert.equal(sections[0].lines[0],"내용 [R1]");
  assert.equal(sections[1].lines[0],"<script>alert(1)</script>");
  assert.equal(sections[2].lines.length,0);
});
test("specific attachment selection preserves stored instructions and excludes unchecked files",()=>{
  const materials=[{id:"a",file_name:"과제",description:"검증된 안내",attachments:[{id:"file-1",name:"선택 파일"},{id:"file-2",name:"제외 파일"}]}];
  assert.equal(materialOptions(materials).length,2);
  const selected=selectTeacherMaterials(materials,[{materialId:"a",attachmentId:"file-1"}]);
  assert.equal(selected[0].description,"검증된 안내");
  assert.deepEqual(selected[0].attachments.map(file=>file.id),["file-1"]);
  assert.throws(()=>selectTeacherMaterials(materials,[{materialId:"other",attachmentId:"file-1"}]),/확인/);
  assert.deepEqual(selectTeacherMaterials(materials,[]),[]);
});

test("alternative headings and long legacy prose remain readable through bounded previous/next pages",async()=>{
  const {analysisPages}=await import("./analysisSections.js");
  const pages=analysisPages("**1) 핵심 흐름:**\n- 핵심: **온도**에 따른 차이를 확인했어요.\n② 교과 연결\n"+"자료의 조건을 비교해 보는 것이 좋아요. ".repeat(70));
  assert.equal(pages[0].title,"핵심 흐름");assert.ok(pages.length>2);assert.ok(pages.every(page=>page.lines.length<=3));
  assert.equal(pages.at(-1).title,"교과 연결");assert.ok(pages.at(-1).part>1);
  const plain=analysisPages("긴 설명을 쪽별로 나누어 읽어요. ".repeat(100));assert.ok(plain.length>1);
});

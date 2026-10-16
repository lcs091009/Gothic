import test from "node:test";
import assert from "node:assert/strict";
import {zipSync,strToU8} from "fflate";
import {DOMParser} from "@xmldom/xmldom";
import {readAnalysisDocument,readAnalysisDocuments,pdfDocumentText} from "./readAnalysisDocument.js";
globalThis.DOMParser=DOMParser;
const file={id:"abc",name:"파일"};
function reader(mime,body,name="파일") {
  const urls=[];
  return {urls,fetchImpl:async(url,options)=>{
    urls.push(url);assert.equal(options.headers.Authorization,"Bearer test-token");
    return url.includes("fields=") ? {ok:true,json:async()=>({mimeType:mime,name})} : new Response(body,{status:200});
  }};
}
test("Google docs export actual body and all Google Sheet tabs resolve cell values",async()=>{
  const docs=reader("application/vnd.google-apps.document","효소 활성은 온도에 따라 달라집니다.");
  const result=await readAnalysisDocument(file,"test-token",docs);assert.match(result.text,/효소 활성/);assert.match(docs.urls[1],/export\?mimeType=text%2Fplain/);
  const xml='<worksheet><sheetData><row><c t="s"><v>0</v></c><c><v>42</v></c></row></sheetData></worksheet>';
  const sheets=reader("application/vnd.google-apps.spreadsheet",zipSync({"xl/sharedStrings.xml":strToU8('<sst><si><t>조건 A</t></si></sst>'),"xl/worksheets/sheet1.xml":strToU8(xml),"xl/worksheets/sheet2.xml":strToU8(xml.replace("42","71"))}));
  const sheet=await readAnalysisDocument(file,"test-token",sheets);
  assert.match(sheet.text,/조건 A\t42/);assert.match(sheet.text,/조건 A\t71/);assert.match(sheets.urls[1],/spreadsheetml.sheet/);
});
test("DOCX/PPTX extract text while skipping image bytes",async()=>{
  for(const [name,path] of [["탐구.docx","word/document.xml"],["수업.pptx","ppt/slides/slide1.xml"]]) {
    const f=reader("application/octet-stream",zipSync({[path]:strToU8('<root><t>활성화 에너지</t><t>근거 비교</t></root>'),"word/media/image.png":new Uint8Array(1000)}),name);
    const result=await readAnalysisDocument(file,"test-token",f);assert.match(result.text,/활성화 에너지 근거 비교/);
  }
});
test("spreadsheet cell addresses preserve missing columns, including AA and leading blanks",async()=>{
  const xml='<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>온도</t></is></c><c r="B1" t="inlineStr"><is><t>압력</t></is></c><c r="C1" t="inlineStr"><is><t>속도</t></is></c></row><row><c r="A2"><v>25</v></c><c r="C2"><v>99</v></c><c r="AA2"><v>7</v></c></row></sheetData></worksheet>';
  const body=source=>zipSync({"xl/worksheets/sheet1.xml":strToU8(source)});
  const result=await readAnalysisDocument(file,"test-token",reader("application/octet-stream",body(xml),"실험.xlsx"));
  const [header,row]=result.text.split("\n").map(line=>line.split("\t"));
  assert.deepEqual(header,["온도","압력","속도"]);assert.equal(row[0],"25");assert.equal(row[1],"");assert.equal(row[2],"99");assert.equal(row[26],"7");
  const leading=await readAnalysisDocument(file,"test-token",reader("application/octet-stream",body('<worksheet><row><c r="C1"><v>99</v></c></row></worksheet>'),"실험.xlsx"));
  assert.equal(leading.text,"\t\t99");
  await assert.rejects(readAnalysisDocument(file,"test-token",reader("application/octet-stream",body(xml.replace("AA2","XFE2")),"실험.xlsx")),/열 범위/);
});
test("PDF reads every page, counts image-only pages and destroys resources",async()=>{
  let destroyed=false;const visited=[];
  const result=await pdfDocumentText({numPages:3,getPage:async number=>{visited.push(number);return {getTextContent:async()=>({items:number===2 ? []:[{str:`페이지 ${number}`,hasEOL:true}]}),cleanup(){}};},destroy:async()=>{destroyed=true;}});
  assert.deepEqual(visited,[1,2,3]);assert.equal(result.pages,3);assert.equal(result.unreadPages,1);assert.equal(result.partial,true);assert.ok(destroyed);assert.match(result.text,/페이지 3/);
});
test("image-only PDFs fail before analysis and always release their resources",async()=>{
  let destroyed=false,cleaned=0;
  const result=await readAnalysisDocuments([{id:"scan",name:"스캔.pdf"}],"test-token",{read:()=>pdfDocumentText({
    numPages:2,getPage:async()=>({getTextContent:async()=>({items:[]}),cleanup(){cleaned++;}}),destroy:async()=>{destroyed=true;}
  })});
  assert.deepEqual(result.documents,[]);assert.equal(result.failures.length,1);assert.match(result.failures[0].message,/스캔 PDF/);
  assert.equal(destroyed,true);assert.equal(cleaned,2);
});
test("permission/format failures are listed per file while valid bodies remain available",async()=>{
  const result=await readAnalysisDocuments([{id:"a",name:"내 자료"},{id:"b",name:"권한 제한"}],"test-token",{read:async file=>{
    if(file.id==="b") throw new Error("읽기 권한 없음");return {text:"실제 본문",characters:5,pages:0,unreadPages:0,partial:false};
  }});
  assert.equal(result.documents.length,1);assert.equal(result.failures[0].name,"권한 제한");
  await assert.rejects(readAnalysisDocument(file,"test-token",{fetchImpl:async()=>new Response("",{status:404})}),/읽기 권한/);
  await assert.rejects(readAnalysisDocument(file,"test-token",reader("application/octet-stream","","탐구.hwp")),/PDF나 텍스트/);
});
test("cancellation stops document reads before a subsequent file",async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(readAnalysisDocuments([{id:"a",name:"a"},{id:"b",name:"b"}],"test-token",{signal:controller.signal,read:async()=>{calls++;controller.abort();throw new Error("stopped");}}),{name:"AbortError"});assert.equal(calls,1);
});

test("real PDF.js extracts source text from a valid PDF byte stream",async()=>{
  const content="BT /F1 12 Tf 10 40 Td (Original enzyme source) Tj ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf="%PDF-1.4\n",offsets=[0];for(const [index,value] of objects.entries()) {offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${value}\nendobj\n`;}
  const xref=pdf.length;pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(value=>String(value).padStart(10,"0")+" 00000 n ").join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const result=await pdfDocumentText(await getDocument({data:new TextEncoder().encode(pdf),isEvalSupported:false}).promise);
  assert.equal(result.pages,1);assert.equal(result.partial,false);assert.match(result.text,/Original enzyme source/);
});

test("PDF page reads overlap in batches of three and preserve order despite out-of-order completion",async()=>{
  let active=0,peak=0,cleaned=0,destroyed=0;const releases=new Map();
  const task=pdfDocumentText({numPages:6,getPage:async number=>({
    getTextContent:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>releases.set(number,resolve));active--;return {items:[{str:`본문${number}`}]};},cleanup(){cleaned++;}
  }),destroy:async()=>{assert.equal(active,0);destroyed++;}});
  for(const batch of [[1,2,3],[4,5,6]]) {
    while(!batch.every(page=>releases.has(page))) await new Promise(resolve=>setImmediate(resolve));
    for(const page of [...batch].reverse()) releases.get(page)();
  }
  const result=await task;assert.equal(peak,3);assert.equal(cleaned,6);assert.equal(destroyed,1);
  assert.deepEqual([...result.text.matchAll(/본문(\d)/g)].map(match=>Number(match[1])),[1,2,3,4,5,6]);
});
test("PDF cancellation drains active pages before cleanup and never starts the next batch",async()=>{
  const controller=new AbortController();let visited=0,destroyed=false;
  await assert.rejects(pdfDocumentText({numPages:6,getPage:async()=>{visited++;return {getTextContent:async()=>{controller.abort();return {items:[{str:"본문"}]};},cleanup(){}};},destroy:async()=>{destroyed=true;}},{signal:controller.signal}),{name:"AbortError"});
  assert.equal(visited,3);assert.equal(destroyed,true);
});

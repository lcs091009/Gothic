// Ship CMaps/fonts with the deployment so Korean/CJK PDFs do not depend on
// a third-party CDN. This module is loaded only when a PDF is read.
const urls=import.meta.glob([
  "/node_modules/pdfjs-dist/cmaps/*.bcmap",
  "/node_modules/pdfjs-dist/standard_fonts/*.ttf",
  "/node_modules/pdfjs-dist/standard_fonts/*.pfb",
  "/node_modules/pdfjs-dist/wasm/*.wasm"
],{query:"?url",import:"default",eager:true});
const assets=new Map(Object.entries(urls).map(([path,url])=>[path.slice(path.lastIndexOf("/")+1),url]));
export class PdfBinaryDataFactory {
  async fetch({filename}) {
    const url=assets.get(filename);
    if(!url) throw new Error("PDF의 글꼴 정보를 확인하지 못했습니다.");
    const response=await fetch(url);
    if(!response.ok) throw new Error("PDF 글꼴 자료를 불러오지 못했습니다.");
    return new Uint8Array(await response.arrayBuffer());
  }
}

const endpoint="https://www.googleapis.com/drive/v3/files/";
const TEXT_LIMIT=2_000_000;
function check(signal) {signal?.throwIfAborted();}
export async function pdfDocumentText(document,{signal,onProgress=()=>{}}={}) {
  const pieces=[];let characters=0,kept=0,unreadPages=0,completed=0;
  const readPage=async page=>{
    check(signal);const current=await document.getPage(page);
    try {
      const data=await current.getTextContent();check(signal);
      const text=data.items.map(item=>typeof item.str==="string" ? item.str+(item.hasEOL ? "\n":" "):"").join("").trim();
      completed++;onProgress(`${completed}/${document.numPages}쪽 읽는 중`);
      return {page,text:text.slice(0,TEXT_LIMIT),characters:text.length};
    } finally {current.cleanup();}
  };
  try {
    // Batches overlap up to three Drive range reads, cap retained text memory,
    // and preserve source order even when pages finish out of order.
    for(let start=1;start<=document.numPages;start+=3) {
      check(signal);
      const results=await Promise.allSettled(Array.from({length:Math.min(3,document.numPages-start+1)},(_,index)=>readPage(start+index)));
      const failure=results.find(result=>result.status==="rejected");if(failure) throw failure.reason;
      for(const {value} of results) {
        if(!value.characters) unreadPages++;
        characters+=value.characters;
        const part=value.text.slice(0,Math.max(0,TEXT_LIMIT-kept));kept+=part.length;
        if(part) pieces.push(`[${value.page}쪽]\n${part}`);
      }
    }
    const text=pieces.filter(Boolean).join("\n\n");
    if(!text.trim()) throw new Error("텍스트가 없는 스캔 PDF입니다. 텍스트를 인식한 PDF나 문서로 다시 첨부해 주세요.");
    return {text,characters:Math.max(characters,text.length),pages:document.numPages,unreadPages,partial:characters>kept || unreadPages>0};
  } finally {await (document.loadingTask ? document.loadingTask.destroy() : document.destroy());}
}
async function readPdf(url,token,options) {
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker=await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  const {PdfBinaryDataFactory}=await import("./pdfAssets.js");
  pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
  check(options.signal);
  const task=pdfjs.getDocument({url,httpHeaders:{Authorization:`Bearer ${token}`},withCredentials:false,disableAutoFetch:true,disableStream:true,rangeChunkSize:1024*1024,isEvalSupported:false,BinaryDataFactory:PdfBinaryDataFactory,useWorkerFetch:false});
  const abort=()=>{task.destroy().catch(()=>{});};options.signal?.addEventListener("abort",abort,{once:true});
  try {return await pdfDocumentText(await task.promise,options);} finally {options.signal?.removeEventListener("abort",abort);}
}
function xmlText(xml) {
  const document=new DOMParser().parseFromString(xml,"application/xml");
  if(document.getElementsByTagName("parsererror").length) throw new Error("문서 내부의 텍스트를 읽지 못했습니다.");
  return [...document.getElementsByTagName("*")].filter(node=>["t","v"].includes(node.localName)).map(node=>node.textContent).join(" ");
}
async function readOffice(buffer) {
  const {unzipSync}=await import("fflate");let expanded=0;
  const files=unzipSync(new Uint8Array(buffer),{filter:file=>{
    const keep=/^(word\/(document|footnotes|endnotes)|ppt\/slides\/slide\d+|xl\/(sharedStrings|worksheets\/sheet\d+))\.xml$/.test(file.name);
    if(keep && (expanded+=file.originalSize)>32*1024*1024) throw new Error("문서의 텍스트 구조가 너무 큽니다. PDF나 텍스트로 내보내 첨부해 주세요.");
    return keep;
  }});
  const names=Object.keys(files).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const shared=files["xl/sharedStrings.xml"] ? new DOMParser().parseFromString(new TextDecoder().decode(files["xl/sharedStrings.xml"]),"application/xml") : null;
  const strings=shared ? [...shared.getElementsByTagName("si")].map(node=>[...node.getElementsByTagName("t")].map(part=>part.textContent).join("")) : [];
  const text=names.filter(name=>name!=="xl/sharedStrings.xml").map(name=>{
    const xml=new TextDecoder().decode(files[name]);
    if(!name.startsWith("xl/worksheets/")) return xmlText(xml);
    const document=new DOMParser().parseFromString(xml,"application/xml");
    return [...document.getElementsByTagName("row")].map(row=>{
      const values=[];let column=0;
      for(const cell of row.getElementsByTagName("c")) {
        const address=cell.getAttribute("r");
        if(address) {
          const letters=/^([A-Z]{1,3})[1-9]\d*$/.exec(address)?.[1];
          if(!letters) throw new Error("시트의 셀 주소를 읽지 못했습니다.");
          column=0;for(const letter of letters) column=column*26+letter.charCodeAt(0)-64;
          column--;
        }
        if(column>=16384) throw new Error("시트의 열 범위를 확인해 주세요.");
        const value=cell.getElementsByTagName("v")[0]?.textContent || "";
        values[column++]=cell.getAttribute("t")==="s" ? strings[Number(value)] || "" : cell.getAttribute("t")==="inlineStr" ? [...cell.getElementsByTagName("t")].map(part=>part.textContent).join("") : value;
      }
      return values.join("\t");
    }).join("\n");
  }).join("\n\n");
  return text;
}
async function download(response,signal) {
  if(!response.ok) {
    if(response.status===401) throw new Error("Google 연결이 만료되었습니다. 자료 계정을 다시 연결해 주세요.");
    if(response.status===403 || response.status===404) throw new Error("연결한 계정 또는 앱에 이 파일의 읽기 권한이 없습니다. 파일을 열 수 있는 계정으로 연결하고 Google 파일 선택창에서 다시 선택해 주세요.");
    throw new Error(`자료 다운로드에 실패했습니다. [Google ${response.status}]`);
  }
  const reader=response.body?.getReader();if(!reader) return response.arrayBuffer();
  const chunks=[];let bytes=0;
  try {
    while(true) {check(signal);const part=await reader.read();if(part.done) break;bytes+=part.value.length;
      if(bytes>500*1024*1024) throw new Error("첨부 허용 용량 500MB를 초과했습니다.");chunks.push(part.value);}
  } catch(error) {await reader.cancel().catch(()=>{});throw error;} finally {reader.releaseLock();}
  const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks) {all.set(chunk,offset);offset+=chunk.length;}return all.buffer;
}
export async function readAnalysisDocument(file,token,{signal,onProgress=()=>{},fetchImpl=fetch,pdfReader=readPdf}={}) {
  check(signal);
  const headers={Authorization:`Bearer ${token}`};const id=encodeURIComponent(file.id);
  const metadata=await fetchImpl(`${endpoint}${id}?supportsAllDrives=true&fields=name,mimeType,capabilities(canDownload)`,{headers,signal});
  if(!metadata.ok) {await download(metadata,signal);}
  const info=await metadata.json();
  if(info.capabilities?.canDownload===false) throw new Error("소유자가 다운로드를 제한한 자료입니다. 선생님께 본문 열람 허용을 요청해 주세요.");
  const mime=info.mimeType || "",name=info.name || file.name;
  if(mime==="application/pdf" || /\.pdf$/i.test(name)) return pdfReader(`${endpoint}${id}?alt=media&supportsAllDrives=true`,token,{signal,onProgress});
  let url=`${endpoint}${id}?alt=media&supportsAllDrives=true`,office=false;
  if(mime==="application/vnd.google-apps.document" || mime==="application/vnd.google-apps.presentation") url=`${endpoint}${id}/export?mimeType=text%2Fplain`;
  else if(mime==="application/vnd.google-apps.spreadsheet") {url=`${endpoint}${id}/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet`;office=true;}
  else if(/\.(docx|pptx|xlsx)$/i.test(name)) office=true;
  else if(!mime.startsWith("text/") && !/\.(txt|csv|md|json)$/i.test(name)) throw new Error("본문 읽기는 PDF·Google 문서/시트/슬라이드·DOCX·PPTX·XLSX·텍스트를 지원합니다. 이 파일은 PDF나 텍스트로 내보내 주세요.");
  onProgress("본문 다운로드 중");const response=await fetchImpl(url,{headers,signal});const buffer=await download(response,signal);check(signal);
  const text=office ? await readOffice(buffer) : new TextDecoder().decode(buffer).trim();check(signal);
  if(!text.trim()) throw new Error("읽을 수 있는 텍스트가 없습니다. 이미지 자료는 텍스트를 인식한 PDF로 첨부해 주세요.");
  return {text:text.slice(0,TEXT_LIMIT),characters:text.length,pages:0,unreadPages:0,partial:text.length>TEXT_LIMIT};
}
export async function readAnalysisDocuments(files,token,{signal,onProgress=()=>{},read=readAnalysisDocument}={}) {
  const documents=[],failures=[];
  // One document at a time bounds browser memory, including large PDFs.
  for(const [index,file] of files.entries()) {
    check(signal);onProgress(`${index+1}/${files.length} · ${file.name}`);
    try {documents.push({id:file.id,...await read(file,token,{signal,onProgress:detail=>onProgress(`${index+1}/${files.length} · ${file.name} · ${detail}`)})});}
    catch(error) {check(signal);failures.push({id:file.id,name:file.name,message:error.message || "본문을 읽지 못했습니다."});}
  }
  return {documents,failures};
}

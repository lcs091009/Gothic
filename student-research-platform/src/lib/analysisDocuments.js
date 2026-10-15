import {materialOptions} from "./analysisMaterials.js";
export const DOCUMENT_TEXT_BUDGET=500_000;
const validId=id=>typeof id==="string" && /^[\w-]{1,200}$/.test(id) && !id.startsWith("__");
export function analysisDocuments(records,files) {
  const byId=new Map();
  for(const record of records) if(validId(record.drive_file_id)) byId.set(record.drive_file_id,{id:record.drive_file_id,name:record.drive_file_name || "활동 첨부",source:"학생"});
  for(const file of files) if(validId(file.id)) byId.set(file.id,{id:file.id,name:file.name || "선생님 첨부",source:"선생님"});
  return [...byId.values()];
}
export function allowedDocumentIds(records,materials) {
  return new Set(analysisDocuments(records,materialOptions(materials)).map(file=>file.id));
}
// Evenly sample across the entire document when it exceeds the request budget.
// The original character count and partial status are always sent alongside it.
export function sampleDocument(text,budget) {
  if(text.length<=budget) return text;
  const pieces=8,marker="\n[자료 중간 발췌]\n",part=Math.max(0,Math.floor((budget-marker.length*(pieces-1))/pieces));
  if(!part) return text.slice(0,budget);
  return Array.from({length:pieces},(_,i)=>text.slice(Math.floor((text.length-part)*i/(pieces-1)),Math.floor((text.length-part)*i/(pieces-1))+part)).join(marker).slice(0,budget);
}
export function packDocumentTexts(documents) {
  const share=Math.floor(DOCUMENT_TEXT_BUDGET/Math.max(1,documents.length));
  return documents.map(file=>({...file,text:sampleDocument(file.text,share),partial:file.partial || file.text.length>share}));
}
export function validDocumentTexts(documents) {
  if(!Array.isArray(documents)) return false;
  let total=0;const ids=new Set();
  for(const file of documents) {
    if(!file || !validId(file.id) || ids.has(file.id) || typeof file.text!=="string" || !file.text.trim() ||
      !Number.isSafeInteger(file.characters) || file.characters<file.text.length || typeof file.partial!=="boolean" ||
      !Number.isSafeInteger(file.pages) || file.pages<0 || !Number.isSafeInteger(file.unreadPages) || file.unreadPages<0 || file.unreadPages>file.pages) return false;
    ids.add(file.id);total+=file.text.length;
  }
  return total<=DOCUMENT_TEXT_BUDGET;
}

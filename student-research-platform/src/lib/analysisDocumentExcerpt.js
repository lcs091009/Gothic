import {sampleDocument} from "./analysisDocuments.js";
// Keep passages spread through a long source plus passages matching the selected
// subject/question. Work is linear in text length with at most 12 query terms.
export function documentExcerpt(text,budget,focus="") {
  if(text.length<=budget) return text;
  const terms=[...new Set(focus.split(/[^\p{L}\p{N}]+/u).filter(term=>term.length>=2))].slice(0,12);
  if(!terms.length) return sampleDocument(text,budget);
  const relevant=[],limit=Math.max(1,Math.floor(budget/2400));
  for(let i=0;i<text.length;i+=1200) {
    const value=text.slice(i,i+1200),score=terms.reduce((sum,term)=>sum+(value.includes(term)?1:0),0);
    if(!score) continue;
    relevant.push({value,index:i,score});
    relevant.sort((a,b)=>b.score-a.score || a.index-b.index);
    if(relevant.length>limit) relevant.pop();
  }
  const context=sampleDocument(text,Math.floor(budget/2));
  return (context+"\n[선택한 과목·질문과 연결되는 발췌]\n"+relevant.sort((a,b)=>a.index-b.index).map(chunk=>chunk.value).join("\n[발췌]\n")).slice(0,budget);
}

// Send exactly the evidence budget used by the server, retaining the fuller
// browser copy so later questions can select different relevant passages.
export function requestDocumentTexts(documents,focus="") {
  const budget=Math.min(12000,Math.floor(60000/Math.max(1,documents.length)));
  return documents.map(file=>({...file,text:documentExcerpt(file.text,budget,focus),partial:file.partial || file.text.length>budget}));
}

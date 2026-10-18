const titles=["핵심 흐름","교과 연결","다음 탐구","기록 보완과 바로 할 일"];
export function analysisSections(text) {
  const sections=titles.map((title,index)=>({title,number:index+1,lines:[]}));
  let active=0,found=false;
  for(const line of String(text || "").split(/\r?\n/)) {
    const clean=line.trim().replace(/^#{1,6}\s*/,"").replace(/\*\*/g,"");
    const match=clean.match(/^(?:[1-4①②③④][.．):、\s]*\s*)?(핵심 흐름|교과 연결|다음 탐구|기록 보완과 바로 할 일|기록 보완과 선택 가능한 준비)\s*[:：]?$/);
    if(match) {active=match[1].startsWith("기록 보완") ? 3:titles.indexOf(match[1]);found=true;continue;}
    if(line.trim()) sections[active].lines.push(line);
  }
  return found ? sections:[{title:"분석 내용",number:1,lines:sections.flatMap(section=>section.lines)}];
}
function chunks(line,limit=230) {
  const result=[];let remaining=line.trim();
  while(remaining.length>limit) {
    const target=remaining.slice(0,limit+1),sentence=[...target.matchAll(/[.!?。！？](?:["'”’]?\s|$)/g)].at(-1);
    let cut=sentence && sentence.index>limit/3 ? sentence.index+sentence[0].length:target.lastIndexOf(" ");
    if(cut<limit/3) cut=limit;
    const marks=[...remaining.slice(0,cut).matchAll(/\*\*/g)];
    if(marks.length%2) {const opening=marks.at(-1).index,closing=remaining.indexOf("**",cut);if(opening>limit/3) cut=opening;else if(closing>=0 && closing<limit+100) cut=closing+2;}
    result.push(remaining.slice(0,cut).trim());remaining=remaining.slice(cut).trim();
  }
  if(remaining) result.push(remaining);return result;
}
export function analysisPages(text) {
  return analysisSections(text).filter(section=>section.lines.length).flatMap(section=>{
    const blocks=section.lines.flatMap(line=>chunks(line));const pages=[];
    for(let start=0;start<blocks.length;start+=3) pages.push({...section,lines:blocks.slice(start,start+3),part:pages.length+1});
    return pages.map(page=>({...page,parts:pages.length}));
  });
}

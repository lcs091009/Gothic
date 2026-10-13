const titles = ["핵심 흐름", "교과 연결", "다음 탐구", "기록 보완과 바로 할 일"];
export function analysisSections(text) {
  const sections = titles.map((title,index)=>({title,number:index+1,lines:[]}));
  let active=0,found=false;
  for(const line of String(text || "").split(/\r?\n/)) {
    const clean=line.trim().replace(/^#{1,3}\s+/,"").replace(/^\*\*(.*)\*\*$/,"$1");
    const match=clean.match(/^([1-4])\. (핵심 흐름|교과 연결|다음 탐구|기록 보완과 바로 할 일)$/);
    if(match) { active=Number(match[1])-1;found=true;continue; }
    if(line.trim()) sections[active].lines.push(line);
  }
  return found ? sections : [{title:"분석 내용",number:1,lines:sections.flatMap(section=>section.lines)}];
}

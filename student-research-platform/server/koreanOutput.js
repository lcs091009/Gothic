export const KOREAN_OUTPUT_GUIDE="학생에게 보여 주는 설명·제목·질문은 자연스러운 한국어 해요체로만 작성한다. 일본어·중국어 문장과 접속어를 섞지 않는다. DNA·PCR·AI 같은 필요한 영문 용어·수식은 유지하고 뜻을 한국어로 설명한다. 외국어 과목의 실제 인용문·작품명은 따옴표로 구분하고 해설은 한국어로 쓴다.";
export function unexpectedLanguage(text) {
  const narrative=String(text || "").replace(/[“「『][^”」』\n]{1,200}[”」』]/g,"").replace(/"[^"\n]{1,200}"/g,"");
  return /[\p{Script=Hiragana}\p{Script=Katakana}]|[\p{Script=Han}]{2,}/u.test(narrative);
}
export async function ensureKoreanOutput(value,rewrite) {
  const result=structuredClone(value),fields=[];
  const add=(object,key)=>{if(typeof object?.[key]==="string" && unexpectedLanguage(object[key])) fields.push({object,key,id:String(fields.length),text:object[key]});};
  add(result,"analysis");add(result.exploration,"intro");
  for(const choice of result.exploration?.choices || []) for(const key of ["title","subject","question","why","connection"]) add(choice,key);
  for(const guide of result.exploration?.guidelines || []) for(const key of ["title","detail","question"]) add(guide,key);
  if(!fields.length) return {...result,languageAdjusted:false,languageOmitted:false};
  let replacements={};try {replacements=await rewrite(fields.slice(0,10).map(({id,text})=>({id,text})));}catch { /* Keep complete Korean sentences if a bounded rewrite is unavailable. */ }
  let omitted=false;
  for(const field of fields) {
    const replacement=replacements?.[field.id];
    if(typeof replacement==="string" && replacement.trim() && replacement.length<=20000 && !unexpectedLanguage(replacement)) field.object[field.key]=replacement.trim();
    else {omitted=true;field.object[field.key]=field.text.split(/(?<=[.!?。！？])\s+|\n+/).filter(sentence=>!unexpectedLanguage(sentence)).join("\n").trim();}
  }
  if(result.exploration) {
    result.exploration.choices=result.exploration.choices.filter(choice=>choice.question).map(choice=>({...choice,title:choice.title || choice.question}));
    if(result.exploration.guidelines) result.exploration.guidelines=result.exploration.guidelines.filter(guide=>guide.detail).map(guide=>({...guide,title:guide.title || "확인할 점"}));
  }
  return {...result,languageAdjusted:true,languageOmitted:omitted};
}

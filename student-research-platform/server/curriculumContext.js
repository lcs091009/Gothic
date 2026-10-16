import courses from "../src/data/curriculumStandards/index.js";
import textbooks from "./textbookUnits.js";
const normalize=value=>String(value || "").normalize("NFKC").replace(/[\s·⋅･]/g,"").replace(/Ⅰ/g,"I").replace(/Ⅱ/g,"II");
const lookup=new Map(courses.map(course=>[`${course.revision}:${normalize(course.subject)}`,course]));
export function curriculumLearningContext(curriculum,records,subject="",focus=subject) {
  const revision=curriculum.admissionYear ? Number(curriculum.admissionYear)>=2025 ? "2022":"2015":"";
  const subjects=[...new Set([subject,...curriculum.selected,...records.map(record=>record.subject)].filter(Boolean))];
  const terms=[...new Set([focus,...records.slice(0,8).flatMap(record=>[record.title,record.content?.slice(0,1000)])].join(" ").split(/[^\p{L}\p{N}]+/u).filter(word=>word.length>=2))].slice(0,24);
  const matched=[],missing=[];
  for(const subject of subjects) {
    const course=lookup.get(`${revision}:${normalize(subject)}`);
    if(!course) {missing.push(subject);continue;}
    if(matched.length>=8) continue;
    const ranked=course.standards.map((standard,index)=>({standard,index,score:terms.reduce((score,term)=>score+(standard.objective.includes(term) || standard.area.includes(term) ? 1:0),0)})).sort((a,b)=>b.score-a.score || a.index-b.index).slice(0,4).sort((a,b)=>a.index-b.index);
    matched.push({subject:course.subject,revision,source:course.source,criteria:ranked.map(item=>item.standard)});
  }
  const textbookReferences=textbooks.filter(book=>book.revision===revision && subjects.some(subject=>normalize(subject)===normalize(book.subject)));
  return {textbookReferences,revision:revision || "입학 연도 확인 필요",courses:matched,unverifiedSubjects:missing.slice(0,30),
    coverage:"교육부 원문에서 발췌한 국가 성취기준·내용 영역. 과목별 관련 기준 최대 4개. textbookReferences는 해당 과목·개정과 일치하는 참고 교과서 목차이며 학생 사용 교과서·수강·진도를 뜻하지 않음. 차시별 학습목표·학교 진도·실제 학습 여부는 미확인.",
    rule:"제공된 criteria의 내용과 근거를 우선 사용한다. 기준의 code·area·objective를 바꾸거나 없는 기준을 만들지 않는다. 목표는 성취기준을 바탕으로 학생이 이해·설명·비교할 수 있는 것으로 풀어 쓴다. 주제 분석과 심화탐구에서만 textbookReferences의 대·중·소단원을 자료 속 개념과 연결한다. 해당 단원을 쓸 때 참고 교과서명을 밝히고 학생이 이 교과서를 사용하거나 해당 단원을 이수했다고 단정하지 않는다. 실제 자료·선택한 주제와 무관한 단원은 언급하지 않는다. lessonObjective가 null이면 수업별 학습목표 미확보이며 criteria의 성취기준으로 대체하거나 추측하지 않는다. 참고 목록과 첨부 원문에 없는 단원은 미확인으로 둔다. 일부 기준만 발췌했으므로 목록에 없다는 이유만으로 고교 범위 밖이라고 단정하지 않는다. 고교 범위의 연결과 대학 수준의 확장 개념을 구분하고 대학 개념은 선택 확장으로만 제시하며 선행 지식을 짧게 설명한다."};
}

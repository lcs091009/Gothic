import courses from "../src/data/curriculumStandards/index.js";
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
  return {revision:revision || "입학 연도 확인 필요",courses:matched,unverifiedSubjects:missing.slice(0,30),
    coverage:"교육부 원문에서 발췌한 국가 성취기준·내용 영역. 과목별 관련 기준 최대 4개. 교과서 대·중·소단원·차시별 학습목표·학교 진도·실제 학습 여부는 미확인.",
    rule:"제공된 criteria의 내용과 근거를 우선 사용한다. 기준의 code·area·objective를 바꾸거나 없는 기준을 만들지 않는다. 목표는 성취기준을 바탕으로 학생이 이해·설명·비교할 수 있는 것으로 풀어 쓴다. 대·중·소단원은 첨부 원문에 명시된 경우에만 이름을 인용하고 없으면 단원 미확인으로 둔다. 일부 기준만 발췌했으므로 목록에 없다는 이유만으로 고교 범위 밖이라고 단정하지 않는다. 고교 범위의 연결과 대학 수준의 확장 개념을 구분하고 대학 개념은 선택 확장으로만 제시하며 선행 지식을 짧게 설명한다."};
}

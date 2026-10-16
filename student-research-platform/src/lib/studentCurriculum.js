import {curriculumByCurrentGrade} from "../data/curriculumChoices.js";
const clean = values => [...new Set(values.slice(0,160).filter(value=>typeof value==="string" && value.trim() && value.trim().length<=80 && !Array.from(value).some(char=>char.charCodeAt(0)<32 || char.charCodeAt(0)===127)).map(value=>value.trim()))];
export function studentCurriculum(profile={}) {
  profile=profile || {};
  const raw=String(profile.current_grade || profile.grade || "");
  const grade=/^[123](학년)?$/.test(raw) ? `${raw[0]}학년`:raw;
  const curriculum=curriculumByCurrentGrade[grade];
  const saved={...profile.grade2_choices,...profile.grade3_choices,...profile.selected_choices};
  const groups=(curriculum?.groups || []).map(group=>({
    semester:group.semesterLabel,offered:group.subjects,
    selected:clean(Array.isArray(saved[group.id]) ? saved[group.id]:[]).filter(subject=>group.subjects.includes(subject)),
  }));
  const selected=clean(groups.flatMap(group=>group.selected));
  const unverified=clean(Object.values(saved).slice(0,64).flatMap(value=>Array.isArray(value) ? value:[])).filter(subject=>!selected.includes(subject));
  return {grade,admissionYear:curriculum?.admissionYear || "",label:curriculum?.curriculumLabel || "편제표 미등록",groups,selected,unverified,
    offered:clean(groups.flatMap(group=>group.offered)),
    coverage:"저장된 선택과목 편제만 포함. 공통·필수 과목 전체 편제 및 실제 이수 여부는 확인되지 않음",
    recommendationRule:"selected는 학생이 저장한 선택과목이므로 우선 연결. offered는 개설 과목이며 수강 중이라고 단정하지 말 것. unverified는 해당 학년 편제와 대조되지 않은 저장값. 활동의 과목도 참고하되 모든 개설 과목을 이 학생의 수강 과목으로 간주하지 말 것."};
}
export function subjectGroups(profile,records=[]) {
  const curriculum=studentCurriculum(profile);
  const used=new Set();
  const group=(label,values)=>({label,subjects:clean(values).filter(value=>{if(used.has(value)) return false;used.add(value);return true;})});
  return [group("내가 저장한 선택과목",curriculum.selected),group("활동에 기록된 과목",records.map(record=>record.subject)),
    group(`${curriculum.label} · 다른 개설 과목`,curriculum.offered),group("추가 저장 과목 · 편제 확인 필요",curriculum.unverified),
    group("기타 과목",["국어","수학","영어","사회","한국사","물리학","화학","생명과학","지구과학","정보"])].filter(group=>group.subjects.length);
}

export const CURRICULUM_GUIDANCE = "교과 연결에서는 academic.curriculum의 학년·입학 연도별 편제와 selected(저장한 선택과목)를 우선 참고한다. offered는 개설 목록이므로 전부 수강 중이라고 말하지 않는다. unverified는 수강 확인이 안 된 값이다. 과목을 직접 지정하면 그 선택을 존중하고 자료의 실제 근거와 연결한다. 공통·필수 과목 전체 편제는 제공되지 않았으므로 없는 과목이나 이수 사실을 만들지 않는다. academic.learning의 해당 개정 교육과정 성취기준과 내용 영역을 고교 범위 판단에 사용한다. 교과서 대·중·소단원과 수업별 학습목표·진도는 확인된 첨부 근거가 있을 때만 명시하며 없는 정보를 만들지 않는다. 대학 수준 내용은 필수처럼 제시하지 않고 고교 개념에서 출발하는 선택 확장으로 구분한다. analysis와 exploration의 intro와 guidelines.detail에서 가장 중요한 개념·판단 기준 1~2개만 **굵게** 표시하며 문장 전체를 강조하지 않는다.";

// 교육과정 과목/단원 데이터 접근
// - curriculum.2022.standards.json: 고등 97과목 전체 성취기준(영역은 번호)
// - subjects.2022.json: 정보 과목만 영역명까지 상세
import standards from "../data/curriculum.2022.standards.json";
import detailed from "../data/subjects.2022.json";

// 영역명을 아는 과목(현재 정보만). abbr -> { area_code -> 영역명 }
const AREA_NAMES = {};
for (const s of detailed.subjects || []) {
  // subjects.2022.json 의 정보는 abbr 키가 없으므로 '정'으로 매핑
  const abbr = s.abbr || (s.subject_name === "정보" ? "정" : s.subject_name);
  AREA_NAMES[abbr] = {};
  for (const a of s.areas || []) {
    AREA_NAMES[abbr][a.area_code] = a.unit_name;
  }
}

export function getSubjects() {
  return (standards.subjects || []).map((s) => ({
    abbr: s.abbr,
    name: s.subject_name,
    category: s.category,
    verified: s.label_verified,
    count: s.total_standards,
    hasUnitNames: Boolean(AREA_NAMES[s.abbr]),
  }));
}

export function getSubjectDetail(abbr) {
  const s = (standards.subjects || []).find((x) => x.abbr === abbr);
  if (!s) {
    return null;
  }

  const names = AREA_NAMES[abbr] || {};
  return {
    abbr: s.abbr,
    name: s.subject_name,
    category: s.category,
    areas: (s.areas || []).map((a) => ({
      area_code: a.area_code,
      // 우선순위: 추출된 영역명 → 정보 상세 → 폴백
      area_name: a.area_name || names[a.area_code] || `영역 ${a.area_code}`,
      standards: a.standards,
    })),
  };
}

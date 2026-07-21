// ============================================================
// 교육과정 버전 자동 판별 (스펙 14단계 - 1단계)
//
// 규칙(연차 적용): 2022 개정 교육과정은 2025학년도 "고1"부터 적용됩니다.
//   - 고1 입학 연도(entryYear)가 2025 이상  -> "2022"
//   - 그 이전(2024 이하)                     -> "2015"
//
// 검증 예시:
//   2026학년도 고3 -> 입학 2024 -> 2015
//   2026학년도 고2 -> 입학 2025 -> 2022
//   2026학년도 고1 -> 입학 2026 -> 2022
//   2027학년도 전 학년        -> 2022
// ============================================================

export const CURRICULUM_2015 = "2015";
export const CURRICULUM_2022 = "2022";

// 2022 개정이 처음 적용된 고1 입학 연도(경계값). 나중에 바뀌면 여기만 고치면 됩니다.
export const CURRICULUM_2022_FROM_ENTRY_YEAR = 2025;

export const CURRICULUM_LABELS = {
  [CURRICULUM_2015]: "2015 개정 교육과정",
  [CURRICULUM_2022]: "2022 개정 교육과정",
};

// 학번 앞 2자리(예: "26")로 입학 연도 추정: 26 -> 2026
export function admissionYearFromStudentNumberPrefix(prefix) {
  const value = Number(prefix);

  if (!Number.isFinite(value)) {
    return null;
  }

  return 2000 + value;
}

// 학년도 + 학년으로 고1 입학 연도 계산. 예) 2026학년도 고3 -> 2024
export function computeAdmissionYear({ academicYear, grade }) {
  if (!academicYear || !grade) {
    return null;
  }

  return academicYear - (grade - 1);
}

// 핵심: 교육과정 버전 판별. admissionYear가 있으면 우선 사용하고,
// 없으면 학년도/학년으로 계산한다.
export function determineCurriculumVersion({
  academicYear,
  grade,
  admissionYear,
}) {
  const entryYear =
    admissionYear || computeAdmissionYear({ academicYear, grade });

  if (!entryYear) {
    return null;
  }

  return entryYear >= CURRICULUM_2022_FROM_ENTRY_YEAR
    ? CURRICULUM_2022
    : CURRICULUM_2015;
}

// 판별 결과 + 화면에 보여줄 설명(스펙 1단계 "판별 결과 확인 문구")
export function describeCurriculum({ academicYear, grade, admissionYear }) {
  const version = determineCurriculumVersion({
    academicYear,
    grade,
    admissionYear,
  });

  if (!version) {
    return null;
  }

  const entryYear =
    admissionYear || computeAdmissionYear({ academicYear, grade });

  return {
    version,
    label: CURRICULUM_LABELS[version],
    entryYear,
    reason: `${entryYear}년 고1 입학 기준 → ${CURRICULUM_LABELS[version]}`,
  };
}

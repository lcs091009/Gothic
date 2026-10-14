const commonSubjects = ["국어", "수학", "영어", "사회", "한국사", "물리학", "화학", "생명과학", "지구과학", "정보"];
export function explorationSubjects(profile, records = []) {
  const selected = Object.values(profile?.selected_choices || {}).flatMap(value => Array.isArray(value) ? value : []);
  return [...new Set([...selected, ...records.map(record => record.subject), ...commonSubjects]
    .filter(value => typeof value === "string" && value.trim() && value.trim().length <= 80 && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    .map(value => value.trim()))];
}

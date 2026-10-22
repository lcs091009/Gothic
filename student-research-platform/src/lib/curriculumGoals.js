// Group national achievement standards by content area (the closest official
// unit to a textbook chapter) without inventing lesson-level objectives.
export const normalizeSubject=value=>String(value || "").normalize("NFKC").replace(/[\s·⋅･]/g,"").replace(/Ⅰ/g,"I").replace(/Ⅱ/g,"II");

export function revisionFor(admissionYear) {
  return admissionYear ? Number(admissionYear)>=2025 ? "2022":"2015" : "2022";
}

export function courseUnits(course,query="") {
  const keyword=String(query).trim();
  const units=new Map();
  for(const standard of course?.standards || []) {
    if(keyword && !`${standard.code} ${standard.area} ${standard.objective}`.includes(keyword)) continue;
    const area=standard.area || "영역 미분류";
    if(!units.has(area)) units.set(area,[]);
    units.get(area).push(standard);
  }
  return [...units].map(([area,standards],index)=>({number:index+1,area,standards}));
}

export function textbookChapters(book) {
  const chapters=new Map();
  for(const unit of book?.units || []) {
    if(!chapters.has(unit.large)) chapters.set(unit.large,[]);
    chapters.get(unit.large).push(unit);
  }
  return [...chapters].map(([title,units])=>({title,units}));
}

// Student's own subjects first, then every course of the revision.
export function subjectOptions(courses,revision,preferred=[]) {
  const available=courses.filter(course=>course.revision===revision);
  const byName=new Map(available.map(course=>[normalizeSubject(course.subject),course.subject]));
  const mine=[...new Set(preferred.map(subject=>byName.get(normalizeSubject(subject))).filter(Boolean))];
  const others=available.map(course=>course.subject).filter(subject=>!mine.includes(subject)).sort((a,b)=>a.localeCompare(b,"ko"));
  return {mine,others};
}

import { useEffect, useMemo, useState } from "react";
import styles from "../styles/appStyles";
import { studentCurriculum } from "../lib/studentCurriculum";
import { courseUnits, normalizeSubject, revisionFor, subjectOptions, textbookChapters } from "../lib/curriculumGoals";

export default function CurriculumGoalsPage({ academicProfile, records = [] }) {
  const curriculum = useMemo(() => studentCurriculum(academicProfile), [academicProfile]);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(() => revisionFor(curriculum.admissionYear));
  const [subject, setSubject] = useState("");
  const [query, setQuery] = useState("");

  // The standards are large; load them only when this tab is opened.
  useEffect(() => {
    let alive = true;
    Promise.all([import("../data/curriculumStandards/index.js"), import("../../server/textbookUnits.js")])
      .then(([standards, textbooks]) => { if (alive) setData({ courses: standards.default, textbooks: textbooks.default }); })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, []);

  const options = useMemo(() => data ? subjectOptions(data.courses, revision,
    [...curriculum.selected, ...curriculum.unverified, ...records.map(record => record.subject)]) : { mine: [], others: [] }, [data, revision, curriculum, records]);
  const current = subject && [...options.mine, ...options.others].includes(subject) ? subject : options.mine[0] || options.others[0] || "";
  const course = data?.courses.find(item => item.revision === revision && item.subject === current);
  const units = useMemo(() => courseUnits(course, query), [course, query]);
  const book = data?.textbooks.find(item => item.revision === revision && normalizeSubject(item.subject) === normalizeSubject(current));

  if (loadError) return <section className="inner-page" style={styles.box}><p role="alert" style={styles.text}>교육과정 자료를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.</p></section>;
  if (!data) return <section className="inner-page skeleton-panel" style={styles.box}><div className="mini-spinner" aria-hidden="true" /><p style={styles.text} role="status">교육과정 자료를 불러오는 중이에요.</p></section>;

  return (
    <section className="inner-page curriculum-goals" style={styles.box}>
      <p style={styles.text}>교육부가 고시한 국가 교육과정의 <strong>내용 영역(단원 묶음)</strong>과 영역별 <strong>성취기준(학습목표)</strong>이에요. 교과서의 단원 이름과 순서는 출판사마다 다를 수 있어요.</p>
      <div className="curriculum-goals-controls">
        <div role="group" aria-label="교육과정 개정">
          {["2022", "2015"].map(value => (
            <button key={value} type="button" aria-pressed={revision === value} onClick={() => setRevision(value)}>{value} 개정</button>
          ))}
        </div>
        <label style={styles.label}>과목
          <select value={current} onChange={event => setSubject(event.target.value)}>
            {options.mine.length > 0 && <optgroup label="내 과목">{options.mine.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>}
            <optgroup label="전체 과목">{options.others.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>
          </select>
        </label>
        <label style={styles.label}>검색 <span className="field-optional">선택</span>
          <input type="search" value={query} placeholder="예: 운동량, 함수" onChange={event => setQuery(event.target.value)} />
        </label>
      </div>
      {curriculum.admissionYear && <p className="record-meta">{curriculum.label} 기준으로 {revisionFor(curriculum.admissionYear)} 개정 교육과정을 먼저 보여 줘요.</p>}

      {course && <>
        <h3>{course.subject} <span className="record-meta">· 영역 {courseUnits(course).length}개 · 성취기준 {course.standards.length}개</span></h3>
        {units.length === 0 && <p style={styles.text}>‘{query}’와 맞는 성취기준이 없어요.</p>}
        {units.map(unit => (
          <details key={unit.area} className="quiet-details course-group" open={unit.number === 1 || !!query.trim()}>
            <summary><h4>({unit.number}) {unit.area} <span className="record-meta">· {unit.standards.length}개</span></h4></summary>
            <ul className="curriculum-goal-list">
              {unit.standards.map(standard => (
                <li key={standard.code}><code>[{standard.code}]</code> {standard.objective}</li>
              ))}
            </ul>
          </details>
        ))}
        <p className="record-meta">출처: <a href={course.source} target="_blank" rel="noreferrer">교육부 고시 원문</a>{course.sourceFile ? ` · ${course.sourceFile}` : ""}</p>
      </>}

      {book && (
        <details className="quiet-details course-group">
          <summary><h4>참고 교과서 단원 · {book.textbook}</h4></summary>
          <p className="record-meta">학교에서 이 교과서를 쓰는지는 확인되지 않았어요. 단원별 학습목표는 원본 자료에 없어서 ‘미확보’로 표시해요.</p>
          {textbookChapters(book).map(chapter => (
            <div key={chapter.title}>
              <h4>{chapter.title}</h4>
              <ul className="curriculum-goal-list">
                {chapter.units.map(unit => (
                  <li key={`${unit.middle}-${unit.small}`}>{unit.middle} › {unit.small} <span className="record-meta">· 학습목표 {unit.lessonObjective || "미확보"}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

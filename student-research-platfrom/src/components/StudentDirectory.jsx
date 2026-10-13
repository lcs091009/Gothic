import { useEffect, useRef, useState } from "react";
import { directoryError, fetchStudents, fetchStudentDetails, STUDENT_PAGE_SIZE } from "../services/studentDirectory";
import "./StudentDirectory.css";
const initialFilters = { grade: "", classNumber: "", number: "" };
function placement(student) {
  return student.directory_grade ? `${student.directory_grade}학년 ${student.directory_class}반 ${student.directory_number}번` : "학년·반·번호 확인 필요";
}
function StudentDetails({ student, onClose }) {
  const dialog = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current.showModal();
    let active = true;
    fetchStudentDetails(student.id).then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(directoryError(err)); });
    return () => { active = false; };
  }, [student.id]);
  const subjects = Object.values(data?.academic?.selected_choices || {}).flat();
  return <dialog ref={dialog} className="student-detail-dialog" aria-labelledby="student-detail-title" onCancel={onClose}
    onClick={event => { if (event.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <header className="directory-heading"><div><h3 id="student-detail-title">{student.name || "이름 미등록"}</h3><p>{placement(student)}</p></div>
      <button type="button" autoFocus onClick={onClose}>닫기</button></header>
    <dl className="student-info"><div><dt>학번</dt><dd>{student.student_number || "미등록"}</dd></div><div><dt>이메일</dt><dd>{student.email || "미등록"}</dd></div></dl>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">학생 상세 정보를 불러오는 중입니다.</p> : <>
      <section><h4>선택과목 정보</h4><p>현재 설정 학년: {data.academic?.current_grade || data.academic?.grade || "미설정"}</p>
        <p>교육과정: {data.academic?.curriculum_label || "미설정"}</p><p>{subjects.length ? subjects.join(" · ") : "저장된 선택과목이 없습니다."}</p></section>
      <section><h4>활동 기록 · {data.recordCount}개</h4>{data.recordCount > 20 && <p>최근 20개의 기록을 표시합니다.</p>}
        {!data.records.length && <p>등록한 활동 기록이 없습니다.</p>}
        {data.records.map(record => <article className="student-record" key={record.id}><small>{record.grade} · {record.semester} · {record.subject}</small>
          <h5>{record.title}</h5><p className="student-record-content">{record.content}</p>
          {record.drive_file_name && <p>첨부: {record.drive_file_name}</p>}
          {/^https?:\/\//i.test(record.drive_file_url || "") && <a href={record.drive_file_url} target="_blank" rel="noreferrer">첨부파일 열기</a>}
          <small>{new Date(record.created_at).toLocaleDateString("ko-KR")}</small></article>)}
      </section></>}
  </dialog>;
}
export default function StudentDirectory({ teacherId, selectionMode = false, selectedStudents = [], onSelectionChange, disabled = false, selectionLimit = 100 }) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState({ students: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setResult({ students: [], count: 0 });
    const timer = setTimeout(() => {
      fetchStudents(filters, page).then(data => { if (active) setResult(data); })
        .catch(err => { if (active) setError(directoryError(err)); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, page, refresh, teacherId]);
  function update(key, value) { setFilters(previous => ({ ...previous, [key]: value })); setPage(0); setSelected(null); }
  const selectedIds = new Set(selectedStudents.map(student => student.id));
  const [selectionMessage, setSelectionMessage] = useState("");
  function choose(student) {
    if (disabled) return;
    if (selectedIds.has(student.id)) { onSelectionChange(selectedStudents.filter(item => item.id !== student.id)); setSelectionMessage(""); }
    else if (selectedStudents.length >= selectionLimit) setSelectionMessage(`한 번에 최대 ${selectionLimit}명까지 선택할 수 있습니다.`);
    else { onSelectionChange([...selectedStudents, student]); setSelectionMessage(""); }
  }
  function choosePage() {
    const fresh = result.students.filter(student => student.email && !selectedIds.has(student.id));
    const available = selectionLimit - selectedStudents.length;
    onSelectionChange([...selectedStudents, ...fresh.slice(0, available)]);
    setSelectionMessage(fresh.length > available ? `최대 ${selectionLimit}명까지만 선택했습니다.` : "");
  }
  const pages = Math.max(1, Math.ceil(result.count / STUDENT_PAGE_SIZE));
  return <section className={`student-directory ${selectionMode ? "assignment-directory" : ""}`} aria-labelledby="student-directory-title">
    {!selectionMode && <header className="directory-heading"><div><h3 id="student-directory-title">학생 찾기</h3><p>원하는 학년·반·번호만 선택하세요.</p></div>
      <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading || disabled}>새로고침</button></header>}
    {selectionMode && <h4 id="student-directory-title" className="sr-only">과제를 받을 학생 선택</h4>}
    <div className="student-filters">
      <label>학년<select value={filters.grade} onChange={event => update("grade", event.target.value)}><option value="">전체 학년</option>{[1,2,3].map(grade => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
      <label>반<input type="number" min="1" max="99" placeholder="전체 반" value={filters.classNumber} onChange={event => update("classNumber", event.target.value)} /></label>
      <label>번호<input type="number" min="1" max="99" placeholder="전체 번호" value={filters.number} onChange={event => update("number", event.target.value)} /></label>
      {!selectionMode && <button type="button" disabled={disabled} onClick={() => { setFilters(initialFilters); setPage(0); setSelected(null); }}>전체 보기</button>}
    </div>
    <p role="status" aria-live="polite">{loading ? "학생을 찾는 중입니다." : `검색된 학생 ${result.count}명`}</p>
    {error && <p role="alert">{error}</p>}
    {selectionMode && <button type="button" disabled={loading || disabled || !result.students.length} onClick={choosePage}>현재 목록 모두 선택 · {result.students.length}명</button>}
    {selectionMessage && <p role="status">{selectionMessage}</p>}
    {!loading && !error && !result.students.length && <p>해당 조건에 맞는 등록 학생이 없습니다.</p>}
    {selectionMode ? <div className="recipient-list" aria-busy={loading}>{result.students.map(student => <label key={student.id} className={`recipient-row ${selectedIds.has(student.id) ? "is-selected" : ""}`}>
      <input type="checkbox" checked={selectedIds.has(student.id)} disabled={disabled || !student.email} onChange={() => choose(student)} />
      <strong>{student.name || "이름 미등록"}</strong><span>{placement(student)}</span>
    </label>)}</div> : <div className="student-card-grid" aria-busy={loading}>{result.students.map(student => <button type="button" className="student-summary-card" key={student.id}
      aria-haspopup="dialog" disabled={disabled} onClick={() => setSelected(student)}><strong>{student.name || "이름 미등록"}</strong><span>{placement(student)}</span><small>학번 {student.student_number || "미등록"}</small><span className="student-card-action">상세 정보 보기 →</span></button>)}</div>}
    {!loading && !error && result.count > STUDENT_PAGE_SIZE && <nav className="student-pagination" aria-label="학생 목록 페이지">
      <button type="button" disabled={page === 0 || disabled} onClick={() => setPage(value => value - 1)}>이전</button><span>{page + 1} / {pages}</span>
      <button type="button" disabled={page + 1 >= pages || disabled} onClick={() => setPage(value => value + 1)}>다음</button></nav>}
    {!selectionMode && selected && <StudentDetails key={selected.id} student={selected} onClose={() => setSelected(null)} />}
  </section>;
}

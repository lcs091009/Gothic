import { useRef, useState } from "react";
import StudentDirectory from "./StudentDirectory";
import { buildAssignmentRows, deliverAssignmentRows, MAX_ASSIGNMENT_RECIPIENTS } from "../services/teacherAssignments";
import { getFriendlySupabaseError } from "../lib/supabaseClient";

export default function AssignmentComposer({ session, isSubmitting, onBusyChange, onSent }) {
  const [students, setStudents] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("탐구");
  const [fileUrl, setFileUrl] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(null);
  const busy = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    setMessage("");
    const draft = { teacher: session?.user ? { id: session.user.id, email: session.user.email } : null, students, title, description, category, fileUrl, dueDate };
    const key = JSON.stringify(draft);
    busy.current = true;
    onBusyChange(true);
    try {
      if (pending.current?.key !== key) pending.current = { key, rows: buildAssignmentRows(draft) };
      await deliverAssignmentRows(pending.current.rows);
      pending.current = null;
      await onSent(students.length);
    } catch (error) {
      setMessage(`${getFriendlySupabaseError(error)} 입력을 유지했으니 확인 후 다시 전달해 주세요.`);
    } finally { busy.current = false; onBusyChange(false); }
  }
  return <form className="assignment-composer" onSubmit={submit}>
    <fieldset disabled={isSubmitting} className="assignment-fields">
      <section className="assignment-step">
        <header><span className="assignment-step-number">1</span><h3>받을 학생</h3><span className="assignment-count" role="status">{students.length}명 선택</span></header>
        <StudentDirectory teacherId={session?.user?.id} selectionMode selectedStudents={students} onSelectionChange={setStudents} disabled={isSubmitting} selectionLimit={MAX_ASSIGNMENT_RECIPIENTS} />
        {!!students.length && <div className="assignment-recipients" aria-label="선택한 학생">
          {students.map(student => <button key={student.id} type="button" onClick={() => setStudents(previous => previous.filter(item => item.id !== student.id))}
            aria-label={`${student.name || student.student_number} 선택 해제`}>{student.name || "학생"} {student.student_number || student.email}<span aria-hidden="true">×</span></button>)}
          <button type="button" onClick={() => setStudents([])}>전체 해제</button>
        </div>}
      </section>
      <section className="assignment-step">
        <header><span className="assignment-step-number">2</span><h3>과제 내용</h3></header>
        <label htmlFor="assignment-title">제목</label>
        <input id="assignment-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} placeholder="예: 실험 결과를 비교하고 한계 정리하기" />
        <label htmlFor="assignment-description">안내</label>
        <textarea id="assignment-description" value={description} onChange={event => setDescription(event.target.value)} required maxLength={4000} rows={4} placeholder="무엇을 하고, 어떤 결과물을 제출할지 적어 주세요." />
        <details className="quiet-details assignment-options"><summary>기한·자료 링크·종류 <span className="field-optional">선택</span></summary>
          <div className="assignment-option-row"><label>제출 기한<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
            <label>종류<select value={category} onChange={event => setCategory(event.target.value)}>{["탐구", "수행평가", "독서", "동아리", "수업 중 발표", "기타"].map(item => <option key={item}>{item}</option>)}</select></label></div>
          <label>자료 링크<input type="url" value={fileUrl} maxLength={2048} onChange={event => setFileUrl(event.target.value)} placeholder="https://…" /></label>
        </details>
      </section>
      <div className="assignment-send-bar">
        <span>{students.length ? `${students.length}명에게 같은 과제를 전달합니다.` : "학생을 선택해 주세요."}</span>
        <button type="submit" className="animated-button" disabled={!students.length || !title.trim() || !description.trim() || isSubmitting}>
          {isSubmitting ? "전달 중…" : `${students.length || "선택한"}명에게 전달`}<span aria-hidden="true">↗</span>
        </button>
      </div>
    </fieldset>
    {message && <p role="alert" className="assignment-error">{message}</p>}
  </form>;
}

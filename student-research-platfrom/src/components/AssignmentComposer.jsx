import { useRef, useState } from "react";
import { useGoogleDrive } from "../hooks/useGoogleDrive";
import StudentDirectory from "./StudentDirectory";
import { buildAssignmentRows, deliverAssignmentRows, MAX_ASSIGNMENT_RECIPIENTS } from "../services/teacherAssignments";
import { getFriendlySupabaseError } from "../lib/supabaseClient";

export default function AssignmentComposer({ session, isSubmitting, onBusyChange, onSent }) {
  const [students, setStudents] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("탐구");
  const [message, setMessage] = useState("");
  const fileInput = useRef(null);
  const drive = useGoogleDrive({ setMessage, userId: session?.user?.id });
  const [shareProgress, setShareProgress] = useState("");
  const fileBusy = drive.isUploadingFile || drive.isGoogleAuthLoading || drive.isPickerLoading;
  const [fileUrl, setFileUrl] = useState("");
  const [dueDate, setDueDate] = useState("");
  const pending = useRef(null);
  const busy = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (busy.current || fileBusy) return;
    setMessage("");
    const draft = { teacher: session?.user ? { id: session.user.id, email: session.user.email } : null, students, title, description, category, fileUrl: drive.driveFileUrl || fileUrl, fileId: drive.driveFileId, dueDate };
    const key = JSON.stringify(draft);
    busy.current = true;
    onBusyChange(true);
    try {
      if (pending.current?.key !== key) pending.current = { key, rows: buildAssignmentRows(draft) };
      if (drive.driveFileId) await drive.shareSelectedFile(students.map(student => student.email), (done, total) => setShareProgress(`파일 공유 ${done}/${total}`));
      await deliverAssignmentRows(pending.current.rows);
      pending.current = null;
      await onSent(students.length);
    } catch (error) {
      setMessage(`${getFriendlySupabaseError(error)} 입력을 유지했으니 확인 후 다시 전달해 주세요.`);
    } finally { busy.current = false; onBusyChange(false); setShareProgress(""); }
  }
  return <form className="assignment-composer" onSubmit={submit}>
    <fieldset disabled={isSubmitting} className="assignment-fields">
      <section className="assignment-step">
        <header><span className="assignment-step-number">1</span><h3>받을 학생</h3><span className="assignment-count" role="status">{students.length}명 선택</span></header>
        <details className="recipient-picker quiet-details" open>
          <summary>{students.length ? `${students.length}명 선택 · 학생 변경` : "학생 선택"}</summary>
          <StudentDirectory teacherId={session?.user?.id} selectionMode selectedStudents={students} onSelectionChange={setStudents} disabled={isSubmitting} selectionLimit={MAX_ASSIGNMENT_RECIPIENTS} />
          {!!students.length && <div className="recipient-selection-footer"><span>{students.length}명 선택됨</span><button type="button" onClick={() => setStudents([])}>선택 해제</button></div>}
        </details>
      </section>
      <section className="assignment-step">
        <header><span className="assignment-step-number">2</span><h3>과제 내용</h3></header>
        <label htmlFor="assignment-title">제목</label>
        <input id="assignment-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} placeholder="예: 실험 결과를 비교하고 한계 정리하기" />
        <label htmlFor="assignment-description">안내</label>
        <textarea id="assignment-description" value={description} onChange={event => setDescription(event.target.value)} required maxLength={4000} rows={4} placeholder="무엇을 하고, 어떤 결과물을 제출할지 적어 주세요." />
        <div className={`assignment-attachment ${drive.isUploadDragging ? "is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); if (!isSubmitting && !fileBusy) drive.handleUploadDragOver(event); }} onDragLeave={drive.handleUploadDragLeave} onDrop={event => { event.preventDefault(); if (!isSubmitting && !fileBusy) drive.handleUploadDrop(event); }}>
          <input ref={fileInput} type="file" hidden aria-label="컴퓨터에서 첨부파일 선택" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) drive.uploadLocalFile(file); }} />
          <div className="attachment-actions">
            <button type="button" disabled={fileBusy} onClick={() => fileInput.current?.click()}>컴퓨터 파일 첨부 <span aria-hidden="true">↑</span></button>
            <button type="button" disabled={fileBusy} onClick={drive.openGooglePicker}>Google Drive</button>
          </div>
          <p>{fileBusy ? "Google 파일 연결 중…" : "파일을 끌어 놓아도 됩니다. 최대 50MB."}</p>
          {drive.driveFileId && <div className="attachment-selected"><span>{drive.driveFileName}</span><button type="button" disabled={fileBusy} onClick={() => { drive.setDriveFileId(""); drive.setDriveFileName(""); drive.setDriveFileUrl(""); }}>선택 해제</button></div>}
          {drive.driveFileId && <p>전달할 때 선택한 학생에게 열람 권한을 부여합니다.</p>}
        </div>
        <details className="quiet-details assignment-options"><summary>기한·종류·직접 입력한 링크 <span className="field-optional">선택</span></summary>
          <div className="assignment-option-row"><label>제출 기한<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
            <label>종류<select value={category} onChange={event => setCategory(event.target.value)}>{["탐구", "수행평가", "독서", "동아리", "수업 중 발표", "기타"].map(item => <option key={item}>{item}</option>)}</select></label></div>
          <label>자료 링크<input type="url" value={fileUrl} maxLength={2048} onChange={event => setFileUrl(event.target.value)} placeholder="https://…" /></label>
        </details>
      </section>
      <div className="assignment-send-bar">
        <span>{students.length ? `${students.length}명에게 같은 과제를 전달합니다.` : "학생을 선택해 주세요."}</span>
        <button type="submit" className="animated-button" disabled={!students.length || !title.trim() || !description.trim() || isSubmitting || fileBusy}>
          {isSubmitting ? shareProgress || "전달 중…" : `${students.length || "선택한"}명에게 전달`}<span aria-hidden="true">↗</span>
        </button>
      </div>
    </fieldset>
    {message && <p role="status" className="assignment-error">{message}</p>}
  </form>;
}

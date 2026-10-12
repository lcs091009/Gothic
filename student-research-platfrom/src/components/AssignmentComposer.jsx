import { readAssignmentDraft, writeAssignmentDraft, clearAssignmentDraft, assignmentDeliveryKey } from "../lib/assignmentDraft";
import { useEffect, useRef, useState } from "react";
import { useGoogleDrive } from "../hooks/useGoogleDrive";
import StudentDirectory from "./StudentDirectory";
import { buildAssignmentRows, deliverAssignmentRows, MAX_ASSIGNMENT_RECIPIENTS } from "../services/teacherAssignments";
import { getFriendlySupabaseError } from "../lib/supabaseClient";

export default function AssignmentComposer({ session, isSubmitting, onBusyChange, onSent }) {
  const userId = session?.user?.id;
  const restored = useRef(null);
  if (!restored.current) restored.current = readAssignmentDraft(userId);
  const [students, setStudents] = useState(restored.current.students);
  const [title, setTitle] = useState(restored.current.title);
  const [description, setDescription] = useState(restored.current.description);
  const [category, setCategory] = useState(restored.current.category);
  const [message, setMessage] = useState("");
  const fileInput = useRef(null);
  const drive = useGoogleDrive({ setMessage, userId: session?.user?.id, multiple: true, initialAttachments: restored.current.attachments });
  const [shareProgress, setShareProgress] = useState("");
  const fileBusy = drive.isUploadingFile || drive.isGoogleAuthLoading || drive.isPickerLoading;
  const [fileUrl, setFileUrl] = useState(restored.current.fileUrl);
  const [dueDate, setDueDate] = useState(restored.current.dueDate);
  const pending = useRef(null);
  const busy = useRef(false);
  const delivered = useRef(false);
  const delivery = useRef(restored.current.delivery);
  const [saved, setSaved] = useState(null);
  const snapshot = useRef(null);
  snapshot.current = {students, title, description, category, fileUrl, dueDate, attachments: drive.attachments, delivery: delivery.current};
  useEffect(() => {
    const timer = setTimeout(() => { if (!delivered.current) setSaved(writeAssignmentDraft(userId, snapshot.current)); }, 300);
    return () => clearTimeout(timer);
  }, [userId, students, title, description, category, fileUrl, dueDate, drive.attachments]);
  useEffect(() => {
    const flush = () => { if (!delivered.current) writeAssignmentDraft(userId, snapshot.current); };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [userId]);
  async function submit(event) {
    event.preventDefault();
    if (busy.current || fileBusy) return;
    setMessage("");
    const draft = { teacher: session?.user ? { id: session.user.id, email: session.user.email } : null, students, title, description, category, fileUrl: drive.driveFileUrl || fileUrl, fileId: drive.driveFileId, attachments: drive.attachments, dueDate };
    const key = assignmentDeliveryKey(draft);
    busy.current = true;
    onBusyChange(true);
    try {
      if (pending.current?.key !== key) {
        let index = 0;
        const savedIds = delivery.current?.key === key && delivery.current.ids.length === students.length ? delivery.current.ids : null;
        const rows = buildAssignmentRows(draft, () => savedIds?.[index++] || crypto.randomUUID());
        pending.current = { key, rows };
        delivery.current = { key, ids: rows.map(row => row.id) };
        snapshot.current = { ...snapshot.current, delivery: delivery.current };
        setSaved(writeAssignmentDraft(userId, snapshot.current));
      }
      if (drive.driveFileId) await drive.shareSelectedFile(students.map(student => student.email), (done, total) => setShareProgress(`파일 공유 ${done}/${total}`));
      await deliverAssignmentRows(pending.current.rows);
      pending.current = null;
      delivered.current = true;
      clearAssignmentDraft(userId);
      await onSent(students.length);
    } catch (error) {
      setMessage(`${getFriendlySupabaseError(error)} 입력을 유지했으니 확인 후 다시 전달해 주세요.`);
    } finally { busy.current = false; onBusyChange(false); setShareProgress(""); }
  }
  return <form className="assignment-composer" onSubmit={submit}>
    <p className="assignment-draft-status" role="status" style={{color: saved === false ? "#a35454" : "#7b847d", fontSize: "12px", margin: 0}}>
      {saved === false ? "임시 저장을 사용할 수 없습니다. 현재 화면에서 작성을 마쳐 주세요." : "이 기기에 자동 저장 · 같은 계정으로 30일 동안 이어서 작성할 수 있습니다."}
    </p>
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
          <input ref={fileInput} type="file" multiple hidden aria-label="컴퓨터에서 첨부파일 선택" onChange={event => { const file = Array.from(event.target.files || []); event.target.value = ""; if (file.length) drive.uploadLocalFile(file); }} />
          <div className="attachment-actions">
            <button type="button" disabled={fileBusy} onClick={() => fileInput.current?.click()}>컴퓨터 파일 첨부 <span aria-hidden="true">↑</span></button>
            <button type="button" disabled={fileBusy} onClick={drive.openGooglePicker}>Google Drive</button>
          </div>
          <p>{fileBusy ? drive.fileProgress || "Google 파일 연결 중…" : "여러 파일을 끌어 놓을 수 있습니다. 파일당 500MB · 최대 20개."}</p>
          {drive.isUploadingFile && <button type="button" onClick={drive.cancelUpload}>업로드 중단</button>}
          {drive.attachments.map(file => <div key={file.id} className="attachment-selected"><span>{file.name}</span><button type="button" disabled={fileBusy} onClick={() => drive.removeAttachment(file.id)} aria-label={`${file.name} 첨부 해제`}>×</button></div>)}
          {drive.driveFileId && <p>전달할 때 선택한 학생에게 모든 첨부파일의 열람 권한을 부여합니다.</p>}
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

import PickerAccountBar from "./PickerAccountBar";
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
  const [sharingError, setSharingError] = useState(false);
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
    setMessage(""); setSharingError(false);
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
      let rowIndex=0;
      pending.current.rows=buildAssignmentRows(draft,()=>delivery.current.ids[rowIndex++]);
      await deliverAssignmentRows(pending.current.rows);
      pending.current = null;
      delivered.current = true;
      clearAssignmentDraft(userId);
      await onSent(students.length);
    } catch (error) {
      setSharingError(error.scope === "driveSharing");
      setMessage(getFriendlySupabaseError(error));
    } finally { busy.current = false; onBusyChange(false); setShareProgress(""); }
  }
  return <form className="assignment-composer" onSubmit={submit}>
    <PickerAccountBar open={drive.isPickerOpen} email={drive.driveAccountEmail} onSwitch={drive.switchPickerAccount} onClose={drive.closeGooglePicker} />
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
        <aside className="file-ownership-notice" aria-labelledby="file-ownership-title">
          <div className="file-ownership-heading">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M8 12l3 3 5-6" /></svg>
            <h4 id="file-ownership-title">파일 소유 계정으로 첨부하세요</h4>
          </div>
          <p>파일을 볼 수 있어도 학생에게 공유할 권한은 없을 수 있습니다.</p>
          <details>
            <summary>내 파일인지 확인하는 방법 <span aria-hidden="true">↗</span></summary>
            <p>Drive에서 파일의 ‘공유’를 열고 본인 이메일 옆 ‘소유자’를 확인하세요. 편집자는 다른 사람에게 공유하도록 허용된 파일만 사용할 수 있습니다.</p>
            <p>PDF·Docs·Sheets 모두 같은 기준입니다. 전달 시 선택한 학생에게 보기 권한을 부여하며, 학교 공유 제한이 있으면 관리자 확인이 필요합니다.</p>
          </details>
        </aside>
        <div className={`assignment-attachment ${drive.isUploadDragging ? "is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); if (!isSubmitting && !fileBusy) drive.handleUploadDragOver(event); }} onDragLeave={drive.handleUploadDragLeave} onDrop={event => { event.preventDefault(); if (!isSubmitting && !fileBusy) drive.handleUploadDrop(event); }}>
          <div className="attachment-actions">
            <button type="button" disabled={fileBusy} onClick={() => drive.openGooglePicker({ uploadFirst: true })}>컴퓨터 파일 첨부 <span aria-hidden="true">↑</span></button>
            <button type="button" disabled={fileBusy} onClick={drive.openGooglePicker}>Google Drive</button>
          </div>
          <p>{fileBusy ? drive.fileProgress || "Google 파일 연결 중…" : "여러 파일을 끌어 놓을 수 있습니다. 첨부 총용량 500MB · 파일 개수 제한 없음. Google 문서는 크기가 없으면 합산하지 않습니다."}</p>
          {drive.isUploadingFile && <button type="button" onClick={drive.cancelUpload}>업로드 중단</button>}
          {drive.attachments.map(file => <div key={file.id} className="attachment-selected"><span>{file.name}</span><button type="button" disabled={fileBusy} onClick={() => drive.removeAttachment(file.id)} aria-label={`${file.name} 첨부 해제`}>×</button></div>)}
        </div>
        <details className="quiet-details assignment-options"><summary>기한·종류·직접 입력한 링크 <span className="field-optional">선택</span></summary>
          <div className="assignment-option-row"><label>제출 기한<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
            <label>종류<select value={category} onChange={event => setCategory(event.target.value)}>{["탐구", "수행평가", "독서", "동아리", "수업 중 발표", "기타"].map(item => <option key={item}>{item}</option>)}</select></label></div>
          <p className="field-optional">직접 입력한 링크는 자동으로 공유되지 않습니다. Drive의 ‘공유’에서 받을 학생에게 ‘뷰어’ 권한을 먼저 주세요.</p>
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
    {sharingError && <div className="attachment-links"><button type="button" disabled={fileBusy || isSubmitting} onClick={drive.reconnectGoogleDrive}>Google 계정 다시 연결</button>{drive.attachments.map(file =>
      <a key={file.id} href={file.url} target="_blank" rel="noreferrer">{file.name} · Drive에서 공유 설정 확인 ↗</a>
    )}</div>}
  </form>;
}

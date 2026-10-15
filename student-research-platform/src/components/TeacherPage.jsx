import AssignmentRecallDialog from "./AssignmentRecallDialog";
import AttachmentLinks from "./AttachmentLinks";
import StudentDirectory from "./StudentDirectory";
import AssignmentComposer from "./AssignmentComposer";
import { useScopedMessage } from "../hooks/useScopedMessage";
import { fetchTeacherAssignments, groupAssignmentDeliveries, recallAssignmentRows } from "../services/teacherAssignments";
import "../pages/StudentHome.css";
import "./TeacherPage.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getFriendlySupabaseError,
  isSupabaseConfigured,
  supabaseConfigError,
  withRetry,
} from "../lib/supabaseClient";



function getMatchLabel(matchStatus) {
  if (matchStatus === "matched") {
    return "전달 완료";
  }

  if (matchStatus === "needs_review") {
    return "확인 필요";
  }

  return "미배정";
}

function TeacherPage({ session }) {
  const teacherId=session?.user?.id;
  const [currentSection, setCurrentSection] = useState("menu");
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, [currentSection]);
  const [sharedFiles, setSharedFiles] = useState([]);

  const assignmentGroups = useMemo(() => groupAssignmentDeliveries(sharedFiles), [sharedFiles]);
  const messageScope = section => `${session?.user?.id || "guest"}:${section}`;
  const { message, setMessage, transitionMessage } = useScopedMessage(messageScope(currentSection));
  const messageRef = useRef(setMessage);
  messageRef.current = setMessage;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [recallingId, setRecallingId] = useState(null);
  const [recallGroup,setRecallGroup]=useState(null);
  const [recallError,setRecallError]=useState("");
  const recallLock=useRef(false);
  const loadVersion=useRef(0);

  const loadSharedFiles = useCallback(async (reportOverride) => {
    const reportMessage = typeof reportOverride === "function" ? reportOverride : messageRef.current;
    if (!isSupabaseConfigured()) {
      reportMessage(supabaseConfigError || "Supabase 설정이 필요합니다.");
      return;
    }

    if (!teacherId) {
      return;
    }

    const version=++loadVersion.current;
    setIsLoadingFiles(true);

    try {
      const data=await withRetry(()=>fetchTeacherAssignments(teacherId));

      if(version===loadVersion.current) setSharedFiles(data || []);
    } catch (error) {
      reportMessage(getFriendlySupabaseError(error));
    } finally {
      if(version===loadVersion.current) setIsLoadingFiles(false);
    }
  }, [teacherId]);

  useEffect(() => {
    if (teacherId) {
      loadSharedFiles();
    }
  }, [teacherId, loadSharedFiles]);

  async function handleRecall(ids) {
    if(recallLock.current || !ids.length) return;
    recallLock.current=true;setRecallingId(recallGroup.id);setRecallError("");
    const report=setMessage;
    try {
      const removed=await recallAssignmentRows(ids,session.user.id);
      // Invalidate old reads so they cannot restore recalled rows.
      ++loadVersion.current;
      const deleted=new Set(ids);
      setSharedFiles(previous=>previous.filter(file=>!deleted.has(file.id)));
      setRecallGroup(null);
      report(`${removed}명에게서 회수했습니다. 받는 학생이 모두 회수된 과제는 전달 내역에서도 삭제됩니다.`);
    }catch(error){setRecallError(getFriendlySupabaseError(error));}
    finally{recallLock.current=false;setRecallingId(null);}
  }

  async function handleAssignmentSent(count) {
    const report = transitionMessage(messageScope("files"), `${count}명에게 과제를 전달했습니다.`);
    setCurrentSection("files");
    await loadSharedFiles(report);
  }

  return (
    <section className="soft-panel teacher-page-panel" style={styles.page}>
      {currentSection === "menu" ? (
        <div className="teacher-menu student-home">
          <p className="student-eyebrow">교사 활동 공간</p>
          <h2 ref={headingRef} tabIndex={-1}>무엇을 도와드릴까요?</h2>
          <p className="student-intro">학생을 살펴보고, 필요한 자료를 연결해 주세요.</p>
          <nav className="student-category-grid teacher-category-grid" aria-label="교사 메뉴">
            {[
              { id: "students", title: "학생 조회", description: "학년·반·번호로 찾고 상세 정보를 확인해요", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" },
              { id: "register", title: "과제 전달", description: "학생을 고르고 과제나 자료를 한 번에 보내요", icon: "M12 5v14M5 12h14" },
              { id: "files", title: "전달한 과제·자료", description: "학생에게 보낸 과제와 자료를 확인해요", icon: "M3 7V4h6l2 3h10v13H3V7Z" },
            ].map(item => (
              <button key={item.id} type="button" className="student-category" onClick={() => setCurrentSection(item.id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
                <span className="student-category-copy"><strong>{item.title}</strong><span>{item.description}</span></span>
                {item.id === "files" && !isLoadingFiles && <span className="student-category-count" aria-label={`전달한 과제·자료 ${assignmentGroups.length}건`}>{assignmentGroups.length}</span>}
                <span className="student-category-arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </nav>
        </div>
      ) : (
        <header className="student-section-header teacher-section-header">
          <button type="button" className="student-back" disabled={isSubmitting} onClick={() => setCurrentSection("menu")}>← 메뉴</button>
          <h2 ref={headingRef} tabIndex={-1}>{currentSection === "students" ? "학생 조회" : currentSection === "register" ? "과제 전달" : "전달한 과제·자료"}</h2>
          {currentSection === "files" && <button type="button" className="student-back teacher-refresh" onClick={loadSharedFiles} disabled={isLoadingFiles}>{isLoadingFiles ? "새로고침 중" : "새로고침"}</button>}
        </header>
      )}

      <div key={currentSection} className={`student-view ${currentSection !== "menu" ? "inner-page teacher-inner-page" : ""}`}>
      {currentSection === "students" && <StudentDirectory teacherId={session?.user?.id} />}
      {currentSection === "register" && <AssignmentComposer key={session?.user?.id} session={session} isSubmitting={isSubmitting} onBusyChange={setIsSubmitting} onSent={handleAssignmentSent} />}

      {currentSection === "files" && <section style={styles.listBox}>
        <div style={styles.listTitleRow}>
          <p style={styles.smallText}>전달 내역</p>
          <span style={styles.countBadge}>{assignmentGroups.length}건</span>
        </div>

        {isLoadingFiles ? (
          <div className="skeleton-panel" style={styles.loadingBox}>
            <div className="mini-spinner" aria-hidden="true" />
            <p style={styles.text}>자료를 불러오는 중입니다.</p>
          </div>
        ) : sharedFiles.length === 0 ? (
          <div style={styles.emptyBox}>
            <p style={styles.text}>아직 전달한 과제나 자료가 없습니다.</p>
            <p style={styles.smallText}>
              과제를 전달하면 받는 학생과 내용을 여기서 확인할 수 있습니다.
            </p>
            <button type="button" className="student-back" onClick={() => setCurrentSection("register")}>첫 과제 전달하기 →</button>
          </div>
        ) : (
          <div style={styles.list}>
            {assignmentGroups.map((file) => (
              <article className="compact-record" key={file.id} style={styles.card}>
                <div style={styles.badgeRow}>
                  <span style={styles.badge}>{file.category}</span>
                  <span
                    style={{
                      ...styles.badge,
                      ...(file.match_status === "matched"
                        ? styles.matchedBadge
                        : styles.reviewBadge),
                    }}
                  >
                    {getMatchLabel(file.match_status)}
                  </span>
                </div>

                <h4 style={styles.cardTitle}>{file.file_name}</h4>

                <details className="quiet-details">
                  <summary>받는 학생 · {file.recipients.length}명</summary>
                  <p style={styles.text}>{file.recipients.map(student => student.number ? `${student.number} (${student.email})` : student.email || "미배정").join(" · ")}</p>
                </details>

                <details className="quiet-details"><summary>자료 설명</summary><p style={styles.cardDescription}>{file.description}</p></details>

                <AttachmentLinks file={file} />

                <p style={styles.dateText}>
                  등록 시간: {new Date(file.created_at).toLocaleString("ko-KR")}
                </p>

                <button
                  type="button"
                  className="student-back"
                  style={styles.recallButton}
                  disabled={recallingId !== null || isLoadingFiles}
                  onClick={() => {setRecallError("");setRecallGroup(file);}}
                >
                  {recallingId === file.id ? "회수 중…" : "과제 회수"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>}
      </div>
      {message && <p style={styles.message} role="status">{message}</p>}
      {recallGroup && <AssignmentRecallDialog key={recallGroup.id} group={recallGroup} busy={recallingId !== null} error={recallError} onClose={()=>setRecallGroup(null)} onRecall={handleRecall} />}
    </section>
  );
}

const styles = {
  page: {
    marginTop: "28px",
    border: "1px solid #dde1e6",
    borderRadius: "22px",
    padding: "26px",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    boxShadow: "none",
  },
  text: {
    margin: "8px 0 0",
    color: "#59616b",
    lineHeight: 1.7,
    fontWeight: 400,
  },
  smallText: {
    margin: "8px 0 0",
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.6,
    fontWeight: 400,
  },
  message: {
    marginTop: "4px",
    color: "#355c50",
    fontWeight: 650,
    whiteSpace: "pre-wrap",
  },
  listBox: {
    marginTop: "28px",
  },
  listTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },
  countBadge: {
    borderRadius: "999px",
    padding: "5px 10px",
    backgroundColor: "#e8f0e7",
    color: "#59616b",
    fontSize: "13px",
    fontWeight: 650,
  },
  loadingBox: {
    border: "1px solid #dde1e6",
    borderRadius: "16px",
    padding: "18px",
    backgroundColor: "rgba(255, 255, 255, 0.75)",
  },
  emptyBox: {
    border: "1px dashed #d3d8de",
    borderRadius: "16px",
    padding: "18px",
    backgroundColor: "#f3f6f1",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  card: {
    marginTop: "14px",
    border: "none",
    borderBottom: "1px solid #e3e5e8",
    padding: "14px 0",
    backgroundColor: "transparent",
  },
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  badge: {
    borderRadius: "999px",
    backgroundColor: "#e2e8f0",
    padding: "6px 10px",
    fontSize: "13px",
    color: "#334155",
    fontWeight: 600,
  },
  matchedBadge: {
    backgroundColor: "#e1ebdf",
    color: "#454d57",
  },
  reviewBadge: {
    backgroundColor: "#f0f1f3",
    color: "#59616b",
  },
  cardTitle: {
    marginBottom: 0,
    fontSize: "17px",
    color: "#355c50",
    fontWeight: 650,
  },
  cardDescription: {
    margin: "10px 0 0",
    color: "#334155",
    lineHeight: 1.7,
    fontWeight: 400,
    whiteSpace: "pre-wrap",
  },
  recallButton: {
    marginTop: "10px",
    color: "#a35454",
  },
  dateText: {
    marginTop: "12px",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 400,
  },
};

export default TeacherPage;

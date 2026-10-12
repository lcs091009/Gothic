import AttachmentLinks from "./AttachmentLinks";
import StudentDirectory from "./StudentDirectory";
import AssignmentComposer from "./AssignmentComposer";
import { groupAssignmentDeliveries } from "../services/teacherAssignments";
import "../pages/StudentHome.css";
import "./TeacherPage.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getFriendlySupabaseError,
  isSupabaseConfigured,
  supabase,
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
  const [currentSection, setCurrentSection] = useState("menu");
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, [currentSection]);
  const [sharedFiles, setSharedFiles] = useState([]);

  const assignmentGroups = useMemo(() => groupAssignmentDeliveries(sharedFiles), [sharedFiles]);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const loadSharedFiles = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setMessage(supabaseConfigError || "Supabase 설정이 필요합니다.");
      return;
    }

    if (!session?.user) {
      return;
    }

    setIsLoadingFiles(true);

    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from("teacher_shared_files")
          .select("*")
          .eq("teacher_id", session.user.id)
          .order("created_at", { ascending: false })
      );

      if (error) {
        setMessage(getFriendlySupabaseError(error));
        return;
      }

      setSharedFiles(data || []);
    } catch (error) {
      setMessage(getFriendlySupabaseError(error));
    } finally {
      setIsLoadingFiles(false);
    }
  }, [session]);

  useEffect(() => {
    if (session?.user?.id) {
      loadSharedFiles();
    }
  }, [session?.user?.id, loadSharedFiles]);

  async function handleAssignmentSent(count) {
    setMessage(`${count}명에게 과제를 전달했습니다.`);
    setCurrentSection("files");
    await loadSharedFiles();
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
              </article>
            ))}
          </div>
        )}
      </section>}
      </div>
      {message && <p style={styles.message} role="status">{message}</p>}
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
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  kicker: {
    margin: "0 0 6px",
    color: "#648675",
    fontSize: "13px",
    fontWeight: 650,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 0,
    marginBottom: 0,
    fontSize: "24px",
    color: "#355c50",
    fontWeight: 650,
  },
  subTitle: {
    marginTop: 0,
    marginBottom: 0,
    color: "#355c50",
    fontSize: "20px",
    fontWeight: 650,
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
  warningText: {
    margin: "10px 0 0",
    color: "#59616b",
    lineHeight: 1.7,
    fontWeight: 600,
  },
  noticeBox: {
    marginTop: "14px",
    border: "none",
    borderBottom: "1px solid #e3e5e8",
    padding: "14px 0",
    backgroundColor: "transparent",
  },
  noticeTitle: {
    marginTop: 0,
    marginBottom: "8px",
    color: "#454d57",
  },
  form: {
    marginTop: "22px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: 600,
    color: "#1e293b",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "12px",
    fontSize: "15px",
    backgroundColor: "white",
    transition: "0.18s ease",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "12px",
    fontSize: "15px",
    lineHeight: 1.6,
    resize: "vertical",
    backgroundColor: "white",
    transition: "0.18s ease",
  },
  matchBox: {
    border: "1px solid #d8e3d8",
    borderRadius: "16px",
    padding: "16px",
    backgroundColor: "white",
    transition: "0.22s ease",
  },
  matchBoxOk: {
    borderColor: "#c8ced5",
    backgroundColor: "#f2f4f6",
  },
  matchBoxReview: {
    borderColor: "#d3d8de",
    backgroundColor: "#f3f6f1",
  },
  matchHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  matchTitle: {
    marginTop: 0,
    marginBottom: 0,
    color: "#355c50",
  },
  statusPill: {
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 650,
  },
  statusPillOk: {
    backgroundColor: "#e1ebdf",
    color: "#454d57",
  },
  statusPillReview: {
    backgroundColor: "#f0f1f3",
    color: "#59616b",
  },
  button: {
    border: "none",
    borderRadius: "14px",
    padding: "16px 20px",
    backgroundColor: "#355c50",
    color: "white",
    fontWeight: 650,
    fontSize: "15px",
    boxShadow: "none",
  },
  refreshButton: {
    border: "1px solid #dde1e6",
    borderRadius: "999px",
    padding: "11px 14px",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    color: "#355c50",
    fontWeight: 650,
    cursor: "pointer",
    fontSize: "13px",
    boxShadow: "none",
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
  link: {
    display: "inline-block",
    marginTop: "10px",
    color: "#355c50",
    fontWeight: 650,
    textDecoration: "none",
  },
  dateText: {
    marginTop: "12px",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 400,
  },
};

export default TeacherPage;
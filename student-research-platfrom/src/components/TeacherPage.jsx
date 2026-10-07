import StudentDirectory from "./StudentDirectory";
import "../pages/StudentHome.css";
import "./TeacherPage.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getFriendlySupabaseError,
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  withRetry,
} from "../lib/supabaseClient";

import { extractStudentNumber, getStudentEmail, studentAdmissionYear } from "../config/school";

function getMatchLabel(matchStatus) {
  if (matchStatus === "matched") {
    return "자동 매칭";
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
  const [admissionYear, setAdmissionYear] = useState(studentAdmissionYear);
  const [grade, setGrade] = useState("1학년");
  const [semester, setSemester] = useState("1학기");
  const [category, setCategory] = useState("수행평가");
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [sharedFiles, setSharedFiles] = useState([]);

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const extractedStudentNumber = extractStudentNumber(fileName, admissionYear);
  const matchedStudentEmail = getStudentEmail(extractedStudentNumber, admissionYear);
  const matchStatus = extractedStudentNumber ? "matched" : "needs_review";

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

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!isSupabaseConfigured()) {
      setMessage(supabaseConfigError || "Supabase 설정이 필요합니다.");
      return;
    }

    if (!session?.user) {
      setMessage("먼저 로그인해야 합니다.");
      return;
    }

    if (!/^\d{2}$/.test(admissionYear)) {
      setMessage("입학 연도 앞자리를 두 자리 숫자로 입력해 주세요.");
      return;
    }

    if (!fileName.trim()) {
      setMessage("파일명은 반드시 입력해야 합니다.");
      return;
    }

    if (!description.trim()) {
      setMessage("자료 설명을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await withRetry(() =>
        supabase.from("teacher_shared_files").insert({
          teacher_id: session.user.id,
          teacher_email: session.user.email,
          student_number: extractedStudentNumber || null,
          student_email: matchedStudentEmail || null,
          file_name: fileName.trim(),
          file_url: fileUrl.trim() || null,
          file_id: null,
          match_status: matchStatus,
          category,
          description: description.trim(),
        })
      );

      if (error) {
        setMessage(getFriendlySupabaseError(error));
        return;
      }

      setMessage(
        extractedStudentNumber
          ? "학생에게 자료가 자동 배정되었습니다."
          : "학번을 찾지 못했습니다. 확인 필요 상태로 저장되었습니다."
      );

      setFileName("");
      setFileUrl("");
      setDescription("");

      setCurrentSection("files");
      await loadSharedFiles();
    } catch (error) {
      setMessage(getFriendlySupabaseError(error));
    } finally {
      setIsSubmitting(false);
    }
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
              { id: "register", title: "자료 등록", description: "파일을 학생에게 연결하고 안내를 남겨요", icon: "M12 5v14M5 12h14" },
              { id: "files", title: "제공한 자료", description: "등록한 자료와 배정 상태를 살펴봐요", icon: "M3 7V4h6l2 3h10v13H3V7Z" },
            ].map(item => (
              <button key={item.id} type="button" className="student-category" onClick={() => setCurrentSection(item.id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
                <span className="student-category-copy"><strong>{item.title}</strong><span>{item.description}</span></span>
                {item.id === "files" && !isLoadingFiles && <span className="student-category-count" aria-label={`제공한 자료 ${sharedFiles.length}개`}>{sharedFiles.length}</span>}
                <span className="student-category-arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </nav>
        </div>
      ) : (
        <header className="student-section-header teacher-section-header">
          <button type="button" className="student-back" onClick={() => setCurrentSection("menu")}>← 메뉴</button>
          <h2 ref={headingRef} tabIndex={-1}>{currentSection === "students" ? "학생 조회" : currentSection === "register" ? "자료 등록" : "제공한 자료"}</h2>
          {currentSection === "files" && <button type="button" className="student-back teacher-refresh" onClick={loadSharedFiles} disabled={isLoadingFiles}>{isLoadingFiles ? "새로고침 중" : "새로고침"}</button>}
        </header>
      )}

      <div key={currentSection} className="student-view">
      {currentSection === "students" && <StudentDirectory teacherId={session?.user?.id} />}
      {currentSection === "register" && <>
      <div className="soft-panel" style={styles.noticeBox}>
        <h3 style={styles.noticeTitle}>파일명 자동 인식 예시</h3>
        <p style={styles.text}>10315_김철수_통합사회.pdf → {getStudentEmail("10315", admissionYear)}</p>
        <p style={styles.text}>{admissionYear}-10315_김철수.hwp → {getStudentEmail("10315", admissionYear)}</p>
        <p style={styles.text}>김철수_10315_수행평가.pdf → {getStudentEmail("10315", admissionYear)}</p>
        <p style={styles.warningText}>
          이름만 있는 파일은 동명이인 문제가 있을 수 있으므로 자동 배정하지 않습니다.
        </p>
      </div>

      <form className="soft-panel" onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.row}>
          <div>
            <label style={styles.label}>학생 이메일의 입학 연도 앞자리</label>
              <input value={admissionYear} onChange={(event) => setAdmissionYear(event.target.value)}
                inputMode="numeric" pattern="[0-9]{2}" maxLength={2} required placeholder="예: 26, 27" style={styles.input} />
              <label style={styles.label}>학년</label>
            <select
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              style={styles.input}
            >
              <option>1학년</option>
              <option>2학년</option>
              <option>3학년</option>
            </select>
          </div>

          <div>
            <label style={styles.label}>학기</label>
            <select
              value={semester}
              onChange={(event) => setSemester(event.target.value)}
              style={styles.input}
            >
              <option>1학기</option>
              <option>2학기</option>
              <option>지난 학기</option>
            </select>
          </div>
        </div>

        <div>
          <label style={styles.label}>자료 종류</label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            style={styles.input}
          >
            <option>수행평가</option>
            <option>창체</option>
            <option>동아리</option>
            <option>독서</option>
            <option>수업 중 발표</option>
            <option>기타</option>
          </select>
        </div>

        <div>
          <label style={styles.label}>파일명</label>
          <input
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="예: 10315_김철수_통합사회_수행평가.pdf"
            style={styles.input}
          />
        </div>

        <div
          className={
            matchStatus === "matched"
              ? "teacher-match-box teacher-match-box-ok"
              : "teacher-match-box teacher-match-box-review"
          }
          style={{
            ...styles.matchBox,
            ...(matchStatus === "matched"
              ? styles.matchBoxOk
              : styles.matchBoxReview),
          }}
        >
          <div style={styles.matchHeader}>
            <h3 style={styles.matchTitle}>자동 매칭 결과</h3>
            <span
              style={{
                ...styles.statusPill,
                ...(matchStatus === "matched"
                  ? styles.statusPillOk
                  : styles.statusPillReview),
              }}
            >
              {getMatchLabel(matchStatus)}
            </span>
          </div>

          {fileName.trim() ? (
            <>
              <p style={styles.text}>
                추출된 학번:{" "}
                <strong>{extractedStudentNumber || "학번을 찾지 못함"}</strong>
              </p>
              <p style={styles.text}>
                배정될 학생 이메일:{" "}
                <strong>{matchedStudentEmail || "자동 배정 불가"}</strong>
              </p>
              <p style={styles.smallText}>
                저장 후 학생은 본인 계정으로 로그인했을 때 이 자료를 볼 수 있게 됩니다.
              </p>
            </>
          ) : (
            <p style={styles.text}>파일명을 입력하면 자동 매칭 결과가 표시됩니다.</p>
          )}
        </div>

        <div>
          <label style={styles.label}>파일 링크</label>
          <input
            value={fileUrl}
            onChange={(event) => setFileUrl(event.target.value)}
            placeholder="예: Google Drive 공유 링크"
            style={styles.input}
          />
        </div>

        <div>
          <label style={styles.label}>자료 설명</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={6}
            placeholder="이 자료가 어떤 활동과 관련되어 있는지, 학생이 어떤 과목이나 활동과 연결해 볼 수 있는지 적어 주세요."
            style={styles.textarea}
          />
        </div>


        <button
          className="animated-button"
          type="submit"
          disabled={isSubmitting}
          style={{
            ...styles.button,
            opacity: isSubmitting ? 0.72 : 1,
            cursor: isSubmitting ? "wait" : "pointer",
          }}
        >
          {isSubmitting ? (
            <>
              저장 중
              <span className="button-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </>
          ) : (
            "학생 자료 저장"
          )}
        </button>
      </form>
      </>}

      {currentSection === "files" && <section className="soft-panel" style={styles.listBox}>
        <div style={styles.listTitleRow}>
          <h3 style={styles.subTitle}>내가 제공한 자료</h3>
          <span style={styles.countBadge}>{sharedFiles.length}개</span>
        </div>

        {isLoadingFiles ? (
          <div className="skeleton-panel" style={styles.loadingBox}>
            <div className="mini-spinner" aria-hidden="true" />
            <p style={styles.text}>자료를 불러오는 중입니다.</p>
          </div>
        ) : sharedFiles.length === 0 ? (
          <div style={styles.emptyBox}>
            <p style={styles.text}>아직 등록한 자료가 없습니다.</p>
            <p style={styles.smallText}>
              자료를 등록하면 배정 상태와 파일을 여기서 확인할 수 있습니다.
            </p>
            <button type="button" className="student-back" onClick={() => setCurrentSection("register")}>첫 자료 등록하기 →</button>
          </div>
        ) : (
          <div style={styles.list}>
            {sharedFiles.map((file) => (
              <article className="teacher-card" key={file.id} style={styles.card}>
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

                <p style={styles.text}>
                  배정 학생: {file.student_email || "자동 배정 안 됨"}
                </p>

                <p style={styles.cardDescription}>{file.description}</p>

                {file.file_url && (
                  <a
                    className="teacher-link"
                    href={file.file_url}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.link}
                  >
                    파일 열기
                  </a>
                )}

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
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 0,
    marginBottom: 0,
    fontSize: "24px",
    color: "#355c50",
    fontWeight: 900,
  },
  subTitle: {
    marginTop: 0,
    marginBottom: 0,
    color: "#355c50",
    fontSize: "20px",
    fontWeight: 900,
  },
  text: {
    margin: "8px 0 0",
    color: "#59616b",
    lineHeight: 1.7,
    fontWeight: 700,
  },
  smallText: {
    margin: "8px 0 0",
    color: "#64748b",
    fontSize: "13px",
    lineHeight: 1.6,
    fontWeight: 700,
  },
  warningText: {
    margin: "10px 0 0",
    color: "#59616b",
    lineHeight: 1.7,
    fontWeight: 800,
  },
  noticeBox: {
    marginTop: "18px",
    border: "1px solid #dde1e6",
    borderRadius: "16px",
    padding: "18px",
    backgroundColor: "#f3f6f1",
    boxShadow: "none",
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
    fontWeight: 800,
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
    fontWeight: 900,
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
    fontWeight: 900,
    fontSize: "15px",
    boxShadow: "none",
  },
  refreshButton: {
    border: "1px solid #dde1e6",
    borderRadius: "999px",
    padding: "11px 14px",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    color: "#355c50",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: "13px",
    boxShadow: "none",
  },
  message: {
    marginTop: "4px",
    color: "#355c50",
    fontWeight: 900,
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
    fontWeight: 900,
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
    border: "1px solid #dde1e6",
    borderRadius: "18px",
    padding: "18px",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    boxShadow: "none",
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
    fontWeight: 800,
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
    fontWeight: 900,
  },
  cardDescription: {
    margin: "10px 0 0",
    color: "#334155",
    lineHeight: 1.7,
    fontWeight: 700,
    whiteSpace: "pre-wrap",
  },
  link: {
    display: "inline-block",
    marginTop: "10px",
    color: "#355c50",
    fontWeight: 900,
    textDecoration: "none",
  },
  dateText: {
    marginTop: "12px",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 700,
  },
};

export default TeacherPage;
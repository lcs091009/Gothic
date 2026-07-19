import { useEffect, useState } from "react";
import {
  getFriendlySupabaseError,
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  withRetry,
} from "../lib/supabaseClient";

function extractStudentNumber(fileName) {
  const patterns = [
    /26[-_]?(\d{3,5})/,
    /(?:^|[^0-9])(\d{4,5})(?:[^0-9]|$)/,
  ];

  for (const pattern of patterns) {
    const match = fileName.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return "";
}

function getStudentEmail(studentNumber) {
  if (!studentNumber) {
    return "";
  }

  return `26-${studentNumber}@gochon.hs.kr`;
}

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

  const extractedStudentNumber = extractStudentNumber(fileName);
  const matchedStudentEmail = getStudentEmail(extractedStudentNumber);
  const matchStatus = extractedStudentNumber ? "matched" : "needs_review";

  useEffect(() => {
    if (session?.user?.id) {
      loadSharedFiles();
    }
  }, [session?.user?.id]);

  async function loadSharedFiles() {
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
  }

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

      await loadSharedFiles();
    } catch (error) {
      setMessage(getFriendlySupabaseError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="soft-panel teacher-page-panel" style={styles.page}>
      <div style={styles.titleRow}>
        <div>
          <p style={styles.kicker}>Teacher Workspace</p>
          <h2 style={styles.title}>선생님 자료 제공 페이지</h2>
        </div>

        <button
          className="animated-button"
          type="button"
          onClick={loadSharedFiles}
          disabled={isLoadingFiles}
          style={styles.refreshButton}
        >
          {isLoadingFiles ? (
            <>
              새로고침 중
              <span className="button-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </>
          ) : (
            "자료 새로고침"
          )}
        </button>
      </div>

      <p style={styles.text}>
        선생님이 수행평가, 창체, 동아리, 독서, 발표 자료 등을 학생별로
        제공할 수 있는 공간입니다. 파일명에 학번이 포함되어 있으면 학생
        계정과 자동으로 연결됩니다.
      </p>

      <div className="soft-panel" style={styles.noticeBox}>
        <h3 style={styles.noticeTitle}>파일명 자동 인식 예시</h3>
        <p style={styles.text}>10315_김철수_통합사회.pdf → 26-10315@gochon.hs.kr</p>
        <p style={styles.text}>26-10315_김철수.hwp → 26-10315@gochon.hs.kr</p>
        <p style={styles.text}>김철수_10315_수행평가.pdf → 26-10315@gochon.hs.kr</p>
        <p style={styles.warningText}>
          이름만 있는 파일은 동명이인 문제가 있을 수 있으므로 자동 배정하지 않습니다.
        </p>
      </div>

      <form className="soft-panel" onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.row}>
          <div>
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

        {message && <p style={styles.message}>{message}</p>}

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

      <section className="soft-panel" style={styles.listBox}>
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
              위 입력창에서 파일명과 설명을 저장하면 여기에 카드로 표시됩니다.
            </p>
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
      </section>
    </section>
  );
}

const styles = {
  page: {
    marginTop: "28px",
    border: "1px solid rgba(154, 223, 226, 0.72)",
    borderRadius: "22px",
    padding: "26px",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    boxShadow:
      "0 14px 36px rgba(20, 91, 169, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.74)",
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
    color: "#13B9AE",
    fontSize: "13px",
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 0,
    marginBottom: 0,
    fontSize: "24px",
    color: "#145BA9",
    fontWeight: 900,
  },
  subTitle: {
    marginTop: 0,
    marginBottom: 0,
    color: "#145BA9",
    fontSize: "20px",
    fontWeight: 900,
  },
  text: {
    margin: "8px 0 0",
    color: "#24435f",
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
    color: "#b45309",
    lineHeight: 1.7,
    fontWeight: 800,
  },
  noticeBox: {
    marginTop: "18px",
    border: "1px solid #fde68a",
    borderRadius: "16px",
    padding: "18px",
    backgroundColor: "#fffbeb",
    boxShadow: "0 12px 28px rgba(180, 83, 9, 0.08)",
  },
  noticeTitle: {
    marginTop: 0,
    marginBottom: "8px",
    color: "#92400e",
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
    border: "1px solid #dbeafe",
    borderRadius: "16px",
    padding: "16px",
    backgroundColor: "white",
    transition: "0.22s ease",
  },
  matchBoxOk: {
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
  },
  matchBoxReview: {
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
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
    color: "#1e3a8a",
  },
  statusPill: {
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 900,
  },
  statusPillOk: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  statusPillReview: {
    backgroundColor: "#ffedd5",
    color: "#9a3412",
  },
  button: {
    border: "none",
    borderRadius: "14px",
    padding: "16px 20px",
    backgroundColor: "#145BA9",
    color: "white",
    fontWeight: 900,
    fontSize: "15px",
    boxShadow: "0 14px 26px rgba(20, 91, 169, 0.18)",
  },
  refreshButton: {
    border: "1px solid rgba(154, 223, 226, 0.88)",
    borderRadius: "999px",
    padding: "11px 14px",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    color: "#145BA9",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: "13px",
    boxShadow: "0 12px 26px rgba(20, 91, 169, 0.12)",
  },
  message: {
    marginTop: "4px",
    color: "#145BA9",
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
    backgroundColor: "#e0f2fe",
    color: "#0369a1",
    fontSize: "13px",
    fontWeight: 900,
  },
  loadingBox: {
    border: "1px solid rgba(154, 223, 226, 0.72)",
    borderRadius: "16px",
    padding: "18px",
    backgroundColor: "rgba(255, 255, 255, 0.75)",
  },
  emptyBox: {
    border: "1px dashed rgba(20, 91, 169, 0.24)",
    borderRadius: "16px",
    padding: "18px",
    backgroundColor: "rgba(238, 248, 251, 0.74)",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  card: {
    border: "1px solid rgba(154, 223, 226, 0.72)",
    borderRadius: "18px",
    padding: "18px",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    boxShadow: "0 12px 30px rgba(20, 91, 169, 0.08)",
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
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  reviewBadge: {
    backgroundColor: "#ffedd5",
    color: "#9a3412",
  },
  cardTitle: {
    marginBottom: 0,
    fontSize: "17px",
    color: "#145BA9",
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
    color: "#145BA9",
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
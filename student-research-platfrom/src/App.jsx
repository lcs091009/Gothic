import GradeSetup from "./components/GradeSetup";
import TeacherPage from "./components/TeacherPage";
import AiAnalysisPage from "./components/AiAnalysisPage";
import { useEffect, useRef, useState } from "react";
import {
  getFriendlySupabaseError,
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  withRetry,
} from "./lib/supabaseClient";

function getStudentNumber(email) {
  const match = email.match(/^26-(\d+)@gochon\.hs\.kr$/);
  return match ? match[1] : null;
}

const studentRecordPreview = [
  "자율활동: 학급 탐구 프로젝트에서 자료 조사와 발표 구성을 맡아 주제의 핵심을 정리하고 친구들의 의견을 종합함.",
  "진로활동: 과학적 탐구 방법과 데이터 분석 과정에 관심을 가지고 관련 도서를 읽으며 자신의 관심 분야를 구체화함.",
  "세부능력 및 특기사항: 수업 중 제시된 현상을 관찰한 뒤 가설을 세우고 근거 자료를 찾아 설명하려는 태도가 돋보임.",
  "동아리활동: 탐구 주제를 선정하고 실험 계획을 작성하는 과정에서 변인 통제와 결과 해석의 중요성을 이해함.",
  "독서활동: 사회 문제와 과학 기술의 관계를 다룬 글을 읽고 토론 과정에서 자신의 의견을 논리적으로 표현함.",
  "종합의견: 꾸준한 기록 습관을 바탕으로 이전 활동과 새 탐구 주제를 연결하려는 성실한 태도를 보임.",
];

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [records, setRecords] = useState([]);
  const [teacherSharedFiles, setTeacherSharedFiles] = useState([]);
  const [isLoadingTeacherSharedFiles, setIsLoadingTeacherSharedFiles] = useState(false);

  const [grade, setGrade] = useState("1학년");
  const [semester, setSemester] = useState("1학기");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [driveFileId, setDriveFileId] = useState("");
  const [driveFileName, setDriveFileName] = useState("");
  const [driveFileUrl, setDriveFileUrl] = useState("");
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState(null);

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pageRef = useRef(null);
  const [currentPage, setCurrentPage] = useState("home");
  const [isLogoutHovered, setIsLogoutHovered] = useState(false);
  const [academicProfile, setAcademicProfile] = useState(null);
  const [isAcademicProfileLoading, setIsAcademicProfileLoading] = useState(false);
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  useEffect(() => {
    async function initAuth() {
      if (!isSupabaseConfigured()) {
        setMessage(supabaseConfigError || "Supabase 설정이 필요합니다.");
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await withRetry(() => supabase.auth.getSession());
        setSession(data.session);

        if (data.session?.user) {
          await ensureProfile(data.session.user);
          await loadAcademicProfile(data.session.user.id);
          await loadResearchRecords(data.session.user.id);
          await loadTeacherSharedFiles(data.session.user.email);
        }
      } catch (error) {
        setMessage(getFriendlySupabaseError(error));
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();

    if (!isSupabaseConfigured()) {
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);

        if (newSession?.user) {
          try {
            await ensureProfile(newSession.user);
            await loadAcademicProfile(newSession.user.id);
            await loadResearchRecords(newSession.user.id);
            await loadTeacherSharedFiles(newSession.user.email);
          } catch (error) {
            setMessage(getFriendlySupabaseError(error));
          }
        } else {
          setProfile(null);
          setRecords([]);
          setTeacherSharedFiles([]);
        }

        setIsLoading(false);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    const pageElement = pageRef.current;

    if (
      !pageElement ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !window.matchMedia("(pointer: fine)").matches
    ) {
      return;
    }

    let animationFrameId = 0;

    function handlePointerMove(event) {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        pageElement.style.setProperty("--pointer-x", `${event.clientX}px`);
        pageElement.style.setProperty("--pointer-y", `${event.clientY}px`);
      });
    }

    window.addEventListener("pointermove", handlePointerMove);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);

      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [session]);

  async function ensureProfile(user) {
    if (!isSupabaseConfigured()) {
      return;
    }

    const email = user.email || "";
    const studentNumber = getStudentNumber(email);

    const { data: existingProfile, error: selectError } = await withRetry(() =>
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle()
    );

    if (selectError) {
      setMessage(getFriendlySupabaseError(selectError));
      return;
    }

    if (existingProfile) {
      setProfile(existingProfile);
      return;
    }

    const newProfile = {
      id: user.id,
      email,
      name: user.user_metadata?.full_name || "",
      role: studentNumber ? "student" : "pending",
      student_number: studentNumber,
    };

    const { data, error } = await withRetry(() =>
      supabase
        .from("profiles")
        .insert(newProfile)
        .select("*")
        .single()
    );

    if (error) {
      setMessage(getFriendlySupabaseError(error));
      return;
    }

    setProfile(data);
  }

  async function loadResearchRecords(userId) {
    if (!isSupabaseConfigured()) {
      return;
    }

    const { data, error } = await withRetry(() =>
      supabase
        .from("research_records")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
    );

    if (error) {
      setMessage(getFriendlySupabaseError(error));
      return;
    }

    setRecords(data || []);
  }

  async function loadTeacherSharedFiles(userEmail) {
    if (!isSupabaseConfigured()) {
      return;
    }

    if (!userEmail) {
      setTeacherSharedFiles([]);
      return;
    }

    setIsLoadingTeacherSharedFiles(true);

    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from("teacher_shared_files")
          .select("*")
          .eq("student_email", userEmail)
          .order("created_at", { ascending: false })
      );

      if (error) {
        setMessage(getFriendlySupabaseError(error));
        return;
      }

      setTeacherSharedFiles(data || []);
    } catch (error) {
      setMessage(getFriendlySupabaseError(error));
    } finally {
      setIsLoadingTeacherSharedFiles(false);
    }
  }

  async function loadAcademicProfile(userId) {
    if (!isSupabaseConfigured()) {
      return;
    }

    setIsAcademicProfileLoading(true);

    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from("student_academic_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle()
      );

      if (error) {
        setMessage(getFriendlySupabaseError(error));
        return;
      }

      setAcademicProfile(data);
    } catch (error) {
      setMessage(getFriendlySupabaseError(error));
    } finally {
      setIsAcademicProfileLoading(false);
    }
  }

  async function signInWithGoogle() {
    setMessage("");

    if (!isSupabaseConfigured()) {
      setMessage(supabaseConfigError || "Supabase 설정이 필요합니다.");
      return;
    }

    try {
      const { error } = await withRetry(() =>
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
          },
        })
      );

      if (error) {
        setMessage(getFriendlySupabaseError(error));
      }
    } catch (error) {
      setMessage(getFriendlySupabaseError(error));
    }
  }

  async function signOut() {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
      
    setSession(null);
    setProfile(null);
    setRecords([]);
    setTeacherSharedFiles([]);
    setAcademicProfile(null);
    setCurrentPage("home");
    setMessage("");
  }
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);

    if (existingScript) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function loadGooglePickerLibraries() {
  await Promise.all([
    loadScript("https://apis.google.com/js/api.js"),
    loadScript("https://accounts.google.com/gsi/client"),
  ]);

  await new Promise((resolve) => {
    window.gapi.load("picker", resolve);
  });
}

async function openGooglePicker() {
  setMessage("");

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!googleClientId) {
  setMessage(
    "Google Picker 설정이 필요합니다. .env의 VITE_GOOGLE_CLIENT_ID를 확인하세요."
  );
  return;
}

  setIsPickerLoading(true);

  try {
    await loadGooglePickerLibraries();

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          setMessage("Google Drive 권한 요청에 실패했습니다.");
          setIsPickerLoading(false);
          return;
        }

        const uploadView = new window.google.picker.DocsUploadView();

        const docsView = new window.google.picker.DocsView()
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false);

        const picker = new window.google.picker.PickerBuilder()
          .setOAuthToken(tokenResponse.access_token)
          .addView(docsView)
          .addView(uploadView)
          .setCallback((data) => {
            if (data.action === window.google.picker.Action.PICKED) {
              const file = data.docs[0];

              setDriveFileId(file.id || "");
              setDriveFileName(file.name || file.title || "");
              setDriveFileUrl(file.url || "");

              setMessage(
                `Google Drive 파일이 선택되었습니다: ${
                  file.name || file.title || "파일명 없음"
                }`
              );
            }

            setIsPickerLoading(false);
          })
          .build();

        picker.setVisible(true);
      },
    });

    tokenClient.requestAccessToken({ prompt: "consent" });
  } catch (error) {
    setMessage("Google Picker를 여는 중 오류가 발생했습니다.");
    setIsPickerLoading(false);
  }
}

function handleUploadDragOver(event) {
  event.preventDefault();
  setIsUploadDragging(true);
}

function handleUploadDragLeave(event) {
  event.preventDefault();

  if (!event.currentTarget.contains(event.relatedTarget)) {
    setIsUploadDragging(false);
  }
}

function handleUploadDrop(event) {
  event.preventDefault();
  setIsUploadDragging(false);

  setMessage(
    "파일을 이 영역에 놓았습니다. 보안을 위해 Google Drive Picker에서 파일을 선택하거나 업로드해 주세요."
  );

  openGooglePicker();
}

  async function handleSubmitResearchRecord(event) {
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

    if (!subject.trim() || !title.trim() || !content.trim()) {
      setMessage("과목, 활동 제목, 탐구 내용은 반드시 입력해야 합니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await withRetry(() =>
        supabase.from("research_records").insert({
          user_id: session.user.id,
          student_email: session.user.email,
          grade,
          semester,
          subject: subject.trim(),
          title: title.trim(),
          content: content.trim(),
          drive_file_id: driveFileId || null,
          drive_file_name: driveFileName || null,
          drive_file_url: driveFileUrl || null,
        })
      );

      if (error) {
        setMessage(getFriendlySupabaseError(error));
        return;
      }

      setMessage("활동 기록이 저장되었습니다.");
      setSubject("");
      setTitle("");
      setContent("");
      setDriveFileId("");
      setDriveFileName("");
      setDriveFileUrl("");

      await loadResearchRecords(session.user.id);
    } catch (error) {
      setMessage(getFriendlySupabaseError(error));
    } finally {
      setIsSubmitting(false);
    }
  }
async function handleDeleteResearchRecord(recordId) {
  setMessage("");

  if (!isSupabaseConfigured()) {
    setMessage(supabaseConfigError || "Supabase 설정이 필요합니다.");
    return;
  }

  if (!session?.user) {
    setMessage("먼저 로그인해야 합니다.");
    return;
  }

  const shouldDelete = window.confirm(
    "이 활동 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다."
  );

  if (!shouldDelete) {
    return;
  }

  setDeletingRecordId(recordId);

  try {
    const { error } = await withRetry(() =>
      supabase
        .from("research_records")
        .delete()
        .eq("id", recordId)
        .eq("user_id", session.user.id)
    );

    if (error) {
      setMessage(getFriendlySupabaseError(error));
      return;
    }

    setMessage("활동 기록이 삭제되었습니다.");
    await loadResearchRecords(session.user.id);
  } catch (error) {
    setMessage(getFriendlySupabaseError(error));
  } finally {
    setDeletingRecordId(null);
  }
}

  if (isLoading) {
    return (
      <main style={styles.page}>
        <section className="dashboard-card loading-card" style={styles.card}>
          <div className="loading-orb" aria-hidden="true" />
          <h1 style={styles.title}>활동 연결 노트</h1>
          <p style={styles.text}>로그인 상태와 활동 기록을 불러오는 중입니다.</p>
          <div className="loading-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.title}>활동 연결 노트</h1>

          <p style={styles.message}>{supabaseConfigError}</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={styles.landingPage}>
        <div
          className="floating-record floating-record-left"
          style={styles.floatingRecord}
          aria-hidden="true"
        >
          <h2 style={styles.recordSheetTitle}>학교생활기록부</h2>
          {studentRecordPreview.concat(studentRecordPreview).map((text, index) => (
            <p key={`left-${index}`} style={styles.recordSheetLine}>
              {text}
            </p>
          ))}
        </div>

        <div
          className="floating-record floating-record-right"
          style={styles.floatingRecord}
          aria-hidden="true"
        >
          <h2 style={styles.recordSheetTitle}>창의적 체험활동 상황</h2>
          {studentRecordPreview.concat(studentRecordPreview).map((text, index) => (
            <p key={`right-${index}`} style={styles.recordSheetLine}>
              {text}
            </p>
          ))}
        </div>

        <div
          className="floating-record floating-record-center"
          style={styles.floatingRecordCenter}
          aria-hidden="true"
        >
          <h2 style={styles.recordSheetTitle}>탐구 활동 종합 기록</h2>
          {studentRecordPreview.concat(studentRecordPreview).map((text, index) => (
            <p key={`center-${index}`} style={styles.recordSheetLine}>
              {text}
            </p>
          ))}
        </div>

        <header style={styles.landingHeader}>
          <p style={styles.brand}>활동 연결 노트</p>
          <button
            className="animated-button"
            onClick={signInWithGoogle}
            style={styles.loginButton}
          >
            로그인
          </button>
        </header>

        <section style={styles.centerStage}>
          <img
            src="/research-logo.svg"
            alt="활동 연결 노트 로고"
            style={styles.heroLogo}
          />

          <div style={styles.introBox}>
            <p style={styles.kicker}>작년 활동 기반 과목 연결</p>
            <h1 style={styles.heroTitle}>활동 연결 노트</h1>

            <p style={styles.heroText}>
              작년 활동과 현재 선택과목을 연결해 다음 활동 방향을 정리합니다.
              생기부나 보고서를 대신 작성하지 않고, 학생이 스스로 과목 안에서
              이어갈 활동을 설계하도록 돕습니다.
            </p>

            {message && <p style={styles.message}>{message}</p>}
          </div>

          <div className="landing-feature-row" style={styles.landingFeatureRow}>
            <article style={styles.landingFeatureCard}>
              <strong style={styles.landingFeatureTitle}>기록 정리</strong>
              <span style={styles.landingFeatureText}>
                흩어진 탐구 활동을 학기별로 모아 봅니다.
              </span>
            </article>

            <article style={styles.landingFeatureCard}>
              <strong style={styles.landingFeatureTitle}>흐름 분석</strong>
              <span style={styles.landingFeatureText}>
                이전 활동에서 관심 분야와 강점을 찾습니다.
              </span>
            </article>

            <article style={styles.landingFeatureCard}>
              <strong style={styles.landingFeatureTitle}>연결 점검</strong>
              <span style={styles.landingFeatureText}>
                현재 과목의 정체성이 드러나는 활동 방향을 점검합니다.
              </span>
            </article>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main ref={pageRef} className="dashboard-page" style={styles.page}>
      <section className="dashboard-card" style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>활동 연결 노트</h1>
            <p style={styles.text}>로그인 계정: {session.user.email}</p>
            <p style={styles.text}>역할: {profile?.role || "확인 중"}</p>
          </div>

          <div style={styles.headerActions}>
            <button
              className="animated-button"
              type="button"
              onClick={() => setCurrentPage("ai")}
              style={styles.headerButton}
            >
              활동 흐름 분석하기
            </button>

            <button
              className="animated-button"
              type="button"
              onClick={signOut}
              onMouseEnter={() => setIsLogoutHovered(true)}
              onMouseLeave={() => setIsLogoutHovered(false)}
              style={{
                ...styles.headerButton,
                ...styles.logoutButton,
                ...(isLogoutHovered ? styles.logoutButtonHover : {}),
              }}
            >
              로그아웃
            </button>
          </div>
        </div>

        {profile?.role === "student" && isAcademicProfileLoading && (
          <section className="soft-panel skeleton-panel" style={styles.box}>
            <div className="mini-spinner" aria-hidden="true" />
            <p style={styles.text}>선택과목 정보를 불러오는 중입니다.</p>
          </section>
        )}

        {profile?.role === "student" &&
          !isAcademicProfileLoading &&
          !academicProfile && (
            <GradeSetup
              session={session}
              existingAcademicProfile={academicProfile}
              onSaved={(savedProfile) => {
                setAcademicProfile(savedProfile);
                setCurrentPage("home");
              }}
            />
          )}

        {currentPage === "ai" && (
          <AiAnalysisPage
            academicProfile={academicProfile}
            records={records}
            teacherSharedFiles={teacherSharedFiles}
            onBack={() => setCurrentPage("home")}
          />
        )}
        {profile?.role === "student" &&
          academicProfile &&
          currentPage === "home" && (
          <>
            <section style={styles.box}>
              <h2 style={styles.subTitle}>활동 기록 등록</h2>

              <p style={styles.text}>
                지난 학기나 작년에 했던 수행평가·발표·탐구·독서·동아리 활동을
                과목별로 등록하세요. 이후 활동 흐름 분석에서 현재 선택과목과
                연결 가능한 다음 활동 방향을 정리할 수 있습니다.
              </p>

              <form onSubmit={handleSubmitResearchRecord} style={styles.form}>
                <div style={styles.row}>
                  <div style={styles.field}>
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

                  <div style={styles.field}>
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
                  <label style={styles.label}>과목</label>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="예: 생명과학, 화학, 영어, 통합사회"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>활동 제목</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="예: 온도에 따른 효소 반응 속도 탐구"
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={styles.label}>활동 내용 요약</label>
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="무엇을 했는지, 어떤 과목 개념과 연결되었는지, 알게 된 점, 아쉬웠던 점, 새로 생긴 궁금증을 함께 적어 주세요."
                    rows={7}
                    style={styles.textarea}
                  />
                </div>

                <div
                  className={`upload-drop-zone ${
                    isUploadDragging ? "upload-drop-zone-active" : ""
                  }`}
                  style={{
                    ...styles.driveUploadBox,
                    ...(isUploadDragging ? styles.driveUploadBoxActive : {}),
                  }}
                  onDragOver={handleUploadDragOver}
                  onDragLeave={handleUploadDragLeave}
                  onDrop={handleUploadDrop}
                >
                  <div className="upload-icon-bubble" aria-hidden="true">
                    ↑
                  </div>

                  <label style={styles.label}>Google Drive 파일 선택/업로드</label>

                  <p style={styles.smallText}>
                    버튼을 누르거나 파일을 이 영역 위에 끌어다 놓으면 Google Picker가 열립니다.
                    기존 Drive 파일을 선택하거나 새 파일을 Drive에 업로드한 뒤 선택할 수 있습니다.
                  </p>

                  <button
                    className="animated-button"
                    type="button"
                    onClick={openGooglePicker}
                    disabled={isPickerLoading}
                    style={styles.driveButton}
                  >
                    {isPickerLoading ? (
                      <>
                        Google Picker 여는 중
                        <span className="button-dots" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </>
                    ) : (
                      "Google Drive에서 파일 선택/업로드"
                    )}
                  </button>

                  {driveFileName && (
                    <div style={styles.selectedFileBox}>
                      <p style={styles.fileNameText}>선택된 파일: {driveFileName}</p>

                      {driveFileUrl && (
                        <a
                          href={driveFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.link}
                        >
                          선택한 파일 열기
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <button
                  className="animated-button"
                  type="submit"
                  disabled={isSubmitting}
                  style={styles.button}
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
                    "활동 기록 저장"
                  )}
                </button>
              </form>
            </section>

            <section style={styles.box}>
              <h2 style={styles.subTitle}>내 활동 기록</h2>

              {records.length === 0 ? (
                <p style={styles.text}>아직 저장된 활동 기록이 없습니다.</p>
              ) : (
                <div style={styles.recordList}>
                  {records.map((record) => (
                    <article key={record.id} style={styles.recordCard}>
                      <div style={styles.badgeRow}>
                        <span style={styles.badge}>{record.grade}</span>
                        <span style={styles.badge}>{record.semester}</span>
                        <span style={styles.badge}>{record.subject}</span>
                      </div>

                      <h3 style={styles.recordTitle}>{record.title}</h3>

                      <p style={styles.recordContent}>{record.content}</p>

                      {record.drive_file_name && (
                        <p style={styles.fileNameText}>
                          업로드한 파일: {record.drive_file_name}
                        </p>
                      )}

                      {record.drive_file_url && (
                        <a
                          href={record.drive_file_url}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.link}
                        >
                          Google Drive 파일 열기
                        </a>
                      )}

                      <p style={styles.dateText}>
                        저장 시간:{" "}
                        {new Date(record.created_at).toLocaleString("ko-KR")}
                      </p>

                      <button
                        className="delete-button"
                        type="button"
                        onClick={() => handleDeleteResearchRecord(record.id)}
                        disabled={deletingRecordId === record.id}
                        style={styles.deleteButton}
                      >
                        {deletingRecordId === record.id ? (
                          <>
                            삭제 중
                            <span className="button-dots" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </span>
                          </>
                        ) : (
                          "활동 기록 삭제"
                        )}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="soft-panel" style={styles.box}>
              <div style={styles.sharedFileTitleRow}>
                <div>
                  <h2 style={styles.subTitle}>선생님이 제공한 내 자료</h2>
                  <p style={styles.text}>
                    선생님이 파일명과 학번을 기준으로 연결한 자료입니다. 내가 직접 등록한
                    활동 기록과는 구분해서 확인하세요.
                  </p>
                </div>

                <button
                  className="animated-button"
                  type="button"
                  onClick={() => loadTeacherSharedFiles(session.user.email)}
                  disabled={isLoadingTeacherSharedFiles}
                  style={styles.headerButton}
                >
                  {isLoadingTeacherSharedFiles ? (
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

              {isLoadingTeacherSharedFiles ? (
                <div className="skeleton-panel" style={styles.teacherSharedLoadingBox}>
                  <div className="mini-spinner" aria-hidden="true" />
                  <p style={styles.text}>선생님 제공 자료를 불러오는 중입니다.</p>
                </div>
              ) : teacherSharedFiles.length === 0 ? (
                <div style={styles.emptySharedFileBox}>
                  <p style={styles.text}>아직 선생님이 제공한 자료가 없습니다.</p>
                  <p style={styles.smallText}>
                    선생님이 학번이 포함된 파일명으로 자료를 등록하면 여기에 표시됩니다.
                  </p>
                </div>
              ) : (
                <div style={styles.recordList}>
                  {teacherSharedFiles.map((file) => (
                    <article className="teacher-card" key={file.id} style={styles.recordCard}>
                      <div style={styles.badgeRow}>
                        <span style={styles.badge}>{file.category || "기타"}</span>
                        <span style={styles.badge}>
                          {file.match_status === "matched" ? "자동 매칭" : "확인 필요"}
                        </span>
                      </div>

                      <h3 style={styles.recordTitle}>{file.file_name}</h3>

                      <p style={styles.recordContent}>{file.description}</p>

                      <p style={styles.fileNameText}>
                        제공한 선생님: {file.teacher_email || "알 수 없음"}
                      </p>

                      {file.file_url && (
                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="teacher-link"
                          style={styles.link}
                        >
                          선생님 제공 파일 열기
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
          </>
        )}

        {profile?.role === "pending" && (
          <section style={styles.box}>
            <h2 style={styles.subTitle}>권한 확인 필요</h2>
            <p style={styles.text}>
              이 계정은 학생 이메일 형식이 아닙니다. 현재 단계에서는 학생
              계정만 탐구 기록을 등록할 수 있습니다.
            </p>
          </section>
        )}

        {profile?.role === "teacher" && (
          <TeacherPage session={session} />
        )}

        {message && <p style={styles.message}>{message}</p>}
      </section>
    </main>
  );
}

const styles = {
  landingPage: {
    minHeight: "100vh",
    backgroundColor: "#eef8fb",
    padding: "28px",
    boxSizing: "border-box",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#111111",
    textAlign: "left",
    position: "relative",
    overflow: "hidden",
  },
  landingHeader: {
    width: "calc(100vw - 40px)",
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    position: "relative",
    zIndex: 3,
  },
  brand: {
    margin: 0,
    fontSize: "15px",
    fontWeight: 800,
    color: "#145BA9",
  },
  loginButton: {
    border: "1px solid rgba(20, 91, 169, 0.18)",
    borderRadius: "999px",
    padding: "8px 14px",
    backgroundColor: "#145BA9",
    color: "white",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(20, 91, 169, 0.18)",
  },
  floatingRecord: {
    position: "absolute",
    width: "560px",
    minHeight: "760px",
    borderRadius: "22px",
    padding: "38px",
    backgroundColor: "rgba(255, 255, 255, 0.76)",
    border: "1px solid rgba(19, 185, 174, 0.18)",
    boxShadow: "0 22px 42px rgba(20, 91, 169, 0.12)",
    filter: "blur(2px)",
    opacity: 0.32,
    color: "#1a1a1a",
    boxSizing: "border-box",
    pointerEvents: "none",
    zIndex: 1,
  },
  floatingRecordCenter: {
    position: "absolute",
    width: "520px",
    minHeight: "700px",
    borderRadius: "22px",
    padding: "34px",
    backgroundColor: "rgba(255, 255, 255, 0.54)",
    border: "1px solid rgba(35, 134, 215, 0.12)",
    boxShadow: "0 18px 34px rgba(20, 91, 169, 0.08)",
    filter: "blur(2.5px)",
    opacity: 0.2,
    color: "#1a1a1a",
    boxSizing: "border-box",
    pointerEvents: "none",
    zIndex: 1,
  },
  recordSheetTitle: {
    margin: "0 0 18px",
    fontSize: "30px",
    fontWeight: 900,
    color: "#0a0a0a",
  },
  recordSheetLine: {
    margin: "0 0 13px",
    fontSize: "16px",
    lineHeight: 1.7,
    fontWeight: 700,
    wordBreak: "keep-all",
  },
  centerStage: {
    maxWidth: "740px",
    margin: "34px auto 0",
    position: "relative",
    zIndex: 2,
  },
  introBox: {
    padding: "46px",
    borderRadius: "28px",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    border: "1px solid rgba(154, 223, 226, 0.72)",
    boxShadow: "0 34px 90px rgba(20, 91, 169, 0.18)",
    textAlign: "center",
  },
  heroLogo: {
    display: "block",
    width: "140px",
    height: "140px",
    objectFit: "contain",
    margin: "0 auto 22px",
  },
  landingFeatureRow: {
    marginTop: "18px",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
  },
  landingFeatureCard: {
    minHeight: "118px",
    borderRadius: "18px",
    padding: "20px",
    backgroundColor: "rgba(20, 91, 169, 0.9)",
    border: "1px solid rgba(154, 223, 226, 0.35)",
    boxShadow: "0 18px 42px rgba(20, 91, 169, 0.16)",
    boxSizing: "border-box",
  },
  landingFeatureTitle: {
    display: "block",
    marginBottom: "10px",
    color: "#9ADFE2",
    fontSize: "17px",
    fontWeight: 900,
  },
  landingFeatureText: {
    display: "block",
    color: "#E8FAFB",
    fontSize: "14px",
    lineHeight: 1.6,
    fontWeight: 700,
    wordBreak: "keep-all",
  },
  kicker: {
    margin: "0 0 14px",
    color: "#13B9AE",
    fontSize: "14px",
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  heroTitle: {
    margin: 0,
    color: "#145BA9",
    fontSize: "42px",
    lineHeight: 1.18,
    fontWeight: 900,
  },
  heroText: {
    margin: "24px auto 0",
    color: "#24435f",
    fontSize: "22px",
    lineHeight: 1.75,
    fontWeight: 800,
    wordBreak: "keep-all",
  },
  page: {
    minHeight: "100vh",
    backgroundColor: "#eef8fb",
    backgroundImage:
      "radial-gradient(circle at var(--pointer-x, 50%) var(--pointer-y, 28%), rgba(37, 99, 235, 0.08) 0 110px, transparent 260px), linear-gradient(rgba(0, 90, 160, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 90, 160, 0.055) 1px, transparent 1px), linear-gradient(180deg, #e8f6fc 0%, #f8fcff 100%)",
    backgroundSize: "auto, 36px 36px, 36px 36px, auto",
    backgroundRepeat: "no-repeat, repeat, repeat, no-repeat",
    backgroundPosition: "0 0, 0 0, 0 0, 0 0",
    padding: "48px 24px",
    boxSizing: "border-box",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#18324a",
    overflowX: "hidden",
    position: "relative",
    isolation: "isolate",
  },
  card: {
    maxWidth: "960px",
    margin: "0 auto",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    border: "1px solid rgba(255, 255, 255, 0.86)",
    borderRadius: "28px",
    padding: "36px",
    boxShadow:
      "0 28px 70px rgba(20, 91, 169, 0.14), 0 8px 22px rgba(19, 185, 174, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
    backdropFilter: "blur(10px)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    alignItems: "flex-start",
  },
  headerActions: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  headerButton: {
    border: "1px solid rgba(154, 223, 226, 0.88)",
    borderRadius: "999px",
    padding: "12px 16px",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    color: "#145BA9",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: "14px",
    boxShadow: "0 12px 26px rgba(20, 91, 169, 0.12)",
  },
  logoutButton: {
    transition: "0.15s ease",
  },
  logoutButtonHover: {
    border: "1px solid #dc2626",
    backgroundColor: "#dc2626",
    color: "white",
  },
  title: {
    margin: 0,
    fontSize: "30px",
    color: "#145BA9",
    fontWeight: 900,
  },
  subTitle: {
    marginTop: 0,
    fontSize: "24px",
    color: "#145BA9",
    fontWeight: 900,
  },
  text: {
    margin: "8px 0 0",
    color: "#24435f",
    lineHeight: 1.7,
    fontWeight: 700,
  },
  smallText: {
    marginTop: "8px",
    fontSize: "13px",
    color: "#64748b",
    lineHeight: 1.6,
  },
  button: {
    border: "none",
    borderRadius: "14px",
    padding: "16px 20px",
    backgroundColor: "#145BA9",
    color: "white",
    fontWeight: 900,
    fontSize: "15px",
    cursor: "pointer",
    boxShadow: "0 14px 26px rgba(20, 91, 169, 0.18)",
  },
  secondaryButton: {
    alignSelf: "center",
    border: "1px solid rgba(20, 91, 169, 0.18)",
    borderRadius: "999px",
    padding: "12px 16px",
    backgroundColor: "#145BA9",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(20, 91, 169, 0.18)",
  },
  deleteButton: {
    marginTop: "16px",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    padding: "10px 14px",
    backgroundColor: "#fef2f2",
    color: "#dc2626",
    fontWeight: 700,
    cursor: "pointer",
  },
  driveButton: {
    marginTop: "18px",
    marginBottom: "12px",
    border: "none",
    borderRadius: "14px",
    padding: "15px 20px",
    backgroundColor: "#256fb8",
    color: "white",
    fontWeight: 900,
    fontSize: "15px",
    cursor: "pointer",
    boxShadow: "0 14px 26px rgba(20, 91, 169, 0.18)",
  },
  box: {
    marginTop: "28px",
    border: "1px solid rgba(154, 223, 226, 0.72)",
    borderRadius: "22px",
    padding: "26px",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    boxShadow:
      "0 14px 36px rgba(20, 91, 169, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.74)",
  },
  driveUploadBox: {
    minHeight: "220px",
    border: "2px dashed #9ADFE2",
    borderRadius: "22px",
    padding: "28px",
    backgroundColor: "rgba(238, 248, 251, 0.88)",
    boxShadow:
      "0 18px 40px rgba(20, 91, 169, 0.08), inset 0 1px 18px rgba(255, 255, 255, 0.74)",
    transition: "0.22s ease",
    position: "relative",
    overflow: "hidden",
  },
  driveUploadBoxActive: {
    border: "2px solid #145BA9",
    backgroundColor: "rgba(219, 244, 255, 0.95)",
    transform: "translateY(-2px)",
    boxShadow:
      "0 24px 54px rgba(20, 91, 169, 0.16), inset 0 1px 18px rgba(255, 255, 255, 0.82)",
  },
  selectedFileBox: {
    marginTop: "18px",
    borderRadius: "14px",
    backgroundColor: "white",
    padding: "14px 16px",
    border: "1px solid rgba(154, 223, 226, 0.72)",
    boxShadow: "0 10px 24px rgba(20, 91, 169, 0.08)",
  },
  form: {
    marginTop: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  field: {
    minWidth: 0,
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: 700,
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
  },
  message: {
    marginTop: "16px",
    color: "#145BA9",
    fontWeight: 900,
  },
  recordList: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  recordCard: {
    border: "1px solid rgba(154, 223, 226, 0.72)",
    borderRadius: "18px",
    padding: "20px",
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
    fontWeight: 700,
  },
  recordTitle: {
    marginBottom: 0,
    fontSize: "18px",
    color: "#145BA9",
    fontWeight: 900,
  },
  recordContent: {
    whiteSpace: "pre-wrap",
    color: "#334155",
    lineHeight: 1.7,
  },
  fileNameText: {
    margin: 0,
    color: "#24435f",
    fontSize: "14px",
    fontWeight: 800,
  },
  link: {
    display: "inline-block",
    marginTop: "10px",
    color: "#145BA9",
    fontWeight: 900,
    textDecoration: "none",
  },
  dateText: {
    marginTop: "14px",
    fontSize: "13px",
    color: "#5d7890",
    fontWeight: 700,
  },
};

export default App;
import { useAuth } from "./hooks/useAuth";
import { useStudentData } from "./hooks/useStudentData";
import { saveResearchRecord, deleteResearchRecord } from "./services/dataService";
import { useGoogleDrive } from "./hooks/useGoogleDrive";
import HomePage from "./pages/HomePage";
import StudentPage from "./pages/StudentPage";
import StudentHome from "./pages/StudentHome";
import { studentCategories } from "./config/studentCategories";
import styles from "./styles/appStyles";
import GradeSetup from "./components/GradeSetup";
import TeacherPage from "./components/TeacherPage";
import AiAnalysisPage from "./components/AiAnalysisPage";
import { useEffect, useRef, useState } from "react";
import {
  getFriendlySupabaseError,
  isSupabaseConfigured,
  supabaseConfigError,
} from "./lib/supabaseClient";


function App() {

  const [grade, setGrade] = useState("1학년");
  const [semester, setSemester] = useState("1학기");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState(null);

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pageRef = useRef(null);
  const [currentPage, setCurrentPage] = useState("home");
  const [isLogoutHovered, setIsLogoutHovered] = useState(false);
  const sectionTitleRef = useRef(null);

  const { session, isLoading, signInWithGoogle, signOut: authSignOut } = useAuth(setMessage);
  const { profile, records, teacherSharedFiles, academicProfile, setAcademicProfile,
    isAcademicProfileLoading, isLoadingTeacherSharedFiles, loadResearchRecords, loadTeacherSharedFiles
  } = useStudentData(session, setMessage);
  const { driveFileId, driveFileName, driveFileUrl, isPickerLoading, isGoogleAuthLoading, isUploadDragging, isUploadingFile, setDriveFileId, setDriveFileName, setDriveFileUrl, openGooglePicker, handleUploadDragOver, handleUploadDragLeave, handleUploadDrop, clearDriveSession } = useGoogleDrive({ setMessage, userId: session?.user?.id });

  useEffect(() => {
    if (profile?.role === "student") sectionTitleRef.current?.focus();
  }, [currentPage, profile?.role]);

  useEffect(() => {
    if (profile?.role === "student") return;
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
  }, [session, profile?.role]);

  async function signOut() {
    if (!await authSignOut()) return;
    clearDriveSession();
    setCurrentPage("home");
    setMessage("");
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
      await saveResearchRecord({
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
        });

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
    await deleteResearchRecord(recordId, session.user.id);

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

  if (!session) return <HomePage signInWithGoogle={signInWithGoogle} message={message} />;

  return (
    <main ref={pageRef} className={`dashboard-page ${profile?.role === "student" ? "student-dashboard" : ""}`} style={styles.page}>
      <section className="dashboard-card" style={styles.card}>
        {profile?.role === "student" ? (
          <header className="student-header">
            <h1>활동 연결 노트</h1>
            <details className="student-account">
              <summary>내 계정</summary>
              <div className="student-account-panel">
                <p>{session.user.email}</p>
                <button type="button" onClick={signOut}>로그아웃</button>
              </div>
            </details>
          </header>
        ) : <div style={styles.header}>
          <div>
            <h1 style={styles.title}>활동 연결 노트</h1>
            <p style={styles.text}>로그인 계정: {session.user.email}</p>
            <p style={styles.text}>역할: {profile?.role || "확인 중"}</p>
          </div>

          <div style={styles.headerActions}>
            <button
              className="animated-button"
              type="button"
              disabled={profile?.role !== "student" || isAcademicProfileLoading}
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
        </div>}

        {profile?.role === "student" && <div key={currentPage} className="student-view">
        {profile?.role === "student" && currentPage === "home" && (
          <StudentHome headingRef={sectionTitleRef} name={profile.name} academicProfile={academicProfile}
            isAcademicProfileLoading={isAcademicProfileLoading} recordsCount={records.length}
            materialsCount={teacherSharedFiles.length} onNavigate={setCurrentPage} />
        )}
        {profile?.role === "student" && currentPage !== "home" && (
          <div className="student-section-header">
            <button className="student-back" type="button" onClick={() => setCurrentPage("home")}>← 메뉴</button>
            <h2 ref={sectionTitleRef} tabIndex={-1}>{studentCategories.find(category => category.id === currentPage)?.title}</h2>
          </div>
        )}

        {profile?.role === "student" && currentPage === "academic" && isAcademicProfileLoading && (
          <section className="soft-panel skeleton-panel" style={styles.box}>
            <div className="mini-spinner" aria-hidden="true" />
            <p style={styles.text}>선택과목 정보를 불러오는 중입니다.</p>
          </section>
        )}

        {profile?.role === "student" &&
          !isAcademicProfileLoading &&
          currentPage === "academic" && (
            <GradeSetup
              session={session}
              existingAcademicProfile={academicProfile}
              onSaved={(savedProfile) => {
                setAcademicProfile(savedProfile);
                setCurrentPage("home");
              }}
            />
          )}

        {profile?.role === "student" && currentPage === "ai" && (isAcademicProfileLoading ? (
          <p style={styles.text} role="status">선택과목 정보를 불러오는 중입니다.</p>
        ) : !academicProfile ? (
          <section style={styles.box}>
            <p style={styles.text}>활동 분석을 시작하려면 학년과 선택과목을 먼저 설정해 주세요.</p>
            <button type="button" className="student-back" onClick={() => setCurrentPage("academic")}>학년 / 선택과목 설정</button>
          </section>
        ) : (
          <AiAnalysisPage
            academicProfile={academicProfile}
            records={records}
            teacherSharedFiles={teacherSharedFiles}
            onBack={() => setCurrentPage("home")}
          />
        ))}
        {profile?.role === "student" &&
          ["register", "records", "materials"].includes(currentPage) && (
          <StudentPage
            section={currentPage}
            onNavigate={setCurrentPage}
            grade={grade}
            setGrade={setGrade}
            semester={semester}
            setSemester={setSemester}
            subject={subject}
            setSubject={setSubject}
            title={title}
            setTitle={setTitle}
            content={content}
            setContent={setContent}
            handleSubmitResearchRecord={handleSubmitResearchRecord}
            isUploadDragging={isUploadDragging}
            handleUploadDragOver={handleUploadDragOver}
            handleUploadDragLeave={handleUploadDragLeave}
            handleUploadDrop={handleUploadDrop}
            openGooglePicker={openGooglePicker}
            isPickerLoading={isPickerLoading}
            isUploadingFile={isUploadingFile}
            isGoogleAuthLoading={isGoogleAuthLoading}
            driveFileName={driveFileName}
            driveFileUrl={driveFileUrl}
            isSubmitting={isSubmitting}
            records={records}
            handleDeleteResearchRecord={handleDeleteResearchRecord}
            deletingRecordId={deletingRecordId}
            loadTeacherSharedFiles={loadTeacherSharedFiles}
            session={session}
            isLoadingTeacherSharedFiles={isLoadingTeacherSharedFiles}
            teacherSharedFiles={teacherSharedFiles}
          />
        )}

        </div>}

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

export default App;

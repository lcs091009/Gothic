import { useEffect, useRef, useState } from "react";
import {
  getFriendlySupabaseError,
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
  withRetry,
} from "./lib/supabaseClient";
import CurriculumSetup from "./components/CurriculumSetup";

function getStudentNumber(email) {
  const match = email.match(/^26-(\d+)@gochon\.hs\.kr$/);
  return match ? match[1] : null;
}

function normalizeStudentNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const digits = String(value).match(/\d+/);
  return digits ? String(Number(digits[0])) : null;
}

// 파일명에서 학번을 추출한다. 예) "26-3_주제탐구.pdf" -> "3", "3번 탐구.pdf" -> "3"
function parseStudentNumberFromFileName(fileName) {
  if (!fileName) {
    return null;
  }

  const dashStyle = fileName.match(/26[-_ ]?(\d{1,2})(?!\d)/);
  if (dashStyle) {
    return normalizeStudentNumber(dashStyle[1]);
  }

  const beonStyle = fileName.match(/(\d{1,2})\s*번/);
  if (beonStyle) {
    return normalizeStudentNumber(beonStyle[1]);
  }

  return null;
}

// 파일 목록을 학생 프로필과 학번 기준으로 매칭한다.
function matchFilesToStudents(files, students) {
  const studentByNumber = new Map();

  for (const student of students) {
    const key = normalizeStudentNumber(student.student_number);
    if (key) {
      studentByNumber.set(key, student);
    }
  }

  return files.map((file) => {
    const studentNumber = parseStudentNumberFromFileName(file.name);
    const student = studentNumber
      ? studentByNumber.get(studentNumber) || null
      : null;

    return { file, studentNumber, student };
  });
}

// 실제 AI 연동 전까지 사용할 임시(자동 생성) 분석 텍스트.
function buildMockAnalysis({ student, file, topic }) {
  const who = student?.name
    ? `${student.name} 학생`
    : `${student?.student_number || "?"}번 학생`;

  return [
    "※ 이 분석은 임시(자동 생성) 예시입니다. 실제 AI 분석은 다음 단계에서 연동됩니다.",
    "",
    `[대상] ${who}`,
    `[탐구 주제] ${topic || "미정"}`,
    `[분석 대상 문서] ${file.name}`,
    "",
    "1. 핵심 요약: 제출한 문서에서 드러난 관심 분야와 탐구 흐름을 정리했습니다.",
    "2. 강점: 자료를 스스로 찾아 근거를 제시하려는 태도가 보입니다.",
    "3. 다음 탐구 방향 제안: 이번 주제와 연결되는 심화 질문을 이어서 탐구해 보세요.",
  ].join("\n");
}

// Drive 폴더 안의 파일 목록(메타데이터)을 가져온다.
async function listDriveFolderFiles(folderId, accessToken) {
  const files = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      throw new Error("Drive files.list 요청이 실패했습니다.");
    }

    const json = await response.json();
    files.push(...(json.files || []));
    pageToken = json.nextPageToken || "";
  } while (pageToken);

  return files;
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

  const [analyses, setAnalyses] = useState([]);
  const [students, setStudents] = useState([]);
  const [topic, setTopic] = useState("");
  const [folderName, setFolderName] = useState("");
  const [matchResults, setMatchResults] = useState([]);
  const [isTeacherPickerLoading, setIsTeacherPickerLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [driveFileId, setDriveFileId] = useState("");
  const [driveFileName, setDriveFileName] = useState("");
  const [driveFileUrl, setDriveFileUrl] = useState("");
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState(null);

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pageRef = useRef(null);

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
          await loadResearchRecords(data.session.user.id);
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
            await loadResearchRecords(newSession.user.id);
          } catch (error) {
            setMessage(getFriendlySupabaseError(error));
          }
        } else {
          setProfile(null);
          setRecords([]);
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

  useEffect(() => {
    if (!isSupabaseConfigured() || !profile || !session?.user) {
      return;
    }

    if (profile.role === "teacher") {
      loadStudents();
    } else if (profile.role === "student") {
      loadMyAnalyses(session.user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, session?.user?.id]);

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

  async function loadStudents() {
    if (!isSupabaseConfigured()) {
      return;
    }

    const { data, error } = await withRetry(() =>
      supabase
        .from("profiles")
        .select("id, email, name, student_number, role")
        .eq("role", "student")
        .order("student_number", { ascending: true })
    );

    if (error) {
      setMessage(getFriendlySupabaseError(error));
      return;
    }

    setStudents(data || []);
  }

  async function loadMyAnalyses(userId) {
    if (!isSupabaseConfigured()) {
      return;
    }

    const { data, error } = await withRetry(() =>
      supabase
        .from("ai_analyses")
        .select("*")
        .eq("student_user_id", userId)
        .order("created_at", { ascending: false })
    );

    if (error) {
      setMessage(getFriendlySupabaseError(error));
      return;
    }

    setAnalyses(data || []);
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

  const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!googleApiKey || !googleClientId) {
    setMessage(
      "Google Picker 설정이 필요합니다. .env의 VITE_GOOGLE_API_KEY와 VITE_GOOGLE_CLIENT_ID를 확인하세요."
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
          .setDeveloperKey(googleApiKey)
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
  } catch {
    setMessage("Google Picker를 여는 중 오류가 발생했습니다.");
    setIsPickerLoading(false);
  }
}

async function openTeacherFolderPicker() {
  setMessage("");

  const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!googleApiKey || !googleClientId) {
    setMessage(
      "Google Picker 설정이 필요합니다. .env의 VITE_GOOGLE_API_KEY와 VITE_GOOGLE_CLIENT_ID를 확인하세요."
    );
    return;
  }

  setIsTeacherPickerLoading(true);

  try {
    await loadGooglePickerLibraries();

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      // 폴더 안의 문서 목록을 읽어야 하므로 읽기 권한이 필요합니다.
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          setMessage("Google Drive 권한 요청에 실패했습니다.");
          setIsTeacherPickerLoading(false);
          return;
        }

        const accessToken = tokenResponse.access_token;

        const folderView = new window.google.picker.DocsView(
          window.google.picker.ViewId.FOLDERS
        )
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true)
          .setMimeTypes("application/vnd.google-apps.folder");

        const fileView = new window.google.picker.DocsView()
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false);

        const picker = new window.google.picker.PickerBuilder()
          .setDeveloperKey(googleApiKey)
          .setOAuthToken(accessToken)
          .addView(folderView)
          .addView(fileView)
          .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
          .setCallback(async (data) => {
            if (data.action === window.google.picker.Action.CANCEL) {
              setIsTeacherPickerLoading(false);
              return;
            }

            if (data.action !== window.google.picker.Action.PICKED) {
              return;
            }

            try {
              const picked = data.docs || [];
              const folderDoc = picked.find(
                (doc) =>
                  doc.mimeType === "application/vnd.google-apps.folder" ||
                  doc.type === "folder"
              );

              let files = [];
              let pickedTopic = "";

              if (folderDoc) {
                // 폴더를 선택한 경우: 폴더 안의 문서 목록을 조회한다.
                pickedTopic = folderDoc.name || folderDoc.title || "";
                files = await listDriveFolderFiles(folderDoc.id, accessToken);
              } else {
                // 문서를 직접 여러 개 선택한 경우.
                files = picked.map((doc) => ({
                  id: doc.id,
                  name: doc.name || doc.title || "",
                  mimeType: doc.mimeType,
                  webViewLink: doc.url || "",
                }));
              }

              const documentFiles = files.filter(
                (file) => file.mimeType !== "application/vnd.google-apps.folder"
              );

              setFolderName(pickedTopic);
              setTopic((prev) => prev || pickedTopic);
              setMatchResults(matchFilesToStudents(documentFiles, students));
              setMessage(
                documentFiles.length
                  ? `${documentFiles.length}개의 문서를 불러왔습니다. 매칭 결과를 확인하세요.`
                  : "폴더에서 문서를 찾지 못했습니다."
              );
            } catch {
              setMessage(
                "폴더 내용을 불러오는 중 오류가 발생했습니다. Drive 접근 권한(폴더 읽기)을 확인하세요."
              );
            } finally {
              setIsTeacherPickerLoading(false);
            }
          })
          .build();

        picker.setVisible(true);
      },
    });

    tokenClient.requestAccessToken({ prompt: "consent" });
  } catch {
    setMessage("Google Picker를 여는 중 오류가 발생했습니다.");
    setIsTeacherPickerLoading(false);
  }
}

async function handleGenerateAnalyses() {
  setMessage("");

  if (!isSupabaseConfigured()) {
    setMessage(supabaseConfigError || "Supabase 설정이 필요합니다.");
    return;
  }

  if (!session?.user) {
    setMessage("먼저 로그인해야 합니다.");
    return;
  }

  const matched = matchResults.filter((result) => result.student);

  if (matched.length === 0) {
    setMessage(
      "매칭된 학생 문서가 없습니다. 파일명에 학번(예: 26-3)이 포함되어야 합니다."
    );
    return;
  }

  setIsGenerating(true);

  try {
    const rows = matched.map((result) => ({
      student_user_id: result.student.id,
      student_number: result.student.student_number,
      student_email: result.student.email,
      topic: topic || folderName || "미정",
      source_file_id: result.file.id || null,
      source_file_name: result.file.name || null,
      source_file_url: result.file.webViewLink || null,
      analysis_text: buildMockAnalysis({
        student: result.student,
        file: result.file,
        topic: topic || folderName,
      }),
      status: "matched",
      uploaded_by: session.user.id,
    }));

    const { error } = await withRetry(() =>
      supabase.from("ai_analyses").insert(rows)
    );

    if (error) {
      setMessage(getFriendlySupabaseError(error));
      return;
    }

    setMessage(`${rows.length}명의 학생에게 AI 분석 결과(임시)를 생성했습니다.`);
    setMatchResults([]);
  } catch (error) {
    setMessage(getFriendlySupabaseError(error));
  } finally {
    setIsGenerating(false);
  }
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

    if (!driveFileId) {
      setMessage("Google Drive 파일을 먼저 선택하거나 업로드해 주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await withRetry(() =>
        supabase.from("research_records").insert({
          user_id: session.user.id,
          student_email: session.user.email,
          grade: "미입력",
          semester: "미입력",
          subject: "Google Drive",
          title: driveFileName || "Google Drive 파일",
          content: driveFileUrl || "Google Drive 파일이 등록되었습니다.",
          drive_file_id: driveFileId || null,
          drive_file_name: driveFileName || null,
          drive_file_url: driveFileUrl || null,
        })
      );

      if (error) {
        setMessage(getFriendlySupabaseError(error));
        return;
      }

      setMessage("Google Drive 파일이 저장되었습니다.");
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
    "이 탐구 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다."
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

    setMessage("탐구 기록이 삭제되었습니다.");
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
        <section style={styles.card}>
          <h1>불러오는 중...</h1>
        </section>
      </main>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.title}>학생 탐구 추천 플랫폼</h1>

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
          <p style={styles.brand}>학생 탐구 추천 플랫폼</p>
          <button onClick={signInWithGoogle} style={styles.loginButton}>
            로그인
          </button>
        </header>

        <section style={styles.centerStage}>
          <img
            src="/research-logo.svg"
            alt="학생 탐구 추천 플랫폼 로고"
            style={styles.heroLogo}
          />

          <div style={styles.introBox}>
            <p style={styles.kicker}>생활기록부 기반 탐구 추천</p>
            <h1 style={styles.heroTitle}>학생 탐구 추천 플랫폼</h1>

            <p style={styles.heroText}>
              여러분들의 생활 기록부를 더 체계적으로 관리하기 위해 여러분들의
              이전 탐구 활동 내용을 바탕으로 여러분들이 앞으로 할 탐구의
              방향성을 잡아드립니다!
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
              <strong style={styles.landingFeatureTitle}>방향 추천</strong>
              <span style={styles.landingFeatureText}>
                다음 탐구 주제를 더 자연스럽게 이어갑니다.
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
            <h1 style={styles.title}>학생 탐구 추천 플랫폼</h1>
            <p style={styles.text}>로그인 계정: {session.user.email}</p>
            <p style={styles.text}>역할: {profile?.role || "확인 중"}</p>
          </div>

          <button
            className="animated-button"
            type="button"
            onClick={() => {
              if (profile?.role === "student") {
                loadMyAnalyses(session.user.id);
                setMessage("AI 분석 결과를 새로고침했습니다.");
              } else {
                setMessage("학생 계정에서 본인 AI 분석 결과를 볼 수 있습니다.");
              }
            }}
            style={styles.aiResultButton}
          >
            AI 분석 결과 보기
          </button>

          <button
            className="animated-button"
            onClick={signOut}
            style={styles.secondaryButton}
          >
            로그아웃
          </button>
        </div>

        {profile?.role === "student" && (
          <>
            <h2 style={{ ...styles.subTitle, marginTop: 28 }}>
              내 교육과정 설정
            </h2>
            <CurriculumSetup session={session} />

            <p style={styles.uploadIntroText}>
              이 곳에 본인이 활동했던 내용이 담긴 파일을 업로드 하세요!
            </p>

            <section style={styles.uploadPanel}>
              <h2 style={styles.subTitle}>Google Drive 파일 업로드</h2>

              <form onSubmit={handleSubmitResearchRecord} style={styles.form}>
                <div style={styles.driveUploadBox}>
                  <label style={styles.uploadLabel}>Google Drive 파일 선택/업로드</label>

                  <p style={styles.uploadHelpText}>
                    버튼을 누르면 Google Picker가 열립니다. 기존 Drive 파일을 선택하거나
                    새 파일을 Drive에 업로드한 뒤 선택할 수 있습니다.
                  </p>

                  <button
                    className="animated-button"
                    type="button"
                    onClick={openGooglePicker}
                    disabled={isPickerLoading}
                    style={styles.driveButton}
                  >
                    {isPickerLoading ? "Google Picker 여는 중..." : "Google Drive에서 파일 선택/업로드"}
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
                  {isSubmitting ? "저장 중..." : "파일 저장"}
                </button>
              </form>
            </section>

            <section style={styles.box}>
              <h2 style={styles.subTitle}>내 Google Drive 파일</h2>

              {records.length === 0 ? (
                <p style={styles.text}>아직 저장된 파일이 없습니다.</p>
              ) : (
                <div style={styles.recordList}>
                  {records.map((record) => (
                    <article key={record.id} style={styles.recordCard}>
                      <h3 style={styles.recordTitle}>
                        {record.drive_file_name || record.title}
                      </h3>

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
                        type="button"
                        onClick={() => handleDeleteResearchRecord(record.id)}
                        disabled={deletingRecordId === record.id}
                        style={styles.deleteButton}
                      >
                        {deletingRecordId === record.id
                          ? "삭제 중..."
                          : "파일 기록 삭제"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section style={styles.box}>
              <h2 style={styles.subTitle}>내 AI 분석 결과</h2>

              {analyses.length === 0 ? (
                <p style={styles.text}>
                  아직 분석 결과가 없습니다. 선생님이 분석을 생성하면 여기에
                  표시됩니다.
                </p>
              ) : (
                <div style={styles.recordList}>
                  {analyses.map((analysis) => (
                    <article key={analysis.id} style={styles.recordCard}>
                      <h3 style={styles.recordTitle}>
                        {analysis.topic || "탐구 분석"}
                      </h3>

                      {analysis.source_file_name && (
                        <p style={styles.fileNameText}>
                          문서: {analysis.source_file_name}
                        </p>
                      )}

                      {analysis.source_file_url && (
                        <a
                          href={analysis.source_file_url}
                          target="_blank"
                          rel="noreferrer"
                          style={styles.link}
                        >
                          원본 문서 열기
                        </a>
                      )}

                      <p style={styles.recordContent}>
                        {analysis.analysis_text}
                      </p>

                      <p style={styles.dateText}>
                        생성 시간:{" "}
                        {new Date(analysis.created_at).toLocaleString("ko-KR")}
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
          <>
            <section style={styles.uploadPanel}>
              <h2 style={styles.subTitle}>학생 폴더 업로드 (선생님)</h2>

              <p style={styles.uploadHelpText}>
                같은 주제의 학생 문서가 담긴 Google Drive 폴더를 선택하면,
                파일명의 학번(예: 26-3)을 읽어 학생별로 자동 분류합니다. 각
                학생은 본인 계정에서 자신의 분석 결과만 볼 수 있습니다.
              </p>

              <div style={styles.form}>
                <div style={styles.field}>
                  <label style={styles.label}>탐구 주제</label>
                  <input
                    style={styles.input}
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="예: 미세먼지와 건강"
                  />
                </div>

                <button
                  className="animated-button"
                  type="button"
                  onClick={openTeacherFolderPicker}
                  disabled={isTeacherPickerLoading}
                  style={styles.driveButton}
                >
                  {isTeacherPickerLoading
                    ? "폴더 여는 중..."
                    : "Google Drive 폴더 선택"}
                </button>
              </div>

              {students.length === 0 && (
                <p style={styles.smallText}>
                  아직 등록된 학생이 없습니다. 학생이 먼저 로그인하면 매칭
                  대상이 됩니다.
                </p>
              )}
            </section>

            {matchResults.length > 0 && (
              <section style={styles.box}>
                <h2 style={styles.subTitle}>
                  매칭 결과 (
                  {matchResults.filter((result) => result.student).length}/
                  {matchResults.length})
                </h2>

                <div style={styles.recordList}>
                  {matchResults.map((result, index) => (
                    <article
                      key={result.file.id || index}
                      style={styles.recordCard}
                    >
                      <p style={styles.fileNameText}>{result.file.name}</p>

                      {result.student ? (
                        <p style={styles.text}>
                          → {result.student.name || "이름 미등록"} (
                          {result.student.student_number}번) 에게 배정
                        </p>
                      ) : (
                        <p style={styles.text}>
                          → 매칭 실패: 파일명에서 학번을 찾지 못했거나 해당
                          학번의 학생이 등록되지 않았습니다
                          {result.studentNumber
                            ? ` (인식된 학번: ${result.studentNumber})`
                            : ""}
                        </p>
                      )}
                    </article>
                  ))}
                </div>

                <button
                  className="animated-button"
                  type="button"
                  onClick={handleGenerateAnalyses}
                  disabled={isGenerating}
                  style={styles.button}
                >
                  {isGenerating ? "생성 중..." : "학생별 AI 분석 결과 생성"}
                </button>
              </section>
            )}
          </>
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
  uploadIntroText: {
    margin: "32px 0 0",
    color: "#24435f",
    fontSize: "21px",
    fontWeight: 900,
    lineHeight: 1.5,
    textAlign: "center",
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
  aiResultButton: {
    flex: "1 1 auto",
    minWidth: 0,
    alignSelf: "center",
    border: "1px solid rgba(154, 223, 226, 0.88)",
    borderRadius: "999px",
    minHeight: "70px",
    padding: "22px 28px",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    color: "#145BA9",
    fontWeight: 900,
    textAlign: "center",
    cursor: "pointer",
    boxShadow: "0 12px 26px rgba(20, 91, 169, 0.12)",
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
  uploadPanel: {
    marginTop: "34px",
    border: "1px solid rgba(154, 223, 226, 0.9)",
    borderRadius: "24px",
    padding: "30px",
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    boxShadow:
      "0 18px 46px rgba(20, 91, 169, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
  },
  driveUploadBox: {
    minHeight: "260px",
    border: "2px dashed #9ADFE2",
    borderRadius: "22px",
    padding: "36px",
    backgroundColor: "rgba(238, 248, 251, 0.88)",
    boxShadow:
      "0 18px 40px rgba(20, 91, 169, 0.08), inset 0 1px 18px rgba(255, 255, 255, 0.74)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
  },
  uploadLabel: {
    display: "block",
    marginBottom: "10px",
    fontSize: "22px",
    fontWeight: 900,
    color: "#145BA9",
  },
  uploadHelpText: {
    maxWidth: "640px",
    margin: 0,
    fontSize: "15px",
    color: "#24435f",
    lineHeight: 1.7,
    fontWeight: 700,
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

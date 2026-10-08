import { supabase } from "../lib/supabaseClient";
import { useState } from "react";

function AiAnalysisPage({ academicProfile, records, teacherSharedFiles = [], onBack }) {
  const [analysis, setAnalysis] = useState("");
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extraContext, setExtraContext] = useState("");
  const [scope, setScope] = useState(null);
  const [warning, setWarning] = useState("");

  async function handleAnalyze() {
    setMessage("");

    if (!academicProfile) {
      setMessage("선택과목 정보가 없습니다. 먼저 학년과 선택과목을 설정해 주세요.");
      return;
    }

    if (!records || records.length === 0) {
      setMessage("분석할 활동 기록이 없습니다. 먼저 작년 활동이나 탐구 기록을 등록해 주세요.");
      return;
    }

    setIsAnalyzing(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        setMessage("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          extraContext,
        }),
      });

      const rawText = await response.text();

      let data = null;

      try {
        data = JSON.parse(rawText);
      } catch {
        setMessage(
          "분석 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
        );
        return;
      }

      if (!response.ok) {
        setMessage(data.error || "활동 흐름 분석 중 오류가 발생했습니다.");
        return;
      }

      setAnalysis(data.analysis || "분석 결과가 비어 있습니다.");
      setScope(data.scope || null);
      setWarning(data.warning || "");
    } catch (error) {
      setMessage(error.message || "AI 분석 요청에 실패했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  const selectedChoices = academicProfile?.selected_choices || {};

  return (
    <section className="soft-panel ai-analysis-panel" style={styles.page}>
      <button className="animated-button" type="button" onClick={onBack} style={styles.backButton}>
        ← 활동 기록 화면으로 돌아가기
      </button>

      <h2 style={styles.title}>활동 흐름 분석</h2>

      <p style={styles.text}>
        활동에서 이어지는 질문을 찾고, 선택과목과의 연결과 다음 탐구 방법을
        구체적인 기록 근거와 함께 정리합니다.
      </p>

      <div style={styles.noticeBox}>
        <h3 style={styles.infoTitle}>분석 방식</h3>
        <p style={styles.text}>
          최근 등록한 기록 최대 48개의 개요와, 학기·과목을 고려해 고른 최대
          12개의 본문을 참고합니다. 긴 본문은 앞부분과 끝부분을 발췌하며,
          첨부파일은 파일명과 설명만 참고합니다. 보충 입력도 함께 분석합니다.
        </p>
      </div>

      <div style={styles.infoGrid}>
        <div style={styles.infoBox}>
          <h3 style={styles.infoTitle}>교육과정 정보</h3>
          <p style={styles.text}>
            현재 학년: {academicProfile?.current_grade || academicProfile?.grade || "없음"}
          </p>
          <p style={styles.text}>
            교육과정: {academicProfile?.curriculum_label || "없음"}
          </p>
          <p style={styles.text}>
            입학 연도: {academicProfile?.admission_year || "없음"}
          </p>
        </div>

        <div style={styles.infoBox}>
          <h3 style={styles.infoTitle}>활동 기록</h3>
          <p style={styles.text}>저장된 활동 기록 수: {records?.length || 0}개</p>
        </div>
      </div>

      <div style={styles.subjectBox}>
        <h3 style={styles.infoTitle}>선택과목 요약</h3>

        {Object.keys(selectedChoices).length === 0 ? (
          <p style={styles.text}>선택과목 정보가 없습니다.</p>
        ) : (
          <div style={styles.choiceList}>
            {Object.entries(selectedChoices).map(([groupId, subjects]) => (
              <div key={groupId} style={styles.choiceItem}>
                <strong style={styles.groupId}>{groupId}</strong>
                <span style={styles.text}>
                  {Array.isArray(subjects) && subjects.length > 0
                    ? subjects.join(", ")
                    : "선택 없음"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.subjectBox}>
        <h3 style={styles.infoTitle}>선생님 제공 자료 요약</h3>

        {!teacherSharedFiles || teacherSharedFiles.length === 0 ? (
          <p style={styles.text}>아직 연결된 선생님 제공 자료가 없습니다.</p>
        ) : (
          <div style={styles.choiceList}>
            {teacherSharedFiles.map((file) => (
              <div key={file.id} style={styles.choiceItem}>
                <strong style={styles.groupId}>{file.category || "자료"}</strong>
                <span style={styles.text}>
                  {file.file_name}
                  {file.description ? ` - ${file.description}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.extraBox}>
        <h3 style={styles.infoTitle}>업로드하지 못한 활동 보충 입력</h3>

        <p style={styles.text}>
          파일로 올리지 못한 작년 활동, 발표, 수행평가, 독서, 동아리 활동,
          선생님 피드백, 느낀 점, 아쉬웠던 점이 있으면 적어 주세요.
        </p>

        <textarea
          value={extraContext}
          onChange={(event) => setExtraContext(event.target.value)}
          rows={8}
          maxLength={1200}
          placeholder={`예:
통합사회 시간에 기후와 지형이 문화 차이에 미치는 영향을 발표했습니다.
파일은 없지만, 문화 차이를 단순히 국민성으로 설명하면 안 되고 환경 조건도 같이 봐야 한다고 느꼈습니다.
선생님께서는 사례 비교가 더 있으면 좋겠다고 피드백해 주셨습니다.`}
          style={styles.textarea}
        />
      </div>

      {message && <p style={styles.message}>{message}</p>}

      <button
        className="animated-button"
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        style={{
          ...styles.analyzeButton,
          opacity: isAnalyzing ? 0.72 : 1,
          cursor: isAnalyzing ? "wait" : "pointer",
        }}
      >
        {isAnalyzing ? (
          <>
            활동 흐름 분석 중
            <span className="button-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </>
        ) : (
          "활동 근거로 다음 탐구 찾기"
        )}
      </button>

      {analysis && (
        <div style={styles.resultBox}>
          <h3 style={styles.resultTitle}>활동 흐름 분석 결과</h3>
          {scope && <p style={styles.text}>
            기록 개요 {scope.scannedRecords}개 · 본문 발췌 {scope.detailedRecords}개 ·
            선생님 자료 {scope.teacherMaterials}개를 참고한 결과입니다.
            {scope.scanLimitReached && " 최근 등록한 48개 기록 범위에서 분석했습니다."}
          </p>}
          {warning && <p role="status" style={styles.text}>{warning}</p>}
          <pre style={styles.resultText}>{analysis}</pre>
        </div>
      )}
    </section>
  );
}

const styles = {
  page: {
    marginTop: "28px",
    border: "1px solid #e3e5e8",
    borderRadius: "16px",
    padding: "24px",
    backgroundColor: "#f7f8fa",
  },
  backButton: {
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "10px 14px",
    backgroundColor: "white",
    color: "#334155",
    fontWeight: 700,
    cursor: "pointer",
  },
  title: {
    marginTop: "20px",
    marginBottom: "10px",
    fontSize: "26px",
    color: "#0f172a",
  },
  text: {
    color: "#475569",
    lineHeight: 1.7,
    margin: "4px 0",
  },
  noticeBox: {
    marginTop: "18px",
    border: "1px solid #e3e5e8",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "#f7f8fa",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginTop: "20px",
  },
  infoBox: {
    border: "1px solid #e3e5e8",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "white",
  },
  infoTitle: {
    marginTop: 0,
    marginBottom: "10px",
    color: "#303841",
  },
  subjectBox: {
    marginTop: "18px",
    border: "1px solid #e3e5e8",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "white",
  },
  extraBox: {
    marginTop: "18px",
    border: "1px solid #e3e5e8",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "white",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    marginTop: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "12px",
    backgroundColor: "white",
    color: "#0f172a",
    fontSize: "15px",
    lineHeight: 1.7,
    resize: "vertical",
    fontFamily:
      "Pretendard, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  choiceList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  choiceItem: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    flexWrap: "wrap",
    borderBottom: "1px solid #e2e8f0",
    paddingBottom: "8px",
  },
  groupId: {
    color: "#454d57",
    minWidth: "120px",
  },
  message: {
    marginTop: "16px",
    color: "#dc2626",
    fontWeight: 700,
    whiteSpace: "pre-wrap",
  },
  analyzeButton: {
    marginTop: "20px",
    border: "none",
    borderRadius: "12px",
    padding: "14px 18px",
    backgroundColor: "#303841",
    color: "white",
    fontWeight: 800,
  },
  resultBox: {
    marginTop: "22px",
    border: "1px solid #cbd5e1",
    borderRadius: "16px",
    padding: "20px",
    backgroundColor: "white",
  },
  resultTitle: {
    marginTop: 0,
    color: "#0f172a",
  },
  resultText: {
    whiteSpace: "pre-wrap",
    wordBreak: "keep-all",
    overflowWrap: "break-word",
    fontFamily:
      "Pretendard, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    color: "#0f172a",
    lineHeight: 1.8,
    fontSize: "15px",
  },
};

export default AiAnalysisPage;

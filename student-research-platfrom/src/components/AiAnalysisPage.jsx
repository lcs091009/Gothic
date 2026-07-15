import { useState } from "react";

function AiAnalysisPage({ academicProfile, records, onBack }) {
  const [analysis, setAnalysis] = useState("");
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  async function handleAnalyze() {
    setMessage("");
    setAnalysis("");
    console.log("AI 분석 요청 시작");
    console.log("academicProfile:", academicProfile);
    console.log("records:", records);

    if (!academicProfile) {
      setMessage("선택과목 정보가 없습니다. 먼저 학년과 선택과목을 설정해 주세요.");
      return;
    }

    if (!records || records.length === 0) {
      setMessage("분석할 탐구 기록이 없습니다. 먼저 탐구 기록을 등록해 주세요.");
      return;
    }

    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          academicProfile,
          records,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "AI 분석 중 오류가 발생했습니다.");
        return;
      }

      setAnalysis(data.analysis || "AI 분석 결과가 비어 있습니다.");
    } catch (error) {
      setMessage(error.message || "AI 분석 요청에 실패했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  const selectedChoices = academicProfile?.selected_choices || {};

  return (
    <section style={styles.page}>
      <button type="button" onClick={onBack} style={styles.backButton}>
        ← 탐구 기록 화면으로 돌아가기
      </button>

      <h2 style={styles.title}>AI 분석 결과</h2>

      <p style={styles.text}>
        저장된 선택과목과 탐구 기록을 바탕으로, 선택과목과 연결되는
        심화탐구 주제를 추천합니다.
      </p>

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
          <h3 style={styles.infoTitle}>탐구 기록</h3>
          <p style={styles.text}>저장된 탐구 기록 수: {records?.length || 0}개</p>
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

      {message && <p style={styles.message}>{message}</p>}

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        style={styles.analyzeButton}
      >
        {isAnalyzing ? "AI가 분석 중입니다..." : "AI로 심화탐구 주제 추천받기"}
      </button>

      {analysis && (
        <div style={styles.resultBox}>
          <h3 style={styles.resultTitle}>분석 결과</h3>
          <pre style={styles.resultText}>{analysis}</pre>
        </div>
      )}
    </section>
  );
}

const styles = {
  page: {
    marginTop: "28px",
    border: "1px solid #bfdbfe",
    borderRadius: "16px",
    padding: "24px",
    backgroundColor: "#eff6ff",
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
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginTop: "20px",
  },
  infoBox: {
    border: "1px solid #dbeafe",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "white",
  },
  infoTitle: {
    marginTop: 0,
    marginBottom: "10px",
    color: "#1e3a8a",
  },
  subjectBox: {
    marginTop: "18px",
    border: "1px solid #dbeafe",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "white",
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
    color: "#1d4ed8",
    minWidth: "120px",
  },
  message: {
    marginTop: "16px",
    color: "#dc2626",
    fontWeight: 700,
  },
  analyzeButton: {
    marginTop: "20px",
    border: "none",
    borderRadius: "12px",
    padding: "14px 18px",
    backgroundColor: "#2563eb",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
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
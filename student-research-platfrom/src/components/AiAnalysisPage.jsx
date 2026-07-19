import { useState } from "react";

function AiAnalysisPage({ academicProfile, records, onBack }) {
  const [analysis, setAnalysis] = useState("");
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extraContext, setExtraContext] = useState("");

  async function handleAnalyze() {
    setMessage("");
    setAnalysis("");

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
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          academicProfile,
          records,
          extraContext,
        }),
      });

      const rawText = await response.text();

      let data = null;

      try {
        data = JSON.parse(rawText);
      } catch {
        setMessage(
          `서버가 JSON이 아닌 응답을 보냈습니다. 서버 함수 api/analyze.js에서 오류가 났을 가능성이 큽니다.\n\n응답 내용:\n${rawText.slice(0, 300)}`
        );
        return;
      }

      if (!response.ok) {
        setMessage(data.error || "활동 흐름 분석 중 오류가 발생했습니다.");
        return;
      }

      setAnalysis(data.analysis || "분석 결과가 비어 있습니다.");
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
        ← 활동 기록 화면으로 돌아가기
      </button>

      <h2 style={styles.title}>활동 흐름 분석</h2>

      <p style={styles.text}>
        이 기능은 AI가 심화탐구 주제를 대신 정해 주는 기능이 아닙니다.
        저장된 선택과목과 활동 기록을 바탕으로, 작년 활동이 현재 과목과
        어떻게 이어질 수 있는지 정리해 줍니다.
      </p>

      <div style={styles.noticeBox}>
        <h3 style={styles.infoTitle}>분석 방식</h3>
        <p style={styles.text}>
          AI는 업로드된 활동 기록과 아래 보충 입력 내용을 함께 참고합니다.
          다만 최종 활동 방향과 주제는 학생이 직접 정해야 합니다.
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
          placeholder={`예:
통합사회 시간에 기후와 지형이 문화 차이에 미치는 영향을 발표했습니다.
파일은 없지만, 문화 차이를 단순히 국민성으로 설명하면 안 되고 환경 조건도 같이 봐야 한다고 느꼈습니다.
선생님께서는 사례 비교가 더 있으면 좋겠다고 피드백해 주셨습니다.`}
          style={styles.textarea}
        />
      </div>

      {message && <p style={styles.message}>{message}</p>}

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        style={{
          ...styles.analyzeButton,
          opacity: isAnalyzing ? 0.7 : 1,
          cursor: isAnalyzing ? "not-allowed" : "pointer",
        }}
      >
        {isAnalyzing ? "활동 흐름을 분석 중입니다..." : "작년 활동과 현재 과목 연결점 찾기"}
      </button>

      {analysis && (
        <div style={styles.resultBox}>
          <h3 style={styles.resultTitle}>활동 흐름 분석 결과</h3>
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
  noticeBox: {
    marginTop: "18px",
    border: "1px solid #fde68a",
    borderRadius: "14px",
    padding: "16px",
    backgroundColor: "#fffbeb",
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
  extraBox: {
    marginTop: "18px",
    border: "1px solid #dbeafe",
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
    color: "#1d4ed8",
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
    backgroundColor: "#2563eb",
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
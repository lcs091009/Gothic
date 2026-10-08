import { supabase } from "../lib/supabaseClient";
import { useState } from "react";

function AiAnalysisPage({ academicProfile, records = [], teacherSharedFiles = [] }) {
  const [selection, setSelection] = useState(null);
  const selectedIds = selection ?? new Set(records.slice(0, 48).map(record => record.id));
  const selectedRecordIds = records.filter(record => selectedIds.has(record.id)).map(record => record.id);
  function toggleRecord(id) {
    const next = new Set(selectedRecordIds);
    if (next.has(id)) next.delete(id);
    else if (next.size < 48) next.add(id);
    else { setMessage("한 번에 최대 48개까지 선택할 수 있습니다."); return; }
    setSelection(next);
    setMessage("");
  }
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

    if (!selectedRecordIds.length) {
      setMessage("분석할 활동을 하나 이상 선택해 주세요.");
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
          selectedRecordIds,
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
    <section className="inner-page ai-analysis-panel" style={styles.page}>
      <p style={styles.text}>활동을 골라 관심 흐름과 다음 탐구 방향을 살펴보세요.</p>

      <div style={styles.subjectBox}>
        <h3 style={styles.infoTitle}>분석할 활동 선택</h3>
        <p style={styles.text}>제목을 펼쳐 내용을 확인하고 분석에 넣을 활동을 체크해 주세요.</p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
          <button type="button" style={styles.backButton} disabled={isAnalyzing}
            onClick={() => setSelection(new Set(records.slice(0, 48).map(record => record.id)))}>
            {records.length > 48 ? "최근 48개 선택" : "전체 선택"}
          </button>
          <button type="button" style={styles.backButton} disabled={isAnalyzing}
            onClick={() => setSelection(new Set())}>전체 해제</button>
          <span role="status" style={styles.text}>{selectedRecordIds.length}개 선택 / 최대 48개</span>
        </div>
        <div style={{ maxHeight: "440px", overflowY: "auto", display: "grid", gap: 0 }}>
          {records.length === 0 && <p style={styles.text}>저장된 활동 기록이 없습니다.</p>}
          {records.map(record => (
            <div key={record.id} style={{ borderBottom: "1px solid #e3e5e8", padding: "12px",
              background: selectedIds.has(record.id) ? "#f1f5f2" : "white" }}>
              <label style={{ display: "flex", gap: "10px", alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={selectedIds.has(record.id)} disabled={isAnalyzing}
                  onChange={() => toggleRecord(record.id)} style={{ accentColor: "#627968", width: "18px", height: "18px" }} />
                <strong>{record.title || "제목 없음"}</strong>
              </label>
              <p style={styles.text}>{[record.grade, record.semester, record.subject].filter(Boolean).join(" · ")}</p>
              <details>
                <summary style={{ cursor: "pointer", color: "#627968" }}>활동 내용 보기</summary>
                <p style={{ ...styles.text, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{record.content || "작성된 내용이 없습니다."}</p>
                {record.drive_file_name && <p style={styles.text}>첨부: {record.drive_file_name}</p>}
              </details>
            </div>
          ))}
        </div>
      </div>

      <details className="quiet-details analysis-reference">
        <summary>분석 참고 정보 · 선택과목 및 선생님 자료</summary>
      <div style={styles.noticeBox}>
        <h3 style={styles.infoTitle}>분석 방식</h3>
        <p style={styles.text}>
          직접 선택한 기록 최대 48개의 개요와, 학기·과목을 고려해 고른 최대
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

      </details>

      <details className="quiet-details analysis-supplement" style={styles.extraBox}>
        <summary>활동 보충 입력 <span className="field-optional">선택</span></summary>

        <p style={styles.text}>
          기록에 없는 활동이나 선생님 피드백을 추가해 주세요.
        </p>

        <textarea
          value={extraContext}
          onChange={(event) => setExtraContext(event.target.value)}
          rows={4}
          maxLength={1200}
          placeholder="예: 발표 후 사례 비교가 더 필요하다는 피드백을 받았습니다."
          style={styles.textarea}
        />
      </details>

      {message && <p style={styles.message}>{message}</p>}

      <button
        className="animated-button"
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing || selectedRecordIds.length === 0}
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
          "선택한 활동 분석하기"
        )}
      </button>

      {analysis && (
        <div style={styles.resultBox}>
          <h3 style={styles.resultTitle}>활동 흐름 분석 결과</h3>
          {scope && <p style={styles.text}>
            기록 개요 {scope.scannedRecords}개 · 본문 발췌 {scope.detailedRecords}개 ·
            선생님 자료 {scope.teacherMaterials}개를 참고한 결과입니다.
            {scope.scanLimitReached && " 최대 48개 기록 범위에서 분석했습니다."}
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
    border: "none",
    borderRadius: 0,
    padding: 0,
    backgroundColor: "transparent",
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
    padding: "12px 0",
    border: "none",
    borderBottom: "1px solid #e3e5e8",
    backgroundColor: "transparent",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginTop: "20px",
  },
  infoBox: {
    marginTop: "18px",
    padding: "12px 0",
    border: "none",
    borderBottom: "1px solid #e3e5e8",
    backgroundColor: "transparent",
  },
  infoTitle: {
    marginTop: 0,
    marginBottom: "10px",
    color: "#303841",
  },
  subjectBox: {
    marginTop: "18px",
    padding: "12px 0",
    border: "none",
    borderBottom: "1px solid #e3e5e8",
    backgroundColor: "transparent",
  },
  extraBox: {
    marginTop: "18px",
    padding: "12px 0",
    border: "none",
    borderBottom: "1px solid #e3e5e8",
    backgroundColor: "transparent",
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

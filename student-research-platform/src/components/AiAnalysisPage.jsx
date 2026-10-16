import {runAnalysisJob,getAnalysisAccessToken} from "../lib/analysisJobs.js";
import AnalysisNotebook from "./AnalysisNotebook";
import {useAnalysisNotes} from "../hooks/useAnalysisNotes";
import {analysisNoteContent,noteTitle} from "../lib/analysisNotes.js";
import {requestDocumentTexts} from "../lib/analysisDocumentExcerpt.js";
import RetainedView from "./RetainedView";
import {useGoogleDrive} from "../hooks/useGoogleDrive";
import PickerAccountBar from "./PickerAccountBar";
import SubjectFocus from "./SubjectFocus";
import {analysisDocuments,packDocumentTexts} from "../lib/analysisDocuments";
import {readAnalysisDocuments} from "../lib/readAnalysisDocument";
import "./AnalysisWorkspace.css";
import { supabase } from "../lib/supabaseClient";
import { useCallback, useEffect, useRef, useState } from "react";
import { materialOptions } from "../lib/analysisMaterials";
import AnalysisWorkspace from "./AnalysisWorkspace";

function AiAnalysisPage({ academicProfile, records = [], teacherSharedFiles = [], userId, active=true, recordsLoading=false, recordsError="", onReloadRecords }) {
  const notebook=useAnalysisNotes(userId);
  const [restoredNote,setRestoredNote]=useState(false);
  const [notesView,setNotesView]=useState(false),[openingNote,setOpeningNote]=useState(false),[currentNote,setCurrentNote]=useState(null);
  const changeExploration=useCallback(explorationState=>setCurrentNote(previous=>{
    if(!previous || JSON.stringify(previous.content.explorationState)===JSON.stringify(explorationState)) return previous;
    return {...previous,content:{...previous.content,explorationState}};
  }),[]);
  const saveNote=notebook.save;
  useEffect(()=>{if(currentNote) saveNote(currentNote);},[currentNote,saveNote]);
  async function openNote(id) {
    requestRef.current?.abort();requestRef.current=null;setIsAnalyzing(false);
    setOpeningNote(true);
    try {
      const note=await notebook.open(id),content=note.content;
      if(content.version!==1 || typeof content.analysis!=="string" || !Array.isArray(content.inputs?.records) || !Array.isArray(content.inputs?.files)) throw new Error("invalid note");
      setRestoredNote(true);setCurrentNote(note);setAnalysis(content.analysis);setExploration(content.exploration);setResultInputs({...content.inputs,documentTexts:[]});setScope(content.scope);setWarning(content.warning || "");setWorkspace(true);setNotesView(false);setMessage("");
    } catch {setMessage("노트를 열지 못했어요. 다시 시도해 주세요.");}
    finally {setOpeningNote(false);}
  }
  async function deleteNote(id) {
    const removed=await notebook.remove(id);
    if(removed && currentNote?.id===id) {
      setCurrentNote(null);setAnalysis("");setExploration(null);setResultInputs(null);setScope(null);setWarning("");setWorkspace(false);setRestoredNote(false);
    }
    return removed;
  }
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
  const [subject,setSubject]=useState("");
  const [fileProgress,setFileProgress]=useState("");
  const [fileFailures,setFileFailures]=useState([]);
  const [readyDocuments,setReadyDocuments]=useState(null);
  const readyKey=useRef("");
  const readyAt=useRef(0);
  const readyComplete=useRef(false);
  const [analysis, setAnalysis] = useState("");
  const [exploration, setExploration] = useState(null);
  const [message, setMessage] = useState("");
  const {getGoogleAccessToken:getDriveAccessToken,openGooglePicker,isPickerOpen,driveAccountEmail,switchPickerAccount,closeGooglePicker,isPickerLoading}=useGoogleDrive({setMessage,userId,multiple:true,accessOnly:true});
  useEffect(()=>{if(!active) closeGooglePicker();},[active,closeGooglePicker]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extraContext, setExtraContext] = useState("");
  const [scope, setScope] = useState(null);
  const [warning, setWarning] = useState("");
  const [workspace, setWorkspace] = useState(false);
  const [resultInputs, setResultInputs] = useState(null);
  const [teacherSelection, setTeacherSelection] = useState(new Set());
  const options = materialOptions(teacherSharedFiles);
  const selectedFiles = options.filter(file=>teacherSelection.has(file.key));
  const requestRef = useRef(null);
  useEffect(()=>()=>requestRef.current?.abort(),[]);
  function toggleTeacherFile(file) {
    const next = new Set(selectedFiles.map(item=>item.key));
    if (next.has(file.key)) next.delete(file.key);
    else {
      if (new Set([...selectedFiles.map(item=>item.materialId),file.materialId]).size > 8) {
        setMessage("선생님 자료는 최대 8개 과제의 첨부파일을 선택할 수 있습니다."); return;
      }
      next.add(file.key);
    }
    setTeacherSelection(next); setMessage("");
  }

  async function handleAnalyze({allowUnread=false,forceRead=false}={}) {
    if (requestRef.current || recordsLoading || recordsError) return;
    setMessage("");


    if (!academicProfile) {
      setMessage("선택과목 정보가 없습니다. 먼저 학년과 선택과목을 설정해 주세요.");
      return;
    }

    if (!selectedRecordIds.length && !selectedFiles.length) {
      setMessage("활동 기록이나 선생님 자료를 하나 이상 선택해 주세요.");
      return;
    }
    const selectedRecords=records.filter(record=>selectedIds.has(record.id));
    const requestInputs={records:selectedRecords,files:selectedFiles,subject,extraContext};
    setResultInputs({...requestInputs,documentTexts:[]});
    setAnalysis("");setExploration(null);setScope(null);setWarning("");setCurrentNote(null);setRestoredNote(false);
    const documents=analysisDocuments(selectedRecords,selectedFiles);
    const key=documents.map(file=>file.id).sort().join("|");
    // Start any needed Google authorization in the original button gesture.
    const canReuse=!forceRead && readyKey.current===key && readyDocuments && (allowUnread || (readyComplete.current && Date.now()-readyAt.current<600_000));
    const tokenPromise=documents.length && !canReuse ? getDriveAccessToken?.({interactive:false}) : null;
    if(!canReuse) setFileFailures([]);
    setIsAnalyzing(true);setFileProgress("");
    setWorkspace(true);

    const preparationStartedAt=Date.now();let phase="자료 준비";
    const controller = new AbortController(); requestRef.current = controller;
    const timeout=setTimeout(()=>{if(requestRef.current===controller){controller.abort();requestRef.current=null;setIsAnalyzing(false);setMessage(`${phase} 단계에서 2분을 넘겼습니다. 선택한 기록과 읽은 자료는 유지됩니다. 다시 시도해 주세요.`);}},120_000);

    try {
      let documentTexts=[];
      if(documents.length) {
        if(canReuse) documentTexts=readyDocuments;
        else {
          const token=await tokenPromise;
          if(!token) throw new Error("자료 본문을 읽으려면 Google 자료 계정을 연결해 주세요.");
          const read=await readAnalysisDocuments(documents,token,{signal:controller.signal,onProgress:setFileProgress});
          documentTexts=packDocumentTexts(read.documents);
          setReadyDocuments(documentTexts);readyKey.current=key;readyAt.current=Date.now();readyComplete.current=!read.failures.length;setFileFailures(read.failures);
          if(read.failures.length) {setWorkspace(false);setMessage("일부 자료의 본문을 읽지 못했습니다. 아래 파일별 안내를 확인하고 다시 읽거나, 읽은 자료로 분석할 수 있습니다.");return;}
        }
      } else setFileFailures([]);
      if(controller.signal.aborted) return;
      const documentReadMs=Date.now()-preparationStartedAt;phase="AI 응답";
      setFileProgress("");
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      if (sessionError || !sessionData?.session?.access_token) {
        setMessage("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      if (controller.signal.aborted) return;
      clearTimeout(timeout);
      const inputs={...requestInputs,documentTexts};
      setResultInputs(inputs);
      const data=await runAnalysisJob({extraContext,explorationSubject:subject,documentTexts:requestDocumentTexts(documentTexts,[subject,extraContext].join(" ")),selectedRecordIds,
        selectedTeacherFiles:selectedFiles.map(file=>({materialId:file.materialId,attachmentId:file.id})),budgetMs:Math.max(1000,Math.min(110000,120000-(Date.now()-preparationStartedAt)))},
        {signal:controller.signal,getToken:()=>getAnalysisAccessToken(supabase.auth)});
      if(controller.signal.aborted) return;
      setRestoredNote(false);setCurrentNote({id:data.noteId || crypto.randomUUID(),title:noteTitle(inputs),content:analysisNoteContent({analysis:data.analysis || "",exploration:data.exploration,inputs,scope:data.scope,warning:data.warning})});
      setResultInputs(inputs);
      setAnalysis(data.analysis || "분석 결과가 비어 있습니다.");
      setExploration(data.exploration || null);
      setScope(data.scope ? {...data.scope,timings:{...data.timings,documentReadMs}}:null);
      setWarning(data.warning || "");
    } catch (error) {
      if (error.name !== "AbortError") setMessage(error.message || "AI 분석 요청에 실패했습니다.");
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) { requestRef.current = null; setIsAnalyzing(false); }
    }
  }

  const selectedChoices = academicProfile?.selected_choices || {};

  const workspaceView=<AnalysisWorkspace noteId={currentNote?.id} readOnly={restoredNote} onResume={()=>{setSelection(new Set(currentNote.content.inputs.records.map(record=>record.id)));setTeacherSelection(new Set(currentNote.content.inputs.files.map(file=>file.key)));setSubject(currentNote.content.inputs.subject);setExtraContext(currentNote.content.inputs.extraContext);setWorkspace(false);setNotesView(false);setMessage("원본 자료를 확인하고 분석을 눌러 주세요. 새 결과는 별도 노트로 저장됩니다.");}} key={currentNote?.id || "pending"} explorationState={currentNote?.content.explorationState} onExplorationChange={changeExploration} analysis={analysis} loading={isAnalyzing} message={message} scope={scope} warning={warning}
    academicProfile={academicProfile} documentTexts={resultInputs?.documentTexts || []} initialSubject={resultInputs?.subject || ""} fileProgress={fileProgress} exploration={exploration} extraContext={resultInputs?.extraContext || ""}
    records={resultInputs?.records || []} files={resultInputs?.files || []}
    onBack={()=>{setWorkspace(false);setMessage("");}}
    onRetry={handleAnalyze} />;

  return (
    <>
    <div className="analysis-shell">
    <nav className="analysis-top-tabs" aria-label="활동 분석 메뉴"><button type="button" aria-pressed={!workspace && !notesView} onClick={()=>{setWorkspace(false);setNotesView(false);}}>자료 선택</button><button type="button" aria-pressed={notesView} onClick={()=>{setWorkspace(false);setNotesView(true);notebook.refresh();}}>활동 분석 노트 ({notebook.notes.length})</button></nav>
    {isAnalyzing && !workspace && <button type="button" className="student-back" onClick={()=>{setNotesView(false);setWorkspace(true);}}>분석 진행 중 · 진행 화면 보기</button>}
    {(notebook.status || notebook.error) && <div className="analysis-note-status" role="status">{notebook.error || notebook.status}{notebook.error && currentNote && <button type="button" onClick={()=>notebook.save(currentNote)}>저장 다시 시도</button>}</div>}
    {notesView && <AnalysisNotebook notes={notebook.notes} onDelete={deleteNote} busy={isAnalyzing} onOpen={openNote} opening={openingNote} onRefresh={notebook.refresh} error={notebook.error || message} />}
    <RetainedView active={workspace}>{workspaceView}</RetainedView>
    <section hidden={workspace || notesView} className="inner-page ai-analysis-panel" style={styles.page}>
      <PickerAccountBar open={active && isPickerOpen} email={driveAccountEmail} onSwitch={switchPickerAccount} onClose={closeGooglePicker} />
      <p style={styles.text}>자료를 읽고 교과와 연결할 주제를 고른 뒤, 같은 탐구를 이어가세요.</p>

      <SubjectFocus value={subject} onChange={setSubject} profile={academicProfile} records={records} disabled={isAnalyzing} />
      <details className="quiet-details" style={styles.subjectBox} open>
        <summary>분석할 활동 선택 <span className="field-optional">· {selectedRecordIds.length}개 선택</span></summary>
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
          {recordsLoading ? <p role="status">활동 기록을 불러오는 중이에요.</p>:recordsError ? <div role="alert"><p>활동 기록을 불러오지 못했어요. 다시 불러온 뒤 분석해 주세요.</p><button type="button" onClick={onReloadRecords}>활동 다시 불러오기</button></div>:records.length === 0 && <p style={styles.text}>저장된 활동 기록이 없습니다.</p>}
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
      </details>

      <details className="quiet-details" style={styles.subjectBox}>
        <summary>선생님 첨부파일 선택 <span className="field-optional">· {selectedFiles.length}개 선택</span></summary>
        <p style={styles.text}>선택한 첨부파일의 본문과 선생님 안내를 읽습니다. 스캔 이미지·지원하지 않는 형식·접근 제한은 파일별로 알려드립니다.</p>
        <div className="analysis-material-actions"><span>{selectedFiles.length}개 선택</span>
          <button type="button" disabled={isAnalyzing} onClick={()=>{const ids=new Set(teacherSharedFiles.slice(0,8).map(file=>file.id));setTeacherSelection(new Set(options.filter(file=>ids.has(file.materialId)).map(file=>file.key)));}}>전체 선택{teacherSharedFiles.length>8 ? " (최근 8개 과제)":""}</button>
          <button type="button" disabled={isAnalyzing || !selectedFiles.length} onClick={()=>setTeacherSelection(new Set())}>선택 해제</button></div>
        {!options.length && <p style={styles.text}>아직 전달받은 선생님 자료가 없습니다.</p>}
        <div className="analysis-material-list">{options.map(file=><div className={`analysis-material ${teacherSelection.has(file.key) ? "is-selected" : ""}`} key={file.key}>
          <label><input type="checkbox" checked={teacherSelection.has(file.key)} disabled={isAnalyzing} onChange={()=>toggleTeacherFile(file)} /><span><strong>{file.name}</strong><small>{file.title}</small></span></label>
          <details><summary>자료 안내 확인</summary><p>{file.description || "선생님이 작성한 안내가 없습니다."}</p>{/^https?:\/\//.test(file.url) && <a href={file.url} target="_blank" rel="noreferrer">파일 열기 ↗</a>}</details>
        </div>)}</div>
      </details>

      <details className="quiet-details analysis-reference">
        <summary>분석 참고 정보 · 선택과목 및 선생님 자료</summary>
        <button type="button" className="student-back" disabled={isAnalyzing} onClick={()=>handleAnalyze({forceRead:true})}>첨부 본문을 다시 읽고 분석</button>
      <div style={styles.noticeBox}>
        <h3 style={styles.infoTitle}>분석 방식</h3>
        <p style={styles.text}>
          직접 선택한 기록 최대 48개의 개요와, 학기·과목을 고려해 고른 최대
          20개의 본문을 참고합니다. 긴 본문은 앞부분과 끝부분을 발췌하며,
          첨부 본문은 읽은 범위와 발췌 여부를 결과에 표시합니다. 긴 자료는 전체에서 발췌하고 선택 과목·질문과 관련된 내용을 우선 참고합니다. 보충 입력도 함께 분석합니다.
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

      {message && <p role="alert" style={styles.message}>{message}</p>}
      {!!fileFailures.length && <div className="analysis-file-failures"><details open><summary>본문을 읽지 못한 자료 {fileFailures.length}개</summary>{fileFailures.map(file=><p key={file.id}><strong>{file.name}</strong><br />{file.message}</p>)}</details><button type="button" disabled={isAnalyzing} onClick={()=>handleAnalyze({allowUnread:true})}>읽은 자료로 분석하기</button><button type="button" disabled={isAnalyzing || isPickerLoading} onClick={()=>openGooglePicker()}>Google 선택창에서 읽기 권한 확인</button><p>선택창에서 위 파일을 다시 선택해 앱 접근을 허용하세요. 이 파일의 본문을 읽었다고 설명하지 않습니다. 다시 읽으려면 아래 분석 버튼을 눌러 주세요.</p></div>}
      {getDriveAccessToken && <button type="button" className="student-back" disabled={isAnalyzing} onClick={()=>{getDriveAccessToken().then(()=>setMessage("Google 자료 계정이 연결되었습니다. 분석을 시작해 주세요.")).catch(error=>setMessage(error.message));}}>Google 자료 계정 연결</button>}

      <button
        className="animated-button"
        type="button"
        onClick={handleAnalyze}
        disabled={isAnalyzing || recordsLoading || !!recordsError || (!selectedRecordIds.length && !selectedFiles.length)}
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

      {analysis && <button type="button" className="student-back" onClick={()=>setWorkspace(true)} style={{marginTop:16}}>이전 분석 결과 다시 보기 ↗</button>}
    </section>
    </div>
    </>
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

};

export default AiAnalysisPage;

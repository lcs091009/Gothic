import ExplorationLoading from "./ExplorationLoading";
import RetainedView from "./RetainedView";
import { useEffect, useRef, useState } from "react";
import { analysisSections } from "../lib/analysisSections";
import "./AnalysisWorkspace.css";
import ExplorationPage from "./ExplorationPage";

export default function AnalysisWorkspace({analysis,loading,message,scope,warning,records,files,onBack,onRetry,exploration,extraContext,academicProfile,documentTexts=[],initialSubject="",fileProgress=""}) {
  const [active,setActive]=useState(0);
  const [exploring,setExploring]=useState(false);
  const heading=useRef(null);
  useEffect(()=>{heading.current?.focus();},[]);
  useEffect(()=>{setActive(0);setExploring(false);},[analysis]);
  useEffect(()=>{heading.current?.focus();},[active,exploring]);
  const sections=analysisSections(analysis);
  const subjects=new Map();
  for(const record of records) { const name=record.subject || "과목 미입력";subjects.set(name,(subjects.get(name)||0)+1); }
  const explorationView=<ExplorationPage documentTexts={documentTexts} initialSubject={initialSubject} academicProfile={academicProfile} seed={exploration} records={records} files={files} extraContext={extraContext} onBack={()=>setExploring(false)} />;
  return <><RetainedView key={analysis} active={exploring}>{explorationView}</RetainedView><section hidden={exploring} className="analysis-workspace">
    <aside className="analysis-workspace-nav">
      <button type="button" onClick={onBack}>← 자료 선택</button>
      <p className="student-eyebrow">나의 탐구 연결</p><h2 ref={heading} tabIndex={-1}>분석 작업실</h2>
      <nav aria-label="분석 항목">{sections.map((section,index)=><button key={section.number} type="button" disabled={loading || !analysis}
        aria-pressed={active===index} onClick={()=>setActive(index)}><span>{String(section.number).padStart(2,"0")}</span>{section.title}</button>)}</nav>
      <button className="exploration-entry" type="button" disabled={loading || !analysis} onClick={()=>setExploring(true)}>과목별 심화탐구 →</button>
      <p className="workspace-caption">선택한 기록 {records.length}개<br />선생님 첨부 {files.length}개</p>
    </aside>
    <div className="analysis-workspace-main">
      <header><p className="student-eyebrow">기록에서 다음 탐구로</p><h3>{loading ? "활동의 연결을 분석하고 있어요" : analysis ? "나의 활동을 한눈에" : "분석을 완료하지 못했어요"}</h3></header>
      <div className="analysis-flow" aria-label="분석에 사용한 자료의 연결">
        {[{label:"활동 기록",value:`${records.length}개`},{label:"관련 과목",value:`${subjects.size}개`},{label:"선생님 첨부",value:`${files.length}개`},{label:"다음 탐구",value:analysis ? "제안 확인" : "분석 중"}].map(item=><div key={item.label}><small>{item.label}</small><strong>{item.value}</strong></div>)}
      </div>
      {loading && <ExplorationLoading title={fileProgress ? "첨부 자료의 본문을 읽고 있어요":"AI가 활동 분석과 탐구 주제를 작성하고 있어요"} description={fileProgress || "읽은 자료의 근거와 교과 개념을 연결합니다. 화면을 이동해도 요청은 유지됩니다."} onCancel={onBack} />}
      {message && <div className="analysis-workspace-error" role="alert"><p>{message}</p><button type="button" disabled={loading} onClick={onRetry}>다시 분석</button></div>}
      {warning && <p className="workspace-caption" role="status">{warning}</p>}
      {analysis && !loading && <article className="analysis-section" aria-live="polite"><div className="analysis-section-title"><span>{String(sections[active]?.number || 1).padStart(2,"0")}</span><h3>{sections[active]?.title}</h3></div>
        {(sections[active]?.lines || []).map((line,index)=><p key={index}>{line}</p>)}
        {!sections[active]?.lines.length && <p>이 항목의 설명이 반환되지 않았습니다. 다른 항목을 확인해 주세요.</p>}
        <div className="analysis-section-switch"><button type="button" disabled={active===0} onClick={()=>setActive(index=>index-1)}>← 이전</button><span>{active+1} / {sections.length}</span><button type="button" disabled={active>=sections.length-1} onClick={()=>setActive(index=>index+1)}>다음 →</button></div>
      </article>}
      <details className="analysis-evidence"><summary>분석 근거와 과목별 활동 보기</summary>
        <div className="analysis-subject-chart" aria-label="선택 활동의 과목별 개수">{[...subjects].map(([subject,count])=><div key={subject}><span>{subject}</span><div className="analysis-bar-track"><span style={{width:`${count/Math.max(1,records.length)*100}%`}} /></div><strong>{count}개</strong></div>)}</div>
        <ol className="analysis-record-timeline">{records.map(record=><li key={record.id}><small>{[record.grade,record.semester,record.subject].filter(Boolean).join(" · ")}</small><strong>{record.title || "제목 없음"}</strong><details><summary>기록 내용</summary><p>{record.content || "작성한 내용이 없습니다."}</p></details></li>)}</ol>
        {!!files.length && <div className="analysis-source-files"><h4>선택한 선생님 첨부</h4>{files.map(file=><p key={file.key}>{file.name} · {file.title}</p>)}<small>본문을 읽은 범위는 아래 자료 확인 내역에 표시합니다.</small></div>}
        {!!scope?.documentEvidence?.length && <div className="analysis-document-evidence"><h4>첨부 본문 확인 내역</h4>{scope.documentEvidence.map((file,index)=><p key={index}>{file.name} · {file.pages ? `${file.pages}쪽 텍스트 확인 · `:""}{file.partial ? "일부 발췌/읽지 못한 부분 있음":"추출한 텍스트 전체 반영"}{file.unreadPages>0 ? ` · 텍스트 없는 페이지 ${file.unreadPages}쪽`:""}</p>)}<small>이미지·그래프와 수식의 시각 정보는 텍스트로 추출된 부분만 참고합니다.</small></div>}
        {scope && <p className="workspace-caption">서버 분석 범위: 활동 개요 {scope.scannedRecords}개 · 본문 발췌 {scope.detailedRecords}개 · 선생님 자료 {scope.teacherMaterials}개</p>}
      </details>
    </div>
  </section></>;
}

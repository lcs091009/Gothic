import {runAnalysisJob,getAnalysisAccessToken} from "../lib/analysisJobs.js";
import {requestDocumentTexts} from "../lib/analysisDocumentExcerpt.js";
import ExplorationEmphasis from "./ExplorationEmphasis.js";
import SubjectConnection from "./SubjectConnection";
import SubjectFocus from "./SubjectFocus";
import ExplorationLoading from "./ExplorationLoading";
import {explorationContextPath} from "../lib/explorationPath";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabaseClient";
export default function ExplorationPage({seed,records,files,extraContext,onBack,academicProfile,documentTexts=[],initialSubject="",initialState,onChange,readOnly=false,noteId}) {
  const [subject,setSubject]=useState(initialState?.subject ?? initialSubject);
  const [steps,setSteps]=useState(initialState?.steps?.length ? initialState.steps:[{path:[],result:seed}]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[question,setQuestion]=useState("");
  const pending=useRef(null),heading=useRef(null),questionInput=useRef(null),questionBox=useRef(null);
  const [expanded,setExpanded]=useState([Math.max(0,(initialState?.steps?.length || 1)-1)]);
  const step=steps.at(-1);
  useEffect(()=>()=>pending.current?.abort(),[]);
  useEffect(()=>{if(steps.at(-1)?.result) onChange?.({subject,steps});},[steps,subject,onChange]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView?.({block:"nearest",behavior:"auto"});},[steps.length]);
  function chooseSubject(value) {
    if(pending.current || value===subject) return;
    setExpanded([0]);setSubject(value);setSteps([{path:[],result:value===initialSubject ? seed:null}]);setError("");setQuestion("");
  }
  async function generate(path,append,nextSubject=subject,connection=step.connection) {
    if(pending.current || readOnly) return;
    const controller=new AbortController();pending.current=controller;
    if(append) {setExpanded([steps.length]);setSteps(previous=>[...previous,{path,result:null,connection}]);}
    setLoading(true);setError("");setQuestion("");
    try {
      const {data,error:authError}=await supabase.auth.getSession();if(controller.signal.aborted) return;
      if(authError || !data.session?.access_token) throw new Error("다시 로그인한 뒤 탐구를 이어가 주세요.");
      const result=await runAnalysisJob({extraContext,documentTexts:requestDocumentTexts(documentTexts,[nextSubject,...explorationContextPath(path)].join(" ")),explorationSubject:nextSubject.trim(),selectedRecordIds:records.map(record=>record.id),selectedTeacherFiles:files.map(file=>({materialId:file.materialId,attachmentId:file.id})),explorationPath:explorationContextPath(path),...(noteId ? {noteId}:{})},
        {signal:controller.signal,getToken:()=>getAnalysisAccessToken(supabase.auth)});
      if(controller.signal.aborted) return;
      if(!result.exploration) throw new Error("탐구 안내를 받지 못했어요. 선택한 주제는 유지됩니다.");
      setSteps(previous=>previous.map((item,index)=>index===previous.length-1 ? {...item,result:result.exploration,warning:result.warning,timings:result.timings}:item));
    } catch(e) {if(!controller.signal.aborted) setError(e.name==="SyntaxError" ? "서비스 응답을 읽지 못했습니다. 선택한 주제는 유지됩니다. 다시 시도해 주세요.":e.message);}
    finally {if(pending.current===controller) {pending.current=null;setLoading(false);}}
  }
  function cancel() {
    pending.current?.abort();pending.current=null;setLoading(false);
    setError("화면 대기를 멈췄어요. 서버에 접수된 분석은 계속 진행되고 결과는 활동 분석 노트에 저장돼요.");
  }
  return <section className="exploration-workspace exploration-inline">
    <header className="exploration-inline-header"><div><p className="student-eyebrow">나의 탐구 가이드</p><h3>선택한 주제를 한 걸음씩</h3></div><button type="button" onClick={onBack}>← 분석 노트로</button></header>
    <p className="exploration-next-hint" role="status">{step.path.length ? "같은 주제로 이어가요. 궁금한 점이나 해 본 일을 아래에 적어 주세요.":"추천 주제 중 하나를 골라 보세요. 과목을 정하지 않아도 시작할 수 있어요."}</p>
    {steps.map((step,index)=>{const latest=index===steps.length-1,chosen=step.path.length>0;
      return <details className="exploration-step-card" key={index} open={expanded.includes(index)}>
        <summary ref={latest ? heading:null} onClick={event=>{event.preventDefault();setExpanded(previous=>previous.includes(index) ? previous.filter(value=>value!==index):[...previous,index]);}}>
          <span className="exploration-step-number">{index===0 ? "주제 선택":`탐구 ${index}`}</span><strong>{index===0 ? "자료에서 이어지는 주제":step.path.at(-1)}</strong><span className="exploration-fold">{expanded.includes(index) ? "접기 −":"펼치기 +"}</span>
        </summary>
        <div className="exploration-step-body">
          {chosen && <header><SubjectConnection sources={step.connection?.sources || []} subject={step.connection?.subject || subject} /><h4>{step.connection?.title || step.path[0]}</h4></header>}
      {latest && !readOnly && !chosen && <details className="quiet-details exploration-subject-option"><summary>과목 바꾸기 · {subject || "AI 추천"}</summary><SubjectFocus value={subject} onChange={chooseSubject} profile={academicProfile} records={records} disabled={loading} /></details>}
      {latest && loading && <ExplorationLoading onCancel={cancel} />}
      {latest && error && <div className="analysis-workspace-error" role="alert"><p>{error}</p><button type="button" onClick={()=>generate(step.path,false)}>다시 시도</button></div>}
      {step.result && <>
        <article className="analysis-section" aria-live="polite">{chosen ? <p className="exploration-key-point"><ExplorationEmphasis text={step.result.intro} /></p>:<details><summary>추천 근거 요약 보기</summary><p className="exploration-key-point"><ExplorationEmphasis text={step.result.intro} /></p></details>}</article>
        {!chosen && !!step.result.choices.length && <div className="exploration-choices">{step.result.choices.map(choice=><article className="exploration-choice-card" key={choice.question}>
          <SubjectConnection sources={choice.sources || []} subject={choice.subject || subject} /><h4>{choice.title}</h4>
          <details><summary>이 주제를 추천한 이유</summary><p>{choice.question}</p><p><ExplorationEmphasis text={choice.connection || choice.why || "자료와의 연결 근거를 확인해 주세요."} /></p></details>
          <button type="button" disabled={!latest || loading || readOnly} onClick={()=>{const next=choice.subject || subject;setSubject(next);generate([choice.question],true,next,{sources:choice.sources || [],subject:next,title:choice.title});}}>이 주제로 탐구하기 →</button>
        </article>)}</div>}
        {chosen && !!step.result.guidelines?.length && <div className="exploration-guidelines">{step.result.guidelines.map((item,index)=><article className="analysis-section" key={index}><h4>{item.title}</h4><p><ExplorationEmphasis text={item.detail} /></p></article>)}</div>}
        {latest && !readOnly && !chosen && !step.result.choices.length && <button type="button" className="exploration-entry" onClick={()=>generate([],false)}>자료에서 주제 추천받기</button>}
      </>}
      {latest && !readOnly && !loading && !error && !step.result && <div className="analysis-section"><p>{chosen ? "선택한 주제를 유지하며 현재 필요한 안내를 받을 수 있어요.":"자료의 구체적인 내용과 교과 개념을 연결해 주제를 추천합니다."}</p><button type="button" onClick={()=>generate(step.path,false)}>{chosen ? "탐구 가이드 받기":"자료에서 주제 추천받기"}</button></div>}
      {latest && !readOnly && !loading && chosen && !!step.result?.guidelines?.some(item=>item.question) && <details className="exploration-question-options"><summary>어떤 질문을 할지 막막하다면</summary><p>질문을 고른 뒤 내 상황에 맞게 바꿔도 좋아요.</p>{step.result.guidelines.filter(item=>item.question).map((item,index)=><button key={index} type="button" onClick={()=>{setQuestion(item.question);if(questionBox.current) questionBox.current.open=true;questionInput.current?.focus();}}>{item.question}</button>)}</details>}
      {latest && !readOnly && !loading && <details ref={questionBox} className="exploration-write" open={chosen}><summary>{chosen ? "질문하며 이어가기":"원하는 주제를 직접 쓰기"}</summary><form className="exploration-custom" onSubmit={e=>{e.preventDefault();if(question.trim()) generate([...step.path,question.trim()],true);}}>
        <label htmlFor="exploration-question">{chosen ? "내가 한 일이나 막힌 점을 알려 주세요":"원하는 주제를 직접 적어도 좋아요"}</label><textarea ref={questionInput} id="exploration-question" maxLength={400} rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder={chosen ? "예: 두 조건을 비교했는데 차이가 작았어요. 어떤 근거를 확인하면 좋을까요?":"예: 자료의 효소 내용을 생명과학과 연결해 탐구하고 싶어요."} /><button type="submit" disabled={!question.trim()}>이어서 탐구하기 →</button>
      </form></details>}
      {step.warning && <p role="status" className="workspace-caption">{step.warning}</p>}
        </div>
      </details>;
    })}
  </section>;
}

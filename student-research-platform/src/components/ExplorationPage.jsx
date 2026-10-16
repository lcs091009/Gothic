import {runAnalysisJob,getAnalysisAccessToken} from "../lib/analysisJobs.js";
import {requestDocumentTexts} from "../lib/analysisDocumentExcerpt.js";
import ExplorationEmphasis from "./ExplorationEmphasis.js";
import SubjectConnection from "./SubjectConnection";
import SubjectFocus from "./SubjectFocus";
import ExplorationLoading from "./ExplorationLoading";
import {explorationContextPath} from "../lib/explorationPath";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabaseClient";
const stages=[
  {label:"준비할 것",question:"이 주제를 진행하기 전에 내가 결정하거나 준비하면 좋은 것과 판단 기준을 안내해 줘."},
  {label:"진행 중 점검",question:"같은 주제를 탐구하는 과정에서 비교·검토하면 좋은 점과 판단 기준을 안내해 줘."},
  {label:"결과 해석",question:"이 주제의 결과를 해석할 때 확인할 근거와 한계를 안내해 줘. 실제 결과는 아직 제시하지 않았으니 만들지 마."},
  {label:"탐구 정리",question:"같은 주제의 탐구를 정리할 때 남기면 좋은 근거와 성찰 질문을 안내해 줘. 내가 수행하지 않은 사실은 만들지 마."}
];
export default function ExplorationPage({seed,records,files,extraContext,onBack,academicProfile,documentTexts=[],initialSubject="",initialState,onChange,readOnly=false,noteId}) {
  const [subject,setSubject]=useState(initialState?.subject ?? initialSubject);
  const [steps,setSteps]=useState(initialState?.steps?.length ? initialState.steps:[{path:[],result:seed}]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[question,setQuestion]=useState("");
  const pending=useRef(null),heading=useRef(null);
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
    <header className="exploration-inline-header"><div><p className="student-eyebrow">나의 탐구 가이드</p><h3>선택한 주제를 한 걸음씩</h3></div><button type="button" onClick={onBack}>카드 접기</button></header>
    <p className="workspace-caption">질문을 고르면 아래에 카드가 이어져요. 이전 카드는 눌러서 다시 볼 수 있어요.</p>
    {steps.map((step,index)=>{const latest=index===steps.length-1,chosen=step.path.length>0;
      return <details className="exploration-step-card" key={index} open={expanded.includes(index)}>
        <summary ref={latest ? heading:null} onClick={event=>{event.preventDefault();setExpanded(previous=>previous.includes(index) ? previous.filter(value=>value!==index):[...previous,index]);}}>
          <span className="exploration-step-number">{index===0 ? "주제 선택":`탐구 ${index}`}</span><strong>{index===0 ? "자료에서 이어지는 주제":step.path.at(-1)}</strong><span className="exploration-fold">{expanded.includes(index) ? "접기 −":"펼치기 +"}</span>
        </summary>
        <div className="exploration-step-body">
          {chosen && <header><SubjectConnection sources={step.connection?.sources || []} subject={step.connection?.subject || subject} /><h4>{step.connection?.title || step.path[0]}</h4></header>}
      {latest && !readOnly && !chosen && <SubjectFocus value={subject} onChange={chooseSubject} profile={academicProfile} records={records} disabled={loading} />}
      {latest && loading && <ExplorationLoading onCancel={cancel} />}
      {latest && error && <div className="analysis-workspace-error" role="alert"><p>{error}</p><button type="button" onClick={()=>generate(step.path,false)}>다시 시도</button></div>}
      {step.result && <>
        <article className="analysis-section" aria-live="polite"><p className="exploration-key-point"><ExplorationEmphasis text={step.result.intro} /></p></article>
        {!chosen && !!step.result.choices.length && <><h4>자료에서 이어지는 주제</h4><div className="exploration-choices">{step.result.choices.map(choice=><button type="button" key={choice.question} disabled={!latest || loading || readOnly} onClick={()=>{const next=choice.subject || subject;setSubject(next);generate([choice.question],true,next,{sources:choice.sources || [],subject:next,title:choice.title});}}>
          <SubjectConnection sources={choice.sources || []} subject={choice.subject || subject} /><strong>{choice.title}</strong><span className="exploration-question">{choice.question}</span>
          {(choice.connection || choice.why) && <span><b>자료와 연결되는 이유</b> · {choice.connection || choice.why}</span>}<em>이 주제로 탐구하기 →</em>
        </button>)}</div></>}
        {chosen && !!step.result.guidelines?.length && <div className="exploration-guidelines">{step.result.guidelines.map((item,index)=><article className="analysis-section" key={index}><h4>{item.title}</h4><p><ExplorationEmphasis text={item.detail} /></p>{latest && !readOnly && item.question && <button disabled={loading} type="button" onClick={()=>generate([...step.path,item.question],true)}>{item.question} →</button>}</article>)}</div>}
        {latest && !readOnly && !chosen && !step.result.choices.length && <button type="button" className="exploration-entry" onClick={()=>generate([],false)}>자료에서 주제 추천받기</button>}
      </>}
      {latest && !readOnly && !loading && !error && !step.result && <div className="analysis-section"><p>{chosen ? "선택한 주제를 유지하며 현재 필요한 안내를 받을 수 있어요.":"자료의 구체적인 내용과 교과 개념을 연결해 주제를 추천합니다."}</p><button type="button" onClick={()=>generate(step.path,false)}>{chosen ? "탐구 가이드 받기":"자료에서 주제 추천받기"}</button></div>}
      {latest && !readOnly && !loading && chosen && <div className="exploration-stage-options" role="group" aria-label="같은 주제의 탐구 단계">{stages.map(stage=><button type="button" key={stage.label} onClick={()=>generate([...step.path,stage.question],true)}>{stage.label} →</button>)}</div>}
      {latest && !readOnly && !loading && <form className="exploration-custom" onSubmit={e=>{e.preventDefault();if(question.trim()) generate([...step.path,question.trim()],true);}}>
        <label htmlFor="exploration-question">{chosen ? "내가 한 일이나 막힌 점을 알려 주세요":"원하는 주제를 직접 적어도 좋아요"}</label><textarea id="exploration-question" maxLength={400} rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder={chosen ? "예: 두 조건을 비교했는데 차이가 작았어요. 어떤 근거를 확인하면 좋을까요?":"예: 자료의 효소 내용을 생명과학과 연결해 탐구하고 싶어요."} /><button type="submit" disabled={!question.trim()}>이어서 안내받기 →</button>
      </form>}
      {step.timings && <p className="workspace-caption">AI 응답 {(step.timings.providerMs/1000).toFixed(1)}초</p>}
      {step.warning && <p role="status" className="workspace-caption">{step.warning}</p>}
      <p className="workspace-caption">AI는 판단 기준과 선택 가능한 안내를 제공합니다. 탐구의 조건과 결정은 내가 정합니다. 첨부의 발췌 여부는 분석 결과의 자료 확인 내역에서 볼 수 있어요.</p>
        </div>
      </details>;
    })}
  </section>;
}

import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabaseClient";

export default function ExplorationPage({seed,records,files,extraContext,onBack}) {
  const [steps,setSteps]=useState([{path:[],result:seed}]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [question,setQuestion]=useState("");
  const pending=useRef(null),heading=useRef(null);
  const step=steps[steps.length-1];
  useEffect(()=>()=>pending.current?.abort(),[]);
  useEffect(()=>{heading.current?.focus();window.scrollTo?.({top:0,behavior:"auto"});},[steps.length]);
  async function generate(path,append) {
    if(pending.current) return;
    const controller=new AbortController();pending.current=controller;
    if(append) setSteps(previous=>[...previous,{path,result:null}]);
    setLoading(true);setError("");setQuestion("");
    try {
      const {data,error:authError}=await supabase.auth.getSession();
      if(controller.signal.aborted) return;
      if(authError || !data.session?.access_token) throw new Error("다시 로그인한 뒤 질문을 이어가 주세요.");
      const response=await fetch("/api/analyze",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session.access_token}`},
        body:JSON.stringify({extraContext,selectedRecordIds:records.map(r=>r.id),selectedTeacherFiles:files.map(f=>({materialId:f.materialId,attachmentId:f.id})),explorationPath:path.slice(-12)})});
      const dataResult=await response.json();
      if(controller.signal.aborted) return;
      if(!response.ok || !dataResult.exploration) throw new Error(dataResult.error || "심화 질문을 받지 못했습니다. 다시 시도해 주세요.");
      setSteps(previous=>previous.map((item,index)=>index===previous.length-1 ? {...item,result:dataResult.exploration,warning:dataResult.warning}:item));
    } catch(e) {if(!controller.signal.aborted) setError(e.name==="SyntaxError" ? "분석 서비스에 연결하지 못했습니다. 다시 시도해 주세요.":e.message);}
    finally {if(pending.current===controller) {pending.current=null;setLoading(false);}}
  }
  function back() {
    pending.current?.abort();pending.current=null;setLoading(false);setError("");setQuestion("");
    if(steps.length>1) setSteps(previous=>previous.slice(0,-1));else onBack();
  }
  return <section className="analysis-workspace exploration-workspace">
    <aside className="analysis-workspace-nav"><button type="button" onClick={back}>← {steps.length>1 ? "이전 질문":"분석 결과"}</button>
      <p className="student-eyebrow">직접 고르는 탐구 방향</p><h2>탐구 이어가기</h2><p className="workspace-caption">{step.path.length ? `${step.path.length}번째 심화 질문` : "주제 선택"}</p>
      <details><summary>선택 경로 보기</summary><ol>{step.path.map((item,index)=><li key={index}>{item}</li>)}</ol></details>
    </aside>
    <div className="analysis-workspace-main"><header><p className="student-eyebrow">{step.path.length ? "선택한 주제에서 한 단계 더":"관심에 맞는 주제를 골라 주세요"}</p><h3 ref={heading} tabIndex={-1}>{step.path.at(-1) || "어떤 방향으로 탐구할까요?"}</h3></header>
      {loading && <div className="analysis-loading" role="status"><span className="mini-spinner" />선택한 질문을 바탕으로 다음 방향을 만들고 있어요.</div>}
      {error && <div className="analysis-workspace-error" role="alert"><p>{error}</p><button type="button" onClick={()=>generate(step.path,false)}>다시 시도</button></div>}
      {!loading && step.result && <><article className="analysis-section"><p>{step.result.intro}</p></article>
        <h4>다음으로 살펴볼 질문</h4><div className="exploration-choices">{step.result.choices.map(choice=><button type="button" key={choice.question} onClick={()=>generate([...step.path,choice.question],true)}><small>선택 가능한 방향</small><strong>{choice.title}</strong><span className="exploration-question">{choice.question}</span><span>{choice.why}</span><span><b>탐구 방법</b> · {choice.method}</span><em>이 질문으로 심화하기 →</em></button>)}</div></>}
      {!loading && !error && !step.result && <div className="analysis-section"><p>현재 기록과 선택한 자료에서 탐구 방향을 새로 제안받을 수 있어요.</p><button type="button" onClick={()=>generate(step.path,false)}>주제 선택지 만들기</button></div>}
      {!loading && <form className="exploration-custom" onSubmit={e=>{e.preventDefault();if(question.trim()) generate([...step.path,question.trim()],true);}}><label htmlFor="exploration-question">원하는 질문을 직접 적어도 좋아요</label><textarea id="exploration-question" maxLength={400} rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="다른 비교 대상이나 탐구 방법이 궁금하다면 적어 주세요." /><button type="submit" disabled={!question.trim()}>내 질문으로 이어가기 →</button></form>}
      {step.warning && <p role="status" className="workspace-caption">{step.warning}</p>}
      <p className="workspace-caption">각 선택은 새 화면으로 이어집니다. 이전 질문으로 돌아가 다른 방향을 선택할 수 있어요. 질문 생성에는 기존 AI 요청 한도가 적용되며 최근 12단계의 선택을 참고합니다. 제안은 수행 결과가 아닙니다.</p>
    </div>
  </section>;
}

import {explorationSubjects} from "../lib/explorationSubjects";
import ExplorationLoading from "./ExplorationLoading";
import {explorationContextPath} from "../lib/explorationPath";
import {useEffect,useRef,useState} from "react";
import {supabase} from "../lib/supabaseClient";

export default function ExplorationPage({seed,records,files,extraContext,onBack,academicProfile}) {
  const [subject,setSubject]=useState("");
  const [customSubject,setCustomSubject]=useState("");
  const subjects=explorationSubjects(academicProfile,records);
  const [steps,setSteps]=useState([{path:[],result:seed}]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [question,setQuestion]=useState("");
  const pending=useRef(null),heading=useRef(null);
  const step=steps[steps.length-1];
  useEffect(()=>()=>pending.current?.abort(),[]);
  useEffect(()=>{heading.current?.focus();window.scrollTo?.({top:0,behavior:"auto"});},[steps.length]);
  function chooseSubject(value) {
    if(pending.current || value===subject) return;
    setSubject(value);setSteps([{path:[],result:value ? null:seed}]);setError("");setQuestion("");
  }
  async function generate(path,append) {
    if(pending.current) return;
    const controller=new AbortController();pending.current=controller;
    if(append) setSteps(previous=>[...previous,{path,result:null}]);
    setLoading(true);setError("");setQuestion("");
    const timeout=setTimeout(()=>{if(pending.current===controller){controller.abort();pending.current=null;setLoading(false);setError("2분 이내에 심화 질문을 받지 못했습니다. 선택 경로는 유지됩니다. 다시 시도해 주세요.");}},120_000);
    try {
      const {data,error:authError}=await supabase.auth.getSession();
      if(controller.signal.aborted) return;
      if(authError || !data.session?.access_token) throw new Error("다시 로그인한 뒤 질문을 이어가 주세요.");
      const response=await fetch("/api/analyze",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session.access_token}`},
        body:JSON.stringify({extraContext,explorationSubject:subject,selectedRecordIds:records.map(r=>r.id),selectedTeacherFiles:files.map(f=>({materialId:f.materialId,attachmentId:f.id})),explorationPath:explorationContextPath(path)})});
      const dataResult=await response.json();
      if(controller.signal.aborted) return;
      if(!response.ok || !dataResult.exploration) throw new Error(dataResult.error || "심화 질문을 받지 못했습니다. 다시 시도해 주세요.");
      setSteps(previous=>previous.map((item,index)=>index===previous.length-1 ? {...item,result:dataResult.exploration,warning:dataResult.warning}:item));
    } catch(e) {if(!controller.signal.aborted) setError(e.name==="SyntaxError" ? "분석 서비스에 연결하지 못했습니다. 다시 시도해 주세요.":e.message);}
    finally {clearTimeout(timeout);if(pending.current===controller) {pending.current=null;setLoading(false);}}
  }
  function back() {
    pending.current?.abort();pending.current=null;setLoading(false);setError("");setQuestion("");
    if(steps.length>1) setSteps(previous=>previous.slice(0,-1));else onBack();
  }
  return <section className="analysis-workspace exploration-workspace">
    <aside className="analysis-workspace-nav"><button type="button" onClick={back}>← {steps.length>1 ? "이전 선택":"분석 결과"}</button>
      <p className="student-eyebrow">{subject || "여러 과목 연결"}</p><h2>주제 이해 도우미</h2><p className="workspace-caption">{step.path.length ? `${step.path.length}번째 연결 살펴보기` : "주제 선택"}</p>
      <details><summary>선택 경로 보기</summary><ol>{step.path.map((item,index)=><li key={index}>{item}</li>)}</ol></details>
    </aside>
    <div className="analysis-workspace-main"><header><p className="student-eyebrow">{step.path.length ? "나의 활동과 선택을 주제에 연결하기":"관심에 맞는 주제를 골라 주세요"}</p><h3 ref={heading} tabIndex={-1}>{step.path[0] || "어떤 주제를 깊이 이해할까요?"}</h3></header>
      <details className="exploration-subject-picker" open={!step.path.length}>
        <summary>심화탐구 과목 <strong>{subject || "여러 과목 연결"}</strong>{step.path.length>0 && <small> · 변경하면 새 주제를 선택합니다</small>}</summary>
        <div className="exploration-subject-options" role="group" aria-label="심화탐구 과목 선택">
          {["",...subjects].map(name=><button type="button" key={name} aria-pressed={subject===name} disabled={loading} onClick={()=>chooseSubject(name)}>{name || "여러 과목 연결"}</button>)}
        </div>
        <form className="exploration-subject-custom" onSubmit={e=>{e.preventDefault();if(customSubject.trim()) chooseSubject(customSubject.trim());}}>
          <label htmlFor="exploration-subject">다른 과목</label><input id="exploration-subject" value={customSubject} onChange={e=>setCustomSubject(e.target.value)} maxLength={80} disabled={loading} placeholder="예: 미적분, 생명과학Ⅱ" /><button type="submit" disabled={loading || !customSubject.trim()}>선택</button>
        </form>
        <p className="workspace-caption">과목을 선택하면 해당 교과 개념과 내 활동의 연결을 중심으로 주제를 제안합니다. 과목을 바꾸면 현재 탐구 경로가 초기화됩니다.</p>
      </details>
      {step.path.length>1 && <p className="workspace-caption">지금 선택한 관점: {step.path.at(-1)}</p>}
      {loading && <ExplorationLoading onCancel={back} />}
      {error && <div className="analysis-workspace-error" role="alert"><p>{error}</p><button type="button" onClick={()=>generate(step.path,false)}>다시 시도</button></div>}
      {!loading && step.result && <><article className="analysis-section" aria-live="polite"><p>{step.result.intro}</p></article>
        {!!step.result.choices.length && <h4>{step.path.length ? "이 주제의 연결을 더 이해하기":"내 활동과 이어지는 주제"}</h4>}<div className="exploration-choices">{step.result.choices.map(choice=><button type="button" key={choice.question} onClick={()=>generate([...step.path,choice.question],true)}><small>{step.path.length ? "이 주제 안에서 살펴볼 관점":"활동에서 이어지는 주제"}</small><strong>{choice.title}</strong><span className="exploration-question">{choice.question}</span>{(choice.connection || choice.why) && <span><b>나의 선택과 연결되는 이유</b> · {choice.connection || choice.why}</span>}<em>이 연결을 깊이 이해하기 →</em></button>)}</div></>}
      {!loading && !error && !step.result && <div className="analysis-section"><p>{subject ? `${subject}의 개념과 내 활동을 연결하는 주제를 살펴볼 수 있어요.` : "현재 활동과 선택이 어떤 주제로 이어지는지 살펴볼 수 있어요."}</p><button type="button" onClick={()=>generate(step.path,false)}>{subject ? `${subject} 주제 제안받기` : "주제 선택지 만들기"}</button></div>}
      {!loading && <form className="exploration-custom" onSubmit={e=>{e.preventDefault();if(question.trim()) generate([...step.path,question.trim()],true);}}><label htmlFor="exploration-question">{step.path.length ? "이 주제와 나의 선택에서 궁금한 점":"깊이 이해하고 싶은 주제를 직접 적어도 좋아요"}</label><textarea id="exploration-question" maxLength={400} rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="내 활동의 어떤 부분과 연결되는지, 내가 고른 관점이 왜 의미 있는지 물어보세요." /><button type="submit" disabled={!question.trim()}>도우미에게 물어보기 →</button></form>}
      {step.warning && <p role="status" className="workspace-caption">{step.warning}</p>}
      <p className="workspace-caption">처음 고른 주제를 유지하며 선택한 관점과 활동의 연결을 살펴봅니다. 이전 선택으로 돌아갈 수 있어요. AI 요청 한도가 적용되며 중심 주제와 최근 선택을 함께 참고합니다. 설명은 수행 결과가 아닙니다.</p>
    </div>
  </section>;
}

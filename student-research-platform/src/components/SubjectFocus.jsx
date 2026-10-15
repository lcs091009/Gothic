import {useState} from "react";
import {explorationSubjects} from "../lib/explorationSubjects";
export default function SubjectFocus({value,onChange,profile,records,disabled=false}) {
  const [manual,setManual]=useState(Boolean(value));
  const subjects=explorationSubjects(profile,records);
  const custom=value && !subjects.includes(value);
  const [typing,setTyping]=useState(Boolean(custom));
  return <div className="subject-focus">
    <div className="subject-focus-mode" role="group" aria-label="탐구 과목 선택 방식">
      <button type="button" disabled={disabled} aria-pressed={!manual} onClick={()=>{setManual(false);setTyping(false);onChange("");}}>AI가 과목 추천</button>
      <button type="button" disabled={disabled} aria-pressed={manual} onClick={()=>setManual(true)}>과목 직접 선택</button>
    </div>
    {manual && <div className="subject-focus-field"><label htmlFor="subject-focus-select">탐구 과목</label>
      <select id="subject-focus-select" disabled={disabled} value={typing || custom ? "__custom__":value} onChange={event=>{setTyping(event.target.value==="__custom__");onChange(event.target.value==="__custom__" ? "":event.target.value);}}>
        <option value="">과목을 골라 주세요</option>{subjects.map(subject=><option key={subject} value={subject}>{subject}</option>)}<option value="__custom__">다른 과목 입력</option>
      </select>{(typing || custom) && <input aria-label="다른 탐구 과목 이름" disabled={disabled} maxLength={80} value={value} onChange={event=>onChange(event.target.value)} placeholder="예: 미적분, 생명과학Ⅱ" />}
    </div>}
    <p className="workspace-caption">{manual ? "고른 과목의 개념과 자료를 연결합니다." : "자료에서 연결 근거를 찾아 어울리는 과목과 주제를 함께 추천합니다."}</p>
  </div>;
}

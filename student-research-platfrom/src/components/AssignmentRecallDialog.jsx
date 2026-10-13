import {useEffect,useRef,useState} from "react";
import StudentPlacementCards from "./StudentPlacementCards";
import {fetchRecipientProfiles} from "../services/teacherAssignments";
import "./StudentDirectory.css";

export default function AssignmentRecallDialog({group,busy,error,onClose,onRecall}) {
  const dialog=useRef(null);
  const [filters,setFilters]=useState({grade:"",classNumber:"",number:""}),[selection,setSelection]=useState(new Set());
  const [profiles,setProfiles]=useState([]),[loading,setLoading]=useState(true),[lookupError,setLookupError]=useState("");
  useEffect(()=>{dialog.current.showModal();let active=true;
    fetchRecipientProfiles(group.recipients.map(r=>r.email)).then(data=>{if(active)setProfiles(data);}).catch(()=>{if(active)setLookupError("학년·반·번호를 불러오지 못했습니다. 받는 계정 목록으로 회수하거나 다시 열어 주세요.");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[group]);
  const byEmail=new Map(profiles.map(p=>[p.email,p]));
  const recipients=group.recipients.map(r=>({...r,profile:byEmail.get(r.email)}));
  const visible=recipients.filter(r=>[["grade","directory_grade"],["classNumber","directory_class"],["number","directory_number"]].every(([key,column])=>!filters[key] || String(r.profile?.[column])===filters[key]));
  const toggle=id=>setSelection(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});
  return <dialog ref={dialog} className="student-detail-dialog assignment-recall-dialog" aria-labelledby="recall-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
    <header className="directory-heading"><div><h3 id="recall-title">과제 회수 · {group.file_name}</h3><p>받는 학생을 선택하세요. 모두 회수하면 전달 내역에서도 과제가 자동 삭제됩니다.</p></div><button type="button" disabled={busy} onClick={onClose}>닫기</button></header>
    <StudentPlacementCards filters={filters} onChange={setFilters} disabled={busy || loading} />
    {loading && <p role="status">받는 학생 정보를 불러오는 중입니다.</p>}{lookupError && <p role="status">{lookupError}</p>}
    <div className="recipient-selection-footer"><button type="button" disabled={busy || !visible.length} onClick={()=>setSelection(previous=>new Set([...previous,...visible.map(r=>r.id)]))}>현재 목록 모두 선택 · {visible.length}명</button><button type="button" disabled={busy} onClick={()=>setSelection(new Set())}>선택 해제</button></div>
    <div className="recipient-list">{visible.map(r=><label className={`recipient-row ${selection.has(r.id) ? "is-selected":""}`} key={r.id}><input type="checkbox" disabled={busy} checked={selection.has(r.id)} onChange={()=>toggle(r.id)} /><strong>{r.profile?.name || r.number || "학생"}</strong><span>{r.profile?.directory_grade ? `${r.profile.directory_grade}학년 ${r.profile.directory_class}반 ${r.profile.directory_number}번` : r.email}</span></label>)}</div>
    {!visible.length && !loading && <p>이 조건에 맞는 받는 학생이 없습니다.</p>}
    <p className="workspace-caption">학생 화면의 과제와 전달 기록을 삭제합니다. 이미 공유한 Google Drive 파일의 열람 권한은 유지됩니다.</p>
    {error && <p role="alert">{error}</p>}
    <footer className="recipient-selection-footer"><button type="button" disabled={busy || !selection.size} onClick={()=>onRecall([...selection])}>{busy ? "회수 중…":`선택한 ${selection.size}명 회수`}</button><button type="button" disabled={busy} onClick={()=>onRecall(group.recipients.map(r=>r.id))}>모두 회수하고 과제 삭제</button></footer>
  </dialog>;
}

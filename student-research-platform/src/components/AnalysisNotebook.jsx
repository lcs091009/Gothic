import {useState} from "react";
export default function AnalysisNotebook({notes,onOpen,onRefresh,onDelete,error,opening,busy=false}) {
  const [confirmId,setConfirmId]=useState(null),[deleting,setDeleting]=useState(null);
  async function remove(id) {
    if(deleting) return;setDeleting(id);
    try {if(await onDelete(id)) setConfirmId(null);} finally {setDeleting(null);}
  }
  return <section className="analysis-notebook"><header><div><p className="student-eyebrow">내 계정에 보관한 기록</p><h3>활동 분석 노트</h3></div><button type="button" disabled={!!deleting} onClick={onRefresh}>새로고침</button></header>
    <p>노트를 눌러 분석과 이어진 탐구를 확인하세요.</p>
    {error && <p role="alert">{error}</p>}
    {!notes.length && <p>아직 저장한 노트가 없어요. 자료를 분석하면 자동으로 저장됩니다.</p>}
    <div className="analysis-note-list">{notes.map(note=><article className="analysis-note-card" key={note.id}>
      <button type="button" className="analysis-note-open" disabled={opening || !!deleting} onClick={()=>onOpen(note.id)}><strong>{note.title}</strong><small>{new Date(note.updated_at).toLocaleString("ko-KR")} · 열기 →</small></button>
      {onDelete && (confirmId===note.id ? <div className="analysis-note-confirm" role="group" aria-label={`${note.title} 삭제 확인`}><p>이 분석과 심화탐구 기록을 삭제할까요? 되돌릴 수 없어요.</p><div><button type="button" disabled={!!deleting} onClick={()=>setConfirmId(null)}>취소</button><button type="button" className="note-delete" disabled={!!deleting || busy} onClick={()=>remove(note.id)}>{deleting===note.id ? "삭제 중…":"삭제하기"}</button></div></div>:<button type="button" className="note-delete" disabled={opening || busy || !!deleting} aria-label={`${note.title} 삭제`} onClick={()=>setConfirmId(note.id)}>삭제</button>)}
    </article>)}</div>
    <p className="workspace-caption">최근 100개를 표시합니다.</p>
  </section>;
}

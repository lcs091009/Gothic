export default function AnalysisNotebook({notes,onOpen,onRefresh,error,opening}) {
  return <section className="analysis-notebook"><header><div><p className="student-eyebrow">내 계정에 보관한 기록</p><h3>활동 분석 노트</h3></div><button type="button" onClick={onRefresh}>새로고침</button></header>
    <p>분석 결과와 이어서 살펴본 탐구 카드를 다시 볼 수 있어요.</p>
    {error && <p role="alert">{error}</p>}
    {!notes.length && <p>아직 저장한 노트가 없어요. 자료를 분석하면 자동으로 저장됩니다.</p>}
    <div className="analysis-note-list">{notes.map(note=><button type="button" key={note.id} disabled={opening} onClick={()=>onOpen(note.id)}><strong>{note.title}</strong><small>{new Date(note.updated_at).toLocaleString("ko-KR")} · 열기 →</small></button>)}</div>
    <p className="workspace-caption">최근 100개를 표시합니다. 첨부 본문과 Google 연결 토큰은 노트에 저장하지 않아요.</p>
  </section>;
}

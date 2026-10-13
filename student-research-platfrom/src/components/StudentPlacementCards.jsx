export default function StudentPlacementCards({filters,onChange,disabled=false}) {
  return <div className="placement-cards">{[["grade","학년",3],["classNumber","반",10],["number","번호",35]].map(([key,label,max])=><details className="placement-card" key={key} open={key==="grade"}>
    <summary>{label} <span>{filters[key] ? `${filters[key]}${key==="number" ? "번":label}` : "전체"}</span></summary>
    <div className="placement-options"><button type="button" disabled={disabled} aria-pressed={!filters[key]} onClick={()=>onChange({...filters,[key]:""})}>전체</button>{Array.from({length:max},(_,i)=>String(i+1)).map(value=><button type="button" key={value} disabled={disabled} aria-pressed={String(filters[key])===value} onClick={()=>onChange({...filters,[key]:value})}>{value}{key==="number" ? "번":label}</button>)}</div>
  </details>)}</div>;
}

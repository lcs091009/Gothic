import {useEffect,useState} from "react";

export default function ExplorationLoading({onCancel,title="AI가 선택한 주제의 탐구 안내를 작성하고 있어요",cancelLabel="화면 대기 그만하기",description="읽은 자료와 내 선택을 바탕으로 지금 필요한 안내를 정리합니다."}) {
  const [started]=useState(()=>Date.now());
  const [seconds,setSeconds]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer);},[started]);
  return <div className="analysis-loading exploration-loading" aria-busy="true">
    <div className="exploration-loading-heading" role="status"><span className="mini-spinner" aria-hidden="true" /><strong>{title}</strong></div>
    <p>{description}</p>
    <div className="analysis-skeleton" aria-hidden="true" /><div className="analysis-skeleton" aria-hidden="true" /><div className="analysis-skeleton short" aria-hidden="true" />
    <div className="exploration-loading-footer"><span aria-hidden="true">{seconds}초 경과 · 최대 2분 대기</span><button type="button" onClick={onCancel}>{cancelLabel}</button></div>
  </div>;
}

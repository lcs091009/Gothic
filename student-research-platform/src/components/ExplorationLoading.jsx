import {useEffect,useState} from "react";

export default function ExplorationLoading({onCancel}) {
  const [started]=useState(()=>Date.now());
  const [seconds,setSeconds]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer);},[started]);
  return <div className="analysis-loading exploration-loading" aria-busy="true">
    <div className="exploration-loading-heading" role="status"><span className="mini-spinner" aria-hidden="true" /><strong>AI가 주제와 나의 선택을 연결해 설명을 작성하고 있어요</strong></div>
    <p>선택한 활동과 관점의 연관성을 정리하는 중입니다. 결과가 도착하면 이 화면에 표시됩니다.</p>
    <div className="analysis-skeleton" aria-hidden="true" /><div className="analysis-skeleton" aria-hidden="true" /><div className="analysis-skeleton short" aria-hidden="true" />
    <div className="exploration-loading-footer"><span aria-hidden="true">{seconds}초 경과 · 최대 2분 대기</span><button type="button" onClick={onCancel}>취소하고 이전 선택으로</button></div>
  </div>;
}

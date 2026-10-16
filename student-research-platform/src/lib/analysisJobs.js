export async function getAnalysisAccessToken(auth) {
  let {data,error}=await auth.getSession();
  if(error || !data.session) return "";
  if(data.session.expires_at && data.session.expires_at*1000<Date.now()+180000) {
    const refreshed=await auth.refreshSession();if(refreshed.error) return "";data=refreshed.data;
  }
  return data.session?.access_token || "";
}
function pause(milliseconds,signal) {
  return new Promise((resolve,reject)=>{
    const finish=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);globalThis.document?.removeEventListener("visibilitychange",visible);resolve();};
    const abort=()=>{clearTimeout(timer);globalThis.document?.removeEventListener("visibilitychange",visible);reject(new DOMException("Stopped waiting","AbortError"));};
    const visible=()=>{if(document.visibilityState==="visible") finish();};
    const timer=setTimeout(finish,milliseconds);signal?.addEventListener("abort",abort,{once:true});globalThis.document?.addEventListener("visibilitychange",visible);
    if(signal?.aborted) abort();
  });
}
export async function runAnalysisJob(body,{getToken,signal,fetchImpl=fetch,onAccepted=()=>{},sleep=pause,pollInterval=2000,now=Date.now}={}) {
  const jobId=crypto.randomUUID();
  const call=async(url,options={})=>{
    signal?.throwIfAborted();const token=await getToken();if(!token) throw new Error("로그인이 필요해요.");
    const response=await fetchImpl(url,{...options,signal,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`}});
    let data;try {data=await response.json();}catch {throw new Error("분석 진행 상태를 읽지 못했어요. 활동 분석 노트에서 결과를 확인해 주세요.");}
    if(!response.ok) throw new Error(data.error || "분석 요청을 확인하지 못했어요.");return data;
  };
  const start=await call("/api/analysis-jobs",{method:"POST",body:JSON.stringify({...body,jobId})});
  if(!start.jobId) throw new Error("분석 요청 번호를 받지 못했어요.");
  onAccepted(start.jobId);const startedAt=now();
  while(true) {
    const job=await call(`/api/analysis-jobs?id=${encodeURIComponent(start.jobId)}`);
    // Always check persisted completion before elapsed time: a suspended tab
    // may return after the server has already saved a successful result.
    if(job.status==="completed" && job.result) return job.result;
    if(job.status==="failed") throw new Error(job.error || "분석을 완료하지 못했어요. 노트를 확인해 주세요.");
    if(now()-startedAt>140000) throw new Error("분석 상태 확인이 지연되고 있어요. 활동 분석 노트에서 결과를 확인해 주세요.");
    await sleep(globalThis.document?.visibilityState==="hidden" ? 10000:pollInterval,signal);
  }
}

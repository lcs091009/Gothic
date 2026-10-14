export const ANALYSIS_TIMEOUT_MS=115_000;
export function withinAnalysisDeadline(operation,signal) {
  if(signal.aborted) return Promise.reject(new DOMException("Analysis deadline exceeded","AbortError"));
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new DOMException("Analysis deadline exceeded","AbortError"));
    signal.addEventListener("abort",abort,{once:true});
    Promise.resolve().then(()=>{if(signal.aborted)throw new DOMException("Analysis deadline exceeded","AbortError");return operation();}).then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));
  });
}

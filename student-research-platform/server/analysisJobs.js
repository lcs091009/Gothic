import {createClient} from "@supabase/supabase-js";
import {createAnalyzeHandler,MAX_BODY_BYTES} from "../api/analyze.js";
import {analysisNoteContent,noteTitle} from "../src/lib/analysisNotes.js";
import {materialOptions} from "../src/lib/analysisMaterials.js";
const uuid=value=>typeof value==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function createAnalysisJobsHandler({env=process.env,clientFactory=createClient,analyzeFactory=createAnalyzeHandler,waitUntil}={}) {
  return async function handler(request,response) {
    response.setHeader("Cache-Control","no-store");
    if(!["GET","POST"].includes(request.method)) return response.status(405).json({error:"GET 또는 POST 요청이 필요해요."});
    const authorization=request.headers?.authorization || "";
    if(!/^Bearer [^\s]+$/i.test(authorization)) return response.status(401).json({error:"로그인이 필요해요."});
    const url=env.SUPABASE_URL || env.VITE_SUPABASE_URL,key=env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
    if(!url || !key) return response.status(503).json({error:"분석 저장 설정을 확인해 주세요."});
    const client=clientFactory(url,key,{global:{headers:{Authorization:authorization},fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})},auth:{persistSession:false,autoRefreshToken:false}});
    try {
      const {data:auth,error:authError}=await client.auth.getUser(authorization.replace(/^Bearer /i,""));
      if(authError || !auth?.user?.id || !auth.user.email_confirmed_at) return response.status(401).json({error:"다시 로그인해 주세요."});
      const userId=auth.user.id;
      if(request.method==="GET") {
        const id=request.query?.id;
        if(!uuid(id)) return response.status(400).json({error:"분석 번호를 확인해 주세요."});
        const {data,error}=await client.from("analysis_jobs").select("id,status,result,error,created_at").eq("user_id",userId).eq("id",id).maybeSingle();
        if(error) return response.status(503).json({error:"분석 진행 상태를 확인하지 못했어요."});
        if(!data) return response.status(404).json({error:"분석 요청을 찾지 못했어요."});
        if(data.status==="processing" && Date.now()-Date.parse(data.created_at)>135000) return response.status(200).json({...data,status:"failed",error:"서버 처리 시간을 넘겼어요. 노트를 확인하고 다시 분석해 주세요."});
        return response.status(200).json(data);
      }
      const body=request.body;
      if(!body || Array.isArray(body) || typeof body!=="object" || Buffer.byteLength(JSON.stringify(body))>MAX_BODY_BYTES || !uuid(body.jobId) || (body.noteId!==undefined && !uuid(body.noteId))) return response.status(400).json({error:"분석 요청을 확인해 주세요."});
      if(body.noteId) {
        const {data,error}=await client.from("analysis_notes").select("id").eq("user_id",userId).eq("id",body.noteId).maybeSingle();
        if(error || !data) return response.status(403).json({error:"내 분석 노트에서만 탐구를 이어갈 수 있어요."});
      }
      const existing=await client.from("analysis_jobs").select("id").eq("user_id",userId).eq("id",body.jobId).maybeSingle();
      if(existing.data) return response.status(202).json({jobId:body.jobId});
      const inserted=await client.from("analysis_jobs").insert({id:body.jobId,user_id:userId,status:"processing"});
      if(inserted.error) return response.status(inserted.error.code==="23505" ? 409:503).json({error:"분석 요청을 저장하지 못했어요. 다시 시도해 주세요."});
      const update=async value=>{const {error}=await client.from("analysis_jobs").update(value).eq("user_id",userId).eq("id",body.jobId);if(error) throw new Error("JOB_SAVE");};
      const task=(async()=>{
        let status=500,payload;
        const resultResponse={setHeader(){},status(value){status=value;return this;},json(value){payload=value;return value;}};
        try {
          const analyze=analyzeFactory({env,timeoutMs:Number.isSafeInteger(body.budgetMs) ? Math.max(1000,Math.min(115000,body.budgetMs)):110000,onResult:async(result,context)=>{
            const noteId=body.noteId || body.jobId;
            if(body.noteId) {
              const {data:note,error}=await client.from("analysis_notes").select("*").eq("user_id",userId).eq("id",noteId).single();if(error || !note) throw new Error("NOTE_READ");
              const state=note.content.explorationState || {steps:[{path:[],result:note.content.exploration}]};
              const steps=state.steps || [],path=context.explorationPath || [];
              const selected=note.content.exploration?.choices?.find(choice=>choice.question===path[0]);
              const next={subject:context.explorationSubject,steps:[...steps,{path,result:result.exploration,warning:result.warning,timings:result.timings,connection:selected ? {sources:selected.sources,subject:selected.subject,title:selected.title}:steps.at(-1)?.connection}]};
              const saved=await client.from("analysis_notes").update({content:{...note.content,explorationState:next},updated_at:new Date().toISOString()}).eq("user_id",userId).eq("id",noteId);if(saved.error) throw new Error("NOTE_SAVE");
            } else {
              const inputs={records:context.records,files:materialOptions(context.teacherSharedFiles),extraContext:context.extraContext,subject:context.explorationSubject};
              const saved=await client.from("analysis_notes").insert({id:noteId,user_id:userId,title:noteTitle(inputs),content:analysisNoteContent({analysis:result.analysis,exploration:result.exploration,inputs,scope:result.scope,warning:result.warning})});if(saved.error) throw new Error("NOTE_SAVE");
            }
            result.noteId=noteId;
          }});
          await analyze({method:"POST",headers:request.headers,body:{...body,jobId:undefined,noteId:undefined}},resultResponse);
          if(status!==200) await update({status:"failed",error:payload?.error || "분석하지 못했어요. 다시 시도해 주세요."});
          else await update({status:"completed",result:payload});
        } catch {await update({status:"failed",error:"분석 결과 저장을 완료하지 못했어요. 노트를 확인해 주세요."}).catch(()=>{});}
      })();
      waitUntil(task);
      return response.status(202).json({jobId:body.jobId});
    } catch {return response.status(503).json({error:"분석 서비스 연결을 확인해 주세요."});}
  };
}

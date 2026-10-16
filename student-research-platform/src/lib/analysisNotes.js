export function analysisNoteContent({analysis,exploration,inputs,scope,warning,explorationState}) {
  return {version:1,analysis,exploration,scope,warning,
    inputs:{subject:inputs.subject || "",extraContext:inputs.extraContext || "",
      records:inputs.records.map(record=>({id:record.id,title:record.title,subject:record.subject,grade:record.grade,semester:record.semester})),
      files:inputs.files.map(file=>({id:file.id,materialId:file.materialId,key:file.key,name:file.name,title:file.title}))},
    explorationState:explorationState || null};
}
export function noteTitle(inputs) {
  return [inputs.subject,inputs.records[0]?.title || inputs.files[0]?.name || "활동 분석"].filter(Boolean).join(" · ").slice(0,160);
}
export function createAnalysisNotesService(client,userId) {
  if(!userId) throw new Error("로그인이 필요해요.");
  return {
    async list() {const {data,error}=await client.from("analysis_notes").select("id,title,created_at,updated_at").eq("user_id",userId).order("updated_at",{ascending:false}).limit(100);if(error) throw error;return data || [];},
    async open(id) {const {data,error}=await client.from("analysis_notes").select("*").eq("user_id",userId).eq("id",id).single();if(error) throw error;return data;},
    async remove(id) {const {error}=await client.from("analysis_notes").delete().eq("user_id",userId).eq("id",id);if(error) throw error;},
    async save(note) {const {data,error}=await client.from("analysis_notes").upsert({id:note.id,user_id:userId,title:note.title,content:note.content,updated_at:new Date().toISOString()},{onConflict:"id"}).select("id,title,created_at,updated_at").single();if(error) throw error;return data;},
  };
}

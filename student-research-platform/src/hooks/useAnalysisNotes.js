import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "../lib/supabaseClient.js";
import {createAnalysisNotesService} from "../lib/analysisNotes.js";
export function useAnalysisNotes(userId,client=supabase) {
  const service=useMemo(()=>userId ? createAnalysisNotesService(client,userId):null,[client,userId]);
  const [notes,setNotes]=useState([]),[status,setStatus]=useState(""),[error,setError]=useState("");
  const revision=useRef(0),deleted=useRef(new Set());
  const queue=useRef(Promise.resolve()),owner=useRef(userId);owner.current=userId;
  const refresh=useCallback(async()=>{if(!service) return;try {const items=await service.list();if(owner.current===userId) {setNotes(items.filter(note=>!deleted.current.has(`${userId}:${note.id}`)));setError("");}} catch {if(owner.current===userId) setError("노트를 불러오지 못했어요. 다시 불러와 주세요.");}},[service,userId]);
  useEffect(()=>{setNotes([]);setError("");setStatus("");refresh();},[refresh]);
  const save=useCallback(note=>{
    if(!service || deleted.current.has(`${userId}:${note.id}`)) return;const write=++revision.current;setStatus("노트 저장 중…");setError("");
    queue.current=queue.current.catch(()=>{}).then(()=>owner.current===userId && !deleted.current.has(`${userId}:${note.id}`) ? service.save(note):null).then(item=>{
      if(owner.current!==userId || !item || deleted.current.has(`${userId}:${note.id}`)) return;
      setNotes(previous=>[item,...previous.filter(note=>note.id!==item.id)].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,100));if(write===revision.current) setStatus("계정에 저장됨");
    }).catch(()=>{if(owner.current===userId && write===revision.current) {setStatus("");setError("노트 저장에 실패했어요. 현재 결과는 유지됩니다. 저장을 다시 눌러 주세요.");}});
  },[service,userId]);
  const remove=useCallback(async id=>{
    if(!service) return false;
    const key=`${userId}:${id}`;deleted.current.add(key);++revision.current;setStatus("");setError("");
    const operation=queue.current.catch(()=>{}).then(()=>service.remove(id));queue.current=operation;
    try {
      await operation;
      if(owner.current===userId) {setNotes(previous=>previous.filter(note=>note.id!==id));setStatus("노트를 삭제했어요.");}
      return true;
    } catch {deleted.current.delete(key);if(owner.current===userId) setError("노트를 삭제하지 못했어요. 다시 시도해 주세요.");return false;}
  },[service,userId]);
  return {notes,status,error,refresh,save,remove,open:service?.open};
}

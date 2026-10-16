import { useCallback, useEffect, useRef, useState } from "react";
import * as studentDataService from "../services/dataService.js";
import { getFriendlySupabaseError } from "../lib/supabaseClient.js";

export function useStudentData(session, setMessage, service = studentDataService) {
  const [profile,setProfile]=useState(null),[records,setRecords]=useState([]);
  const [teacherSharedFiles,setTeacherSharedFiles]=useState([]),[academicProfile,setAcademicProfile]=useState(null);
  const [loading,setLoading]=useState({}),[dataErrors,setDataErrors]=useState({}),[retry,setRetry]=useState(0);
  const userId=session?.user?.id,userEmail=session?.user?.email;
  const userRef=useRef(session?.user);userRef.current=session?.user;
  const runRef=useRef(null),owner=useRef(null);
  const readSource=useCallback(async(run,source,read)=>{
    if(!run?.active || userRef.current?.id!==run.id) return;
    const version=run.versions[source]=(run.versions[source] || 0)+1;
    const current=()=>run.active && userRef.current?.id===run.id && run.versions[source]===version;
    setLoading(previous=>({...previous,[source]:true}));
    setDataErrors(previous=>({...previous,[source]:""}));
    try {
      const data=await read();
      if(current()) {
        if(source==="records") setRecords(data || []);
        else if(source==="materials") setTeacherSharedFiles(data || []);
        else setAcademicProfile(data || null);
      }
      return data;
    } catch(error) {
      if(current()) setDataErrors(previous=>({...previous,[source]:getFriendlySupabaseError(error)}));
      throw error;
    } finally {if(current()) setLoading(previous=>({...previous,[source]:false}));}
  },[]);
  useEffect(()=>{
    const user=userRef.current,run={id:userId,active:true,versions:{}};runRef.current=run;
    if(owner.current!==userId) {
      owner.current=userId;setProfile(null);setRecords([]);setTeacherSharedFiles([]);setAcademicProfile(null);setDataErrors({});
    }
    setLoading(user ? {profile:true,academic:true,records:true,materials:true}:{});
    if(user) (async()=>{
      try {
        const p=await service.ensureProfile(user);
        if(!run.active) return;
        setProfile(p);setDataErrors(previous=>({...previous,profile:""}));
        if(p.role!=="student") {setLoading({});return;}
        setLoading(previous=>({...previous,profile:false}));
        // Each source commits independently; one unavailable table cannot hide other data.
        await Promise.allSettled([
          readSource(run,"academic",()=>service.fetchAcademicProfile(user.id)),
          readSource(run,"records",()=>service.fetchResearchRecords(user.id)),
          readSource(run,"materials",()=>service.fetchTeacherSharedFiles(user.email)),
        ]);
      } catch(error) {
        if(run.active) {setDataErrors(previous=>({...previous,profile:getFriendlySupabaseError(error)}));setLoading({});}
      }
    })();
    return ()=>{run.active=false;};
  },[userId,userEmail,service,retry,readSource]);

  async function loadResearchRecords(id) {
    if(id!==userRef.current?.id) return;
    return readSource(runRef.current,"records",()=>service.fetchResearchRecords(id));
  }
  async function loadTeacherSharedFiles(email) {
    if(email!==userRef.current?.email) return;
    return readSource(runRef.current,"materials",()=>service.fetchTeacherSharedFiles(email)).catch(()=>{});
  }
  const ownProfile=profile?.id===userId;
  return {profile:ownProfile ? profile:null,records:ownProfile ? records:[],teacherSharedFiles:ownProfile ? teacherSharedFiles:[],academicProfile:ownProfile ? academicProfile:null,setAcademicProfile,
    isAcademicProfileLoading:Boolean(loading.profile || loading.academic),isLoadingResearchRecords:Boolean(loading.records),isLoadingTeacherSharedFiles:Boolean(loading.materials),
    dataErrors, reloadStudentData:()=>setRetry(value=>value+1),loadResearchRecords,loadTeacherSharedFiles};
}

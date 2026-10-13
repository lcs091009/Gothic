import { useEffect, useRef, useState } from "react";
import { ensureProfile, fetchAcademicProfile, fetchResearchRecords, fetchTeacherSharedFiles } from "../services/dataService";
import { getFriendlySupabaseError } from "../lib/supabaseClient";

export function useStudentData(session, setMessage) {
  const [profile, setProfile] = useState(null);
  const [records, setRecords] = useState([]);
  const [teacherSharedFiles, setTeacherSharedFiles] = useState([]);
  const [academicProfile, setAcademicProfile] = useState(null);
  const [isAcademicProfileLoading, setIsAcademicProfileLoading] = useState(false);
  const [isLoadingTeacherSharedFiles, setIsLoadingTeacherSharedFiles] = useState(false);
  const userRef = useRef(null);
  userRef.current = session?.user?.id;
  const user = session?.user;
  useEffect(() => {
    let active = true;
    setProfile(null); setRecords([]); setTeacherSharedFiles([]); setAcademicProfile(null);
    if (!user) { setIsAcademicProfileLoading(false); return; }
    setIsAcademicProfileLoading(true);
    (async () => {
      try {
        const p = await ensureProfile(user);
        if (!active) return;
        setProfile(p);
        if (p.role !== "student") return;
        const [a, r, t] = await Promise.all([fetchAcademicProfile(user.id),
          fetchResearchRecords(user.id), fetchTeacherSharedFiles(user.email)]);
        if (active) { setAcademicProfile(a); setRecords(r || []); setTeacherSharedFiles(t || []); }
      } catch (error) { if (active) setMessage(getFriendlySupabaseError(error)); }
      finally { if (active) setIsAcademicProfileLoading(false); }
    })();
    return () => { active = false; };
  }, [user, setMessage]);

  async function loadResearchRecords(userId) {
    const data = await fetchResearchRecords(userId);
    if (userRef.current === userId) setRecords(data || []);
  }
  async function loadTeacherSharedFiles(email) {
    const id = userRef.current;
    setIsLoadingTeacherSharedFiles(true);
    try {
      const data = await fetchTeacherSharedFiles(email);
      if (userRef.current === id) setTeacherSharedFiles(data || []);
    } catch (error) { if (userRef.current === id) setMessage(getFriendlySupabaseError(error)); }
    finally { if (userRef.current === id) setIsLoadingTeacherSharedFiles(false); }
  }
  return { profile, records, teacherSharedFiles, academicProfile, setAcademicProfile,
    isAcademicProfileLoading, isLoadingTeacherSharedFiles, loadResearchRecords, loadTeacherSharedFiles };
}

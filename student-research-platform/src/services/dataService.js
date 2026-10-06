import { supabase, withRetry } from "../lib/supabaseClient";

async function read(query) {
  return withRetry(async () => {
    const { data, error } = await query();
    if (error) throw error;
    return data;
  });
}

export async function ensureProfile(user) {
  const profile = await read(() => supabase.from("profiles").select("*").eq("id", user.id).maybeSingle());
  if (profile) return profile;
  // A database trigger sets email, role and student number from the verified identity.
  const { error } = await supabase.from("profiles").upsert({
    id: user.id, email: user.email || "", name: user.user_metadata?.full_name || "",
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  return read(() => supabase.from("profiles").select("*").eq("id", user.id).single());
}

export const fetchResearchRecords = (userId) => read(() => supabase.from("research_records")
  .select("*").eq("user_id", userId).order("created_at", { ascending: false }));
export const fetchTeacherSharedFiles = (email) => email ? read(() => supabase.from("teacher_shared_files")
  .select("*").eq("student_email", email).order("created_at", { ascending: false })) : Promise.resolve([]);
export const fetchAcademicProfile = (userId) => read(() => supabase.from("student_academic_profiles")
  .select("*").eq("user_id", userId).maybeSingle());

export async function saveResearchRecord(record) {
  const { error } = await supabase.from("research_records").insert(record);
  if (error) throw error;
}
export async function deleteResearchRecord(id, userId) {
  const { error } = await supabase.from("research_records").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

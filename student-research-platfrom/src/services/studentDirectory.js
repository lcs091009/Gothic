import { supabase } from "../lib/supabaseClient.js";
export const STUDENT_PAGE_SIZE = 30;
export function applyStudentFilters(query, filters) {
  for (const [key, column, max] of [["grade", "directory_grade", 3], ["classNumber", "directory_class", 99], ["number", "directory_number", 99]]) {
    if (filters[key] === "" || filters[key] == null) continue;
    const value = Number(filters[key]);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error("학년·반·번호 범위를 확인해 주세요.");
    query = query.eq(column, value);
  }
  return query;
}
export async function fetchStudents(filters, page = 0, client = supabase) {
  let query = client.from("profiles").select("id,name,email,student_number,directory_grade,directory_class,directory_number", { count: "exact" }).eq("role", "student");
  query = applyStudentFilters(query, filters);
  const { data, error, count } = await query.order("directory_grade", { nullsFirst: false })
    .order("directory_class", { nullsFirst: false }).order("directory_number", { nullsFirst: false }).order("id")
    .range(page * STUDENT_PAGE_SIZE, (page + 1) * STUDENT_PAGE_SIZE - 1);
  if (error) throw error;
  return { students: data || [], count: count || 0 };
}
export async function fetchStudentDetails(studentId, client = supabase) {
  const [academic, records] = await Promise.all([
    client.from("student_academic_profiles").select("*").eq("user_id", studentId).maybeSingle(),
    client.from("research_records").select("id,grade,semester,subject,title,content,created_at,drive_file_name,drive_file_url", { count: "exact" })
      .eq("user_id", studentId).order("created_at", { ascending: false }).order("id").range(0, 19),
  ]);
  if (academic.error || records.error) throw academic.error || records.error;
  return { academic: academic.data, records: records.data || [], recordCount: records.count || 0 };
}
export function directoryError(error) {
  if (["42703", "42883", "42501"].includes(error?.code)) return "학생 조회 설정이 필요합니다. 관리자에게 교사 권한과 학생 조회 SQL 적용을 확인해 달라고 요청해 주세요.";
  return "학생 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

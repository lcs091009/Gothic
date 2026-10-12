import { supabase } from "../lib/supabaseClient.js";

export const MAX_ASSIGNMENT_RECIPIENTS = 100;
export function buildAssignmentRows({ teacher, students, title, description, category = "탐구", fileUrl = "", dueDate = "" }, makeId = () => crypto.randomUUID()) {
  if (!teacher?.id || !teacher?.email) throw new Error("다시 로그인해 주세요.");
  if (!Array.isArray(students) || !students.length || students.length > MAX_ASSIGNMENT_RECIPIENTS) throw new Error("받을 학생을 1~100명 선택해 주세요.");
  if (!title?.trim() || title.trim().length > 160) throw new Error("과제 제목을 160자 이내로 입력해 주세요.");
  if (!description?.trim() || description.trim().length > 4000) throw new Error("과제 안내를 4,000자 이내로 입력해 주세요.");
  const link = fileUrl.trim();
  if (link) {
    let url; try { url = new URL(link); } catch { throw new Error("파일 링크는 http 또는 https 주소로 입력해 주세요."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("파일 링크는 http 또는 https 주소로 입력해 주세요.");
  }
  const date = dueDate ? new Date(`${dueDate}T00:00:00Z`) : null;
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dueDate)) throw new Error("제출 기한을 확인해 주세요.");
  const emails = new Set();
  return students.map(student => {
    if (!student.id || !student.email || emails.has(student.email)) throw new Error("선택한 학생 정보를 다시 확인해 주세요.");
    emails.add(student.email);
    return { id: makeId(), teacher_id: teacher.id, teacher_email: teacher.email,
      student_number: student.student_number || null, student_email: student.email,
      file_name: title.trim(), description: dueDate ? `제출 기한: ${dueDate}\n\n${description.trim()}` : description.trim(),
      file_url: link || null, file_id: null, category, match_status: "matched" };
  });
}
// Retry the same draft IDs after an uncertain network response, without making
// a second copy or updating previously delivered assignments. RLS still applies.
export async function deliverAssignmentRows(rows, client = supabase) {
  if (!client) throw new Error("서비스 연결 설정이 필요합니다.");
  const { error } = await client.from("teacher_shared_files").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
}

// A single bulk write has one created_at value; show it as one delivery in the
// teacher's history while preserving separate recipient rows for student RLS.
export function groupAssignmentDeliveries(files) {
  const groups = new Map();
  for (const file of files) {
    const key = JSON.stringify([file.teacher_id, file.file_name, file.description, file.file_url, file.category, file.match_status, file.created_at ?? file.id]);
    if (!groups.has(key)) groups.set(key, { ...file, recipients: [] });
    groups.get(key).recipients.push({ email: file.student_email, number: file.student_number });
  }
  return [...groups.values()];
}

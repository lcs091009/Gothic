export const ASSIGNMENT_DRAFT_TTL = 30 * 24 * 60 * 60 * 1000;
const keyFor = userId => `research:assignment-draft:v1:${encodeURIComponent(userId)}`;
const text = (value, limit) => typeof value === "string" ? value.slice(0, limit) : "";
function storageOrDefault(storage) {
  try { return storage || (typeof window !== "undefined" ? window.localStorage : null); } catch { return null; }
}
export function cleanAssignmentDraft(value) {
  const source = value && typeof value === "object" ? value : {};
  const students = Array.isArray(source.students) ? source.students.slice(0, 100).filter(s => s && typeof s.id === "string" && typeof s.email === "string").map(s => ({
    id: text(s.id, 100), email: text(s.email, 254), name: text(s.name, 100), student_number: text(s.student_number, 20),
    directory_grade: Number.isInteger(s.directory_grade) ? s.directory_grade : null, directory_class: Number.isInteger(s.directory_class) ? s.directory_class : null, directory_number: Number.isInteger(s.directory_number) ? s.directory_number : null,
  })) : [];
  const attachments = Array.isArray(source.attachments) ? source.attachments.filter(f => f && /^[\w-]+$/.test(f.id || "") && /^https:\/\//.test(f.url || "")).map(f => ({... (Number.isSafeInteger(f.size) ? {size:f.size}:{}),id:text(f.id, 200),name:text(f.name,255),url:text(f.url,2048), ...(typeof f.accountId === "string" ? {accountId:text(f.accountId,200)} : {})})) : [];
  const delivery = source.delivery && typeof source.delivery.key === "string" && Array.isArray(source.delivery.ids)
    ? { key: text(source.delivery.key, 160000), ids: source.delivery.ids.slice(0,100).map(id => text(id,100)) } : null;
  return { students, attachments, title: text(source.title,160), description:text(source.description,4000),
    category:text(source.category,40)||"탐구", fileUrl:text(source.fileUrl,2048), dueDate:text(source.dueDate,10), delivery };
}
export function readAssignmentDraft(userId, storage, now = Date.now()) {
  if (!userId) return cleanAssignmentDraft(null);
  const target = storageOrDefault(storage);
  try {
    const saved = JSON.parse(target?.getItem(keyFor(userId)) || "null");
    if (!saved || saved.ownerId !== userId || saved.version !== 1 || !Number.isFinite(saved.savedAt) || now - saved.savedAt > ASSIGNMENT_DRAFT_TTL || saved.savedAt > now + 60_000) {
      target?.removeItem(keyFor(userId)); return cleanAssignmentDraft(null);
    }
    return cleanAssignmentDraft(saved.data);
  } catch { return cleanAssignmentDraft(null); }
}
export function writeAssignmentDraft(userId, value, storage, now = Date.now()) {
  if (!userId) return false;
  const target = storageOrDefault(storage);
  if (!target) return false;
  try { target.setItem(keyFor(userId), JSON.stringify({version:1,ownerId:userId,savedAt:now,data:cleanAssignmentDraft(value)})); return true; } catch { return false; }
}
export function clearAssignmentDraft(userId, storage) {
  try { storageOrDefault(storage)?.removeItem(keyFor(userId)); return true; } catch { return false; }
}

export function assignmentDeliveryKey(draft) {
  return JSON.stringify({ teacher: [draft.teacher?.id, draft.teacher?.email], students: draft.students.map(s => [s.id,s.email]),
    title:draft.title,description:draft.description,category:draft.category,fileUrl:draft.fileUrl,fileId:draft.fileId,
    attachments:draft.attachments.map(f => [f.id,f.name,f.url]),dueDate:draft.dueDate });
}

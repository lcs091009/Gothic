export const MAX_DRIVE_ATTACHMENTS = 20;
export const DRIVE_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_DRIVE_UPLOAD_BYTES = 500 * 1024 * 1024;
const endpoint = "https://www.googleapis.com";
export async function uploadDriveFile(file, token, { fetchImpl = fetch, signal, onProgress = () => {} } = {}) {
  if (!file?.name || !Number.isFinite(file.size) || file.size > MAX_DRIVE_UPLOAD_BYTES) throw new Error("500MB 이하의 파일을 선택해 주세요.");
  const type = file.type || "application/octet-stream";
  const start = await fetchImpl(`${endpoint}/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink`, {
    method: "POST", signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Type": type, "X-Upload-Content-Length": String(file.size) },
    body: JSON.stringify({ name: file.name, mimeType: type }),
  });
  if (!start.ok) throw new Error("Google Drive 업로드를 시작하지 못했습니다. Google 계정과 Drive 권한을 확인해 주세요.");
  const location = start.headers.get("Location");
  let url; try { url = new URL(location); } catch { throw new Error("업로드 연결을 확인하지 못했습니다."); }
  if (url.origin !== endpoint || url.pathname !== "/upload/drive/v3/files") throw new Error("업로드 연결을 확인하지 못했습니다.");
  let offset = 0, result, recoveries = 0;
  while (offset < file.size || file.size === 0) {
    const end = Math.min(offset + DRIVE_CHUNK_BYTES, file.size);
    const body = offset === 0 && end === file.size ? file : file.slice(offset, end);
    let response;
    try {
      response = await fetchImpl(url.href, { method: "PUT", signal,
        headers: { "Content-Type": type, ...(file.size ? { "Content-Range": `bytes ${offset}-${end - 1}/${file.size}` } : {}) }, body });
    } catch (error) { if (error.name === "AbortError") throw error; }
    const recovering = !response || response.status >= 500;
    if (recovering) {
      if (++recoveries > 2) throw new Error("업로드 연결이 불안정합니다. 다시 선택해 주세요.");
      response = await fetchImpl(url.href, { method: "PUT", signal, headers: { "Content-Range": `bytes */${file.size}` } });
    }
    if (response.ok) { result = await response.json(); onProgress(file.size, file.size); break; }
    if (response.status !== 308) throw new Error("파일 업로드에 실패했습니다. 다시 선택해 주세요.");
    const range = response.headers.get("Range");
    const received = /^bytes=0-(\d+)$/.exec(range || "");
    const next = received ? Number(received[1]) + 1 : 0;
    if (recovering && next === offset) continue;
    if (next <= offset || next > file.size) throw new Error("업로드 진행 상태를 확인하지 못했습니다. 다시 선택해 주세요.");
    offset = next; onProgress(offset, file.size);
  }
  if (!/^[\w-]+$/.test(result?.id || "")) throw new Error("업로드한 파일을 확인하지 못했습니다.");
  return { id: result.id, name: result.name || file.name, url: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view` };
}
// Google does not support concurrent permission changes on the same file.
export async function shareDriveFile(fileId, emails, token, { fetchImpl = fetch, signal, completed = new Set(), onProgress = () => {} } = {}) {
  if (!/^[\w-]+$/.test(fileId || "") || !Array.isArray(emails) || emails.length > 100 || emails.some(email => typeof email !== "string" || !email.includes("@"))) throw new Error("파일과 받을 학생을 다시 확인해 주세요.");
  const recipients = [...new Set(emails)];
  for (const [index, email] of recipients.entries()) {
    if (!completed.has(email)) {
      const response = await fetchImpl(`${endpoint}/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, {
        method: "POST", signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
      });
      if (!response.ok) throw new Error("학생에게 파일 열람 권한을 주지 못했습니다. 공유 가능한 Google 계정의 파일인지 확인하고 다시 전달해 주세요.");
      completed.add(email);
    }
    onProgress(index + 1, recipients.length);
  }
}

export function mergeDriveAttachments(existing, incoming) {
  const files = new Map(existing.map(file => [file.id, file]));
  for (const file of incoming) {
    if (!/^[\w-]+$/.test(file.id || "")) continue;
    files.set(file.id, { id: file.id, name: file.name || "파일", url: file.url || `https://drive.google.com/file/d/${file.id}/view` });
  }
  if (files.size > MAX_DRIVE_ATTACHMENTS) throw new Error(`파일은 최대 ${MAX_DRIVE_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
  return [...files.values()];
}

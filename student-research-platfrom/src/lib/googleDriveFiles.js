export const MAX_DRIVE_UPLOAD_BYTES = 50 * 1024 * 1024;
const endpoint = "https://www.googleapis.com";
export async function uploadDriveFile(file, token, { fetchImpl = fetch, signal } = {}) {
  if (!file?.name || !Number.isFinite(file.size) || file.size > MAX_DRIVE_UPLOAD_BYTES) throw new Error("50MB 이하의 파일을 선택해 주세요.");
  const type = file.type || "application/octet-stream";
  const start = await fetchImpl(`${endpoint}/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink`, {
    method: "POST", signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Type": type, "X-Upload-Content-Length": String(file.size) },
    body: JSON.stringify({ name: file.name, mimeType: type }),
  });
  if (!start.ok) throw new Error("Google Drive 업로드를 시작하지 못했습니다. Google 계정과 Drive 권한을 확인해 주세요.");
  const location = start.headers.get("Location");
  let url; try { url = new URL(location); } catch { throw new Error("업로드 연결을 확인하지 못했습니다."); }
  if (url.origin !== endpoint || url.pathname !== "/upload/drive/v3/files") throw new Error("업로드 연결을 확인하지 못했습니다.");
  const response = await fetchImpl(url.href, { method: "PUT", signal, headers: { "Content-Type": type }, body: file });
  if (!response.ok) throw new Error("파일 업로드에 실패했습니다. 다시 선택해 주세요.");
  const result = await response.json();
  if (!/^[\w-]+$/.test(result.id || "")) throw new Error("업로드한 파일을 확인하지 못했습니다.");
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

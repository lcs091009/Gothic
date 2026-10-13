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
const knownSharingReasons = new Set(["authError", "invalidSharingRequest", "domainPolicy", "insufficientFilePermissions", "insufficientPermissions", "sharingRateLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded", "notFound"]);
export async function driveSharingError(response, context = "") {
  let body; try { body = await response.json(); } catch { body = null; }
  const original = body?.error?.errors?.[0]?.reason;
  const reason = knownSharingReasons.has(original) ? original : "unknown";
  let message;
  if (response.status === 401 || reason === "authError") message = "Google 인증이 만료됐습니다. Google Drive를 다시 연결해 주세요.";
  else if (reason === "domainPolicy") message = "학교 Google 관리자가 이 앱의 Drive 접근을 제한했습니다. 관리자에게 앱 접근 허용을 요청해 주세요.";
  else if (reason === "invalidSharingRequest") message = "Google이 학생 계정 공유를 거부했습니다. 학생 Google 이메일과 파일 소유 계정의 외부 공유 허용 설정을 확인해 주세요.";
  else if (reason === "insufficientFilePermissions") message = "이 Google 계정에는 파일을 다른 학생에게 공유할 권한이 없습니다. 소유자 계정으로 파일을 선택하거나 컴퓨터에서 원본을 첨부해 주세요.";
  else if (reason === "insufficientPermissions") message = "Google Drive 권한 승인이 부족합니다. 파일을 다시 선택하고 Drive 권한을 승인해 주세요.";
  else if (response.status === 429 || ["sharingRateLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(reason)) message = "Google 공유 요청 한도에 도달했습니다. 잠시 후 다시 전달해 주세요.";
  else if (response.status === 404 || reason === "notFound") message = "앱이 이 파일을 읽을 수 없습니다. 파일이 있어도 앱 접근 권한 또는 Drive 연결 설정 때문에 발생할 수 있습니다. Google 계정을 다시 연결한 뒤 파일을 다시 선택해 주세요.";
  else message = "Google 파일 공유에 실패했습니다. 파일 소유 계정과 공유 설정을 확인해 주세요.";
  const error = new Error(`${context ? `${context}: ` : ""}${message} [Google ${response.status} · ${reason}]`);
  error.status = response.status; error.reason = reason; error.scope = "driveSharing";
  return error;
}
function permissionCovers(permission, email) {
  if (permission.deleted || !["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"].includes(permission.role)) return false;
  return permission.type === "anyone" || (permission.type === "user" && permission.emailAddress?.toLowerCase() === email.toLowerCase()) ||
    (permission.type === "domain" && email.toLowerCase().endsWith(`@${permission.domain?.toLowerCase()}`));
}
// Read all explicit permission pages; never downgrade an existing collaborator.
async function filePermissions(fileId, token, fetchImpl, signal) {
  const permissions = []; let pageToken;
  do {
    const url = new URL(`${endpoint}/drive/v3/files/${encodeURIComponent(fileId)}/permissions`);
    url.searchParams.set("supportsAllDrives", "true"); url.searchParams.set("pageSize", "100");
    url.searchParams.set("fields", "nextPageToken,permissions(type,emailAddress,domain,role,deleted)");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetchImpl(url.href, { method: "GET", signal, headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw await driveSharingError(response);
    const data = await response.json(); permissions.push(...(data.permissions || [])); pageToken = data.nextPageToken;
  } while (pageToken);
  return permissions;
}
// Google does not support concurrent permission changes on the same file.
export async function shareDriveFile(fileId, emails, token, { fetchImpl = fetch, signal, completed = new Set(), onProgress = () => {} } = {}) {
  if (!/^[\w-]+$/.test(fileId || "") || !Array.isArray(emails) || emails.length > 100 || emails.some(email => typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) throw new Error("파일과 받을 학생을 다시 확인해 주세요.");
  const recipients = [...new Set(emails.map(email => email.trim().toLowerCase()))];
  if (recipients.every(email => completed.has(email))) { onProgress(recipients.length, recipients.length); return; }
  const metadataResponse = await fetchImpl(`${endpoint}/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=name,capabilities(canShare)`, {
    method: "GET", signal, headers: { Authorization: `Bearer ${token}` },
  });
  if (!metadataResponse.ok) throw await driveSharingError(metadataResponse);
  const metadata = await metadataResponse.json();
  const permissions = await filePermissions(fileId, token, fetchImpl, signal);
  for (const email of recipients) if (permissions.some(permission => permissionCovers(permission, email))) completed.add(email);
  if (metadata.capabilities?.canShare === false && recipients.some(email => !completed.has(email))) {
    const error = new Error(`${metadata.name || "첨부파일"}: 현재 Google 계정에 공유 권한이 없습니다. 파일 소유자 계정으로 다시 선택하거나 컴퓨터에서 원본을 첨부해 주세요. [Google · canShare=false]`);
    error.scope = "driveSharing"; throw error;
  }
  for (const [index, email] of recipients.entries()) {
    if (!completed.has(email)) {
      const response = await fetchImpl(`${endpoint}/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, {
        method: "POST", signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
      });
      if (!response.ok) {
        const error = await driveSharingError(response, `${metadata.name || "첨부파일"} → ${email}`);
        // Google can return an error after granting permission. Verify once.
        if ([400,409].includes(response.status)) {
          const refreshed = await filePermissions(fileId, token, fetchImpl, signal);
          if (!refreshed.some(permission => permissionCovers(permission, email))) throw error;
        } else throw error;
      }
      completed.add(email);
    }
    onProgress(index + 1, recipients.length);
  }
}

export function mergeDriveAttachments(existing, incoming) {
  const files = new Map(existing.map(file => [file.id, file]));
  for (const file of incoming) {
    if (!/^[\w-]+$/.test(file.id || "")) continue;
    files.set(file.id, { id: file.id, name: file.name || "파일", url: file.url || `https://drive.google.com/file/d/${file.id}/view`, ...(typeof file.accountId === "string" && file.accountId.length <= 200 ? { accountId: file.accountId } : {}) });
  }
  if (files.size > MAX_DRIVE_ATTACHMENTS) throw new Error(`파일은 최대 ${MAX_DRIVE_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
  return [...files.values()];
}

export async function shareDriveFileWithTokenRefresh(fileId, emails, token, refreshToken, options) {
  try { await shareDriveFile(fileId, emails, token, options); return token; }
  catch (error) {
    if (error.status !== 401 && error.reason !== "authError") throw error;
    const nextToken = await refreshToken();
    await shareDriveFile(fileId, emails, nextToken, options);
    return nextToken;
  }
}

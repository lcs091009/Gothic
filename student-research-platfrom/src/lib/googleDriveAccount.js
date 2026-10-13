// Query the identity represented by this Drive token, not the app's login ID.
export async function getDriveAccount(token, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl("https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)", {
    signal, headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Google Drive 연결 계정을 확인하지 못했습니다. Google 계정을 다시 연결해 주세요.");
  const { user } = await response.json();
  if (!user?.permissionId || !user?.emailAddress) throw new Error("Google Drive 계정 정보가 없습니다. 다시 연결해 주세요.");
  return { id: String(user.permissionId), email: String(user.emailAddress) };
}

export function assertDriveAccount(account, files) {
  const different = files.find(file => file.accountId && file.accountId !== account.id);
  if (!different) return;
  const error = new Error(`${different.name || "첨부파일"}: 첨부할 때 사용한 Google 계정과 현재 Drive 연결 계정이 다릅니다. Google 계정을 다시 연결해 첨부한 계정을 선택해 주세요. 파일은 유지됩니다.`);
  error.scope = "driveSharing";
  throw error;
}

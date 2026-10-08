export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const AUTH_TIMEOUT_MS = 120_000;

// Google reports popup closure itself. Browser focus/visibility changes do not
// prove a popup closed: account selection and consent can also cause them.
export function requestDriveAccessToken({ oauth2, clientId, forceConsent = false, signal,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(new Error(error)); else resolve(result);
    }
    function onAbort() { finish("계정이 변경되어 Google 권한 요청을 취소했습니다."); }
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimer(() => finish("Google 권한 요청 시간이 초과됐습니다. 파일 선택을 다시 눌러 주세요."), AUTH_TIMEOUT_MS);
    try {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        include_granted_scopes: false,
        callback(response) {
          if (response?.error || !response?.access_token) {
            finish(response?.error === "access_denied"
              ? "Google Drive 접근을 승인하지 않았습니다. 파일을 선택하려면 권한을 승인해 주세요."
              : "Google Drive 권한 요청에 실패했습니다. 다시 시도해 주세요.");
          } else finish(null, response);
        },
        error_callback(error) {
          finish(error?.type === "popup_closed"
            ? "Google 로그인 창이 닫혔습니다. 파일을 선택하려면 버튼을 다시 눌러 주세요."
            : error?.type === "popup_failed_to_open"
              ? "Google 로그인 팝업이 차단됐습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요."
              : "Google 로그인 창에서 오류가 발생했습니다. 다시 시도해 주세요.");
        },
      });
      client.requestAccessToken({ prompt: forceConsent ? "consent" : "" });
    } catch {
      finish("Google 로그인 창을 여는 중 오류가 발생했습니다.");
    }
  });
}

export function googleLoginOptions(origin) {
  return { provider: "google", options: { redirectTo: origin,
    scopes: "https://www.googleapis.com/auth/drive.file",
    queryParams: { prompt: "select_account" } } };
}

export function googleLoginError(error) {
  const code = error?.code || error?.error || "";
  if (code === "access_denied") return "Google 로그인이 취소되었거나 학교에서 앱 접근을 제한했습니다. 계정과 승인 설정을 확인해 주세요.";
  if (code === "provider_disabled" || /provider.*(disabled|not enabled)|unsupported provider/i.test(error?.message || ""))
    return "Google 로그인 설정이 필요합니다. 관리자에게 인증 설정 확인을 요청해 주세요.";
  if (/fetch|network|timeout/i.test(error?.message || "")) return "Google 로그인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return "Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.";
}

export function googleCallbackError(location) {
  const params = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const error = params.get("error") || query.get("error");
  return error ? googleLoginError({ error, code: params.get("error_code") || query.get("error_code") || error }) : "";
}

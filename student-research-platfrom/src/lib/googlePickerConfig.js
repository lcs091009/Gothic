export function getGooglePickerConfigError({ googleApiKey, googleClientId }) {
  if (!googleApiKey || !googleClientId) {
    return "Google Picker 설정이 필요합니다. .env의 VITE_GOOGLE_API_KEY와 VITE_GOOGLE_CLIENT_ID를 확인하세요.";
  }

  if (!/^AIza[0-9A-Za-z\-_]{35}$/.test(googleApiKey)) {
    return "Google API 키 형식이 올바르지 않습니다. Google Cloud Console에서 API 키를 다시 생성해 주세요.";
  }

  if (!/^[^\s]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
    return "Google Client ID 형식이 올바르지 않습니다. Google Cloud Console에서 OAuth 클라이언트 ID를 확인해 주세요.";
  }

  return null;
}

# Google 로그인과 학교 파일 공유

로그인 버튼은 Supabase Auth의 Google OAuth를 사용합니다. 계정 선택 화면을 요청하고, 로그인에는 별도의 Drive 범위를 추가하지 않습니다. 학생/교사 권한은 기존 서버의 프로필과 승인 규칙을 그대로 사용합니다. Drive 파일 선택과 공유는 기존 별도 동의 흐름입니다.

## 배포 설정

- Supabase Authentication → Sign In / Providers → Google에서 공급자를 활성화하고 웹 OAuth Client ID와 Client Secret을 설정합니다. Secret은 프런트엔드 환경 변수에 넣지 않습니다.
- Google 인증 플랫폼의 웹 OAuth 클라이언트에 Supabase 콜백 `https://gbvfosghikjaslrgboqy.supabase.co/auth/v1/callback`을 승인된 리디렉션 URI로 등록합니다.
- Supabase URL Configuration에서 운영 Site URL과 로그인할 실제 배포 URL을 Redirect URLs에 등록합니다. 앱은 현재 origin으로 돌아오도록 요청합니다.
- Google 동의 화면에 앱 이름·로고·실제 서비스 도메인을 설정하면 Google 화면의 브랜드도 통일할 수 있습니다. 이는 웹 로그인 페이지 디자인과 별도의 콘솔 설정입니다.

## 학교 공유 제한 확인

학교 계정이라는 이유만으로 모든 외부 파일이 자동 거부되지는 않습니다. 학교 관리자는 파일 소유자의 외부 공유와 학생의 외부 파일 수신을 각각 제한할 수 있습니다. 조직 단위, 그룹, 허용 도메인, 공유 드라이브 정책도 확인해야 합니다.

관리자 확인 경로: Google Admin → 앱 → Google Workspace → Drive 및 Docs → 공유 설정. 외부 공유, 외부/허용 목록 밖 사용자에게서 파일 받기를 확인합니다. 신뢰 규칙을 사용하는 조직에서는 보안의 Drive 공유/수신 신뢰 규칙도 확인합니다. 앱 접근 제어는 별도로 확인합니다.

진단: 같은 파일을 Drive 웹 화면에서 해당 학생 이메일 한 명에게 직접 공유해 봅니다. 직접 공유도 거부되면 소유 권한·학교 공유/수신 정책을 먼저 확인합니다. 직접 공유가 성공하고 앱에서만 실패하면 앱 접근·OAuth 승인·배포 버전과 앱이 표시하는 Google 오류 코드를 확인합니다. 관리 정책을 코드로 우회하거나 공개 링크로 자동 전환하지 않습니다.

## 근거 (2026-10-12 확인)

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://knowledge.workspace.google.com/admin/drive/manage-external-sharing-for-your-organization
- https://knowledge.workspace.google.com/admin/security/create-and-manage-trust-rules-for-drive-sharing
- https://support.google.com/a/answer/9178844

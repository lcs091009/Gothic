# Drive 첨부·공유 점검 (2026-10-13)

## 확인한 주요 문제와 수정

| 문제 | 영향 | 처리 |
| --- | --- | --- |
| 앱 로그인과 Drive 연결에서 별도의 인증을 요청하고 로그인 Google 토큰을 재사용하지 않음 | 로그인 후 파일을 넣을 때 다시 인증 창이 열림 | 로그인에 선택 파일 접근 범위를 함께 요청하고 Google이 확인한 클라이언트·범위·만료 시간에 맞는 토큰만 재사용 |
| 앱 세션 확인 전 userId가 비어 있을 때 기존 Drive 캐시를 삭제할 수 있음 | 새로고침 후 유효한 연결도 다시 요구할 수 있음 | 로그인 사용자가 확정되기 전에는 캐시 삭제하지 않음 |
| Picker 선택 뒤 실제 Drive API 접근을 확인하지 않고 첨부 성공 표시 | 404가 과제 전달 단계까지 늦게 드러남 | 같은 Picker 토큰으로 파일 읽기 확인 후에만 첨부 목록에 추가. 실패하면 파일명·단계 표시 |
| Picker 프로젝트와 OAuth 클라이언트의 실제 배포 설정 일치 여부 미확인 | 파일이 있어도 앱 접근 승인이 연결되지 않을 가능성 | 관리자 설정 확인이 남음. 코드 검사만으로 동일 프로젝트를 보증하지 않음 |

선택 파일 접근(`drive.file`)은 전체 Drive 접근을 요청하지 않는다. Google의 최초 접근 동의, 만료·철회된 인증, 다른 OAuth 클라이언트의 토큰은 생략하거나 무조건 재사용할 수 없다. Supabase의 Google 공급자 Client ID와 프런트엔드 VITE_GOOGLE_CLIENT_ID가 같아야 로그인 토큰을 안전하게 재사용할 수 있다. Picker VITE_GOOGLE_APP_ID는 그 클라이언트가 속한 Google Cloud 프로젝트의 숫자 번호여야 한다.

## 모의 실행 결과

- Google이 확인한 로그인 토큰 캐시 재사용: 성공, 두 번째 검증 호출 생략.
- Drive 범위가 없는 토큰, 다른 클라이언트 토큰, 만료 직전 토큰: 재사용 거부.
- 토큰 검증 도중 로그아웃: 이전 사용자 토큰 캐시 복원 차단.
- 파일 선택 단계 404: 첨부 성공 처리 이전에 실패, 권한 변경 요청 없음.
- 20개 파일 접근 확인: 읽기 요청 동시 실행 최대 4개.
- 실제 훅을 Vite로 로드한 모의 실행: 캐시된 Google 토큰으로 파일 업로드 성공, GSI SDK나 추가 로그인 창 불필요.
- 전체 테스트 75개, lint, production build 통과.

실제 Mac Safari와 사용자의 Google 파일로 로그인·Picker·학생 공유까지 완료한 검증은 아니다. 정확한 404 원인은 운영 설정과 실제 파일 접근 확인이 남아 있다. 파일 접근에 성공해도 공유 권한이나 학교 공유·수신 정책 때문에 과제 전달이 실패할 수 있다. 실패를 무시하고 학생이 열 수 없는 파일을 전달하지 않는다.

## 공식 자료

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/social-login
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/data-portability/user-guide/time-based
- https://developers.google.com/workspace/drive/picker/guides/web-picker-sample
- https://developers.google.com/workspace/drive/api/guides/handle-errors

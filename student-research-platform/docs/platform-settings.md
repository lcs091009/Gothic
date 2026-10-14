# 배포 이름 변경 시 설정

이 저장소의 프로젝트 폴더는 student-research-platform으로 변경됐다. GitHub Actions와 루트 npm 명령도 새 경로를 사용한다.

PR 병합 전에 Vercel Settings → Build and Deployment → Root Directory를 `student-research-platform`으로 변경한다. 아직 기존 main을 배포하려면 기존 폴더가 필요한 시점이므로 설정 변경 직후 새 main을 배포한다.

Vercel Settings → General에서 Project Name을 `student-research-platform`으로 변경하고 Domains에 `student-research-platform.vercel.app`을 추가한다. 이름을 사용할 수 없으면 다른 주소가 필요하다. 코드만 변경해도 운영 주소가 자동으로 바뀌지는 않는다. 기존 주소는 새 주소의 로그인·파일 선택 확인이 끝날 때까지 유지한다.

Supabase Authentication → URL Configuration에서 Site URL을 새 주소로, Redirect URLs에 새 주소를 추가한다. Google Cloud OAuth 클라이언트의 승인된 JavaScript 원본에 새 주소를 추가하고, Picker API 키의 웹사이트 제한에도 새 주소를 추가한다. Google의 승인된 리디렉션 URI는 기존 Supabase `/auth/v1/callback`을 유지한다.

AI 요청은 인증된 학생들이 함께 사용하는 전체 10분 200회이며 하루 제한은 없다. 파일 개수 제한은 제거하고 업로드·선택 시 크기를 확인해 총 500MB를 검사한다. Google 문서처럼 파일 크기가 없는 클라우드 문서는 0으로 취급한다. 기존 첨부도 전달 전에 Drive에서 크기를 다시 확인한다.

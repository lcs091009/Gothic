# 활동 연결 노트

학생이 등록한 활동 요약, 선택과목, 교사 자료의 설명을 바탕으로 AI가 관심 흐름과 다음 탐구 질문을 제안합니다. Drive 첨부파일의 본문을 내려받거나 읽는 기능은 구현되어 있지 않습니다.

## 실행과 확인

Node.js 22.12 이상을 사용합니다. 저장소 최상위 기준:

```bash
npm run setup
cp student-research-platfrom/.env.example student-research-platfrom/.env.local
# 로컬 설정값 입력
npm run dev
```

기본 주소는 `http://localhost:8000`입니다. Codespaces에서는 8000번 포트의 Open in Browser를 사용합니다. 개발용 Vite 서버에 `/api/analyze` 처리 기능을 연결했으므로 일반 `npm run dev`에서도 API가 실행됩니다.

```bash
npm test
npm run lint
npm run build
```

`npm test`는 API 인증·입력 검증·요청 한도, 이메일 및 학번 판별, 기존 유틸리티와 임시 PostgreSQL(PGlite)에서의 SQL 보안 정책을 확인합니다. 실제 서비스 데이터베이스를 변경하거나 유료 AI API를 호출하지 않습니다. `npm run preview`는 빌드된 화면 확인용이며 AI 서버는 포함하지 않습니다.

## 환경변수

실제 값은 `.env.local` 또는 배포 플랫폼의 환경변수 설정에 저장합니다. `.env.example`만 Git으로 관리합니다.

| 변수 | 용도 | 범위 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 주소 | 브라우저 공개 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` 또는 `VITE_SUPABASE_ANON_KEY` | RLS 적용을 전제로 한 공개 접근 키 | 브라우저 공개 |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID | 브라우저 공개 |
| `VITE_GOOGLE_API_KEY` | Google Picker API 키 | 브라우저 공개, 도메인·API 제한 필요 |
| `VITE_GOOGLE_APP_ID` | Google Cloud 프로젝트의 숫자 번호 | 브라우저 공개 |
| `VITE_SCHOOL_EMAIL_DOMAIN` | 학교 이메일 도메인, 기본 `gochon.hs.kr` | 브라우저 공개 |
| `VITE_STUDENT_ADMISSION_YEAR` | 교사 자료 매칭의 기본 앞자리, 기본 `26` | 브라우저 공개 |
| `SUPABASE_URL` | 서버에서 로그인 및 저장 자료 확인 | 서버 설정 |
| `SUPABASE_PUBLISHABLE_KEY` 또는 `SUPABASE_ANON_KEY` | 사용자 토큰과 함께 RLS를 적용하는 서버 접근 키 | 서버 설정 |
| `NVIDIA_API_KEY` | NVIDIA 모델 호출 | **서버 비밀키** |

서버용 Supabase URL·공개 키가 없으면 대응하는 `VITE_` 설정을 사용합니다. `service_role` 키는 이 API에 필요하지 않습니다. 비밀키에 `VITE_` 접두사를 붙이면 브라우저 코드에 노출되므로 사용하지 마세요.

Google Cloud에서 Drive API와 Picker API를 활성화하고 OAuth의 JavaScript 출처를 실제 서비스 주소에 맞춥니다. Picker 키는 허용 웹사이트와 API를 제한합니다. Supabase Google 로그인에는 해당 서비스 주소를 Redirect URL로 등록합니다.

## 코드 구조

| 위치 | 담당 기능 |
| --- | --- |
| `src/App.jsx` | 화면 전환과 활동 입력 상태 |
| `src/pages/HomePage.jsx` | 로그인 전 소개 화면 |
| `src/pages/StudentPage.jsx` | 학생 활동 등록·목록·교사 자료 |
| `src/components/TeacherPage.jsx` | 교사 자료 등록과 입학 연도별 매칭 |
| `src/components/GradeSetup.jsx` | 학년·선택과목 저장 |
| `src/components/AiAnalysisPage.jsx` | 분석 요청과 결과 표시 |
| `src/hooks/useAuth.js` | 로그인·로그아웃·인증 상태 구독 |
| `src/hooks/useStudentData.js` | 계정별 자료 불러오기와 갱신 |
| `src/hooks/useGoogleDrive.js` | Picker, Drive 업로드와 계정별 토큰 정리 |
| `src/services/dataService.js` | 데이터베이스 통신 |
| `src/config/school.js` | 이메일·학번 규칙 |
| `src/styles/appStyles.js` | 공통 화면 스타일 |
| `api/analyze.js` | 서버 인증·권한·저장 자료 조회·한도·AI 호출 |
| `server/analysisContext.js` | 활동 대표 기록 선택·본문 발췌·근거 중심 분석 지침 |
| `server/devApi.js` | 로컬 개발 API 연결 |
| `supabase/migrations/` | 데이터 구조와 보안 SQL |

## 데이터와 권한

| 테이블 | 내용 | 접근 규칙 |
| --- | --- | --- |
| `profiles` | 계정 이름·역할·학번 | 본인 조회·이름 수정; 이메일·역할·학번은 서버 검증 또는 관리자 관리 |
| `research_records` | 학생 활동과 Drive 파일 링크 | 본인의 기록만 조회·저장·수정·삭제 |
| `student_academic_profiles` | 학년과 `selected_choices` | 본인의 선택과목 정보만 접근 |
| `teacher_shared_files` | 교사가 배정한 자료 | 승인된 교사가 자기 자료 관리; 배정된 학생은 읽기만 가능 |
| `school_settings` | 서버의 학교 이메일 도메인 | 관리자만 관리 |
| `ai_analysis_quotas` | 사용자별 AI 호출 횟수 | 직접 접근 금지; 인증된 학생용 SQL 함수로만 차감 |

RLS는 데이터베이스가 각 행의 접근 권한을 검사하는 규칙입니다. 화면에서 사용자를 필터링해도 데이터베이스 규칙이 필요합니다.

프로필 생성 시 데이터베이스가 확인된 로그인 이메일을 읽어 `두 자리 연도-3~5자리 학번@학교도메인` 형식을 학생으로 판정합니다. 그 외 계정은 `pending`입니다. 교사 역할은 관리자가 Supabase SQL Editor에서 지정합니다. 기존 교사 목록의 신뢰성도 확인해야 합니다.

```sql
-- 실제 교사 UUID를 확인한 뒤 관리자가 실행합니다.
update public.profiles set role = 'teacher' where id = 'VERIFIED_TEACHER_UUID'::uuid;
```

학교 도메인을 변경하면 `VITE_SCHOOL_EMAIL_DOMAIN`과 `school_settings.email_domain`을 함께 맞춥니다. 교사 화면에서는 입학 연도 앞자리를 바꿀 수 있고, 다른 연도가 명시된 파일은 자동 배정하지 않습니다.

## AI 요청 처리

서버는 Supabase `getUser(token)`으로 로그인 토큰을 검증한 뒤 승인된 학생인지 확인합니다. 브라우저는 보충 입력만 전송하며, 서버가 본인의 저장된 선택과목·최근 등록한 활동 최대 48개·교사 자료 8개를 다시 읽습니다. 활동은 개요 전체와 최신 기록·이전 학기·과목을 고려해 고른 최대 12개의 본문을 참고합니다. 긴 본문은 앞부분과 끝부분을 합쳐 2,000자 이내로 발췌하며 생략 여부를 모델에 알립니다. 등록일을 활동일로 취급하지 않습니다. 브라우저가 보낸 임의의 사용자 ID·활동 목록은 분석 자료로 사용하지 않습니다.

요청은 16 KiB, 보충 입력은 1,200자로 제한합니다. 데이터베이스에서 사용자별 **10분에 5회·24시간에 20회**를 제한하며, 서버 재시작이나 여러 인스턴스에서도 동일하게 집계합니다. 한도 SQL 함수가 없거나 오류가 나면 AI 호출을 차단합니다. NVIDIA 요청을 시작한 시도는 실패하더라도 한도에 포함됩니다. NVIDIA에서 제공하는 `qwen/qwen3-next-80b-a3b-instruct` 모델에 temperature 0.6을 사용하고, 한 번의 호출에서 출력 상한 2,600토큰으로 분석합니다. 답변에는 활동 근거 번호·과목 연결 이유·탐구 방법·소요 시간·결과물을 요청합니다. 모델 응답 시간 제한은 45초이며 공급자 오류 본문은 브라우저에 노출하지 않습니다.

근거 번호는 각 분석 요청 안에서 부여한 `R1`(활동), `T1`(교사 자료) 형태입니다. 응답에는 실제 분석 범위와 길이 제한 경고를 함께 반환합니다. 빈 응답은 성공으로 처리하지 않고, 실패 시 화면의 이전 결과를 유지합니다. 요청 횟수와 응답 길이를 늘리는 자동 재시도는 사용하지 않습니다.

2026-10-08 운영 프로젝트에는 `enable_student_ai_analysis_quota` 마이그레이션으로 요청 한도 테이블/함수만 적용했습니다. 아래 전체 보안 마이그레이션의 서비스 테이블 정책 교체는 별도 작업입니다. 새 환경에서는 기존 SQL의 `-- One locked row per user`부터 시작하는 한도 블록을 적용할 수 있습니다.

기존 NVIDIA-hosted Nemotron Super 49B v1/v1.5는 2026-08-26 제공이 종료되어 HTTP 410을 반환하므로 사용하지 않습니다. Qwen Instruct는 non-thinking 모델이므로 기존 Nemotron 전용 `/no_think` 지시는 제거했습니다. 410은 모델 종료 안내로 표시하며 자동 재시도하지 않습니다. 기존 `NVIDIA_API_KEY`와 API 주소를 사용합니다.

공식 참고: [NVIDIA 모델 종료 공지](https://nvidia.github.io/NeMo-Retriever/extraction/prerequisites-support-matrix/), [Qwen3-Next API 설정](https://docs.api.nvidia.com/nim/re/reference/qwen-qwen3-next-80b-a3b-instruct-infer).

## 기존 서비스에 적용하는 순서

이 저장소에는 실행할 코드와 SQL을 준비했습니다. 실제 Supabase·Vercel 관리 설정, 비밀키 교체 및 기존 Codespace의 미커밋 변경은 별도로 적용·확인해야 합니다.

1. **노출된 NVIDIA 키를 폐기하고 새 키를 발급합니다.** Vercel에도 새 값을 등록합니다. 삭제된 `.env*`는 이전 Git 커밋에 남으므로 파일 삭제만으로 키 노출이 해결되지 않습니다. 공개되어 있던 Vercel OIDC 토큰도 확인하고 재사용하지 않습니다.
2. 기존 Codespace에서 `git status`로 미커밋 작업을 확인하고 필요한 작업을 커밋 또는 별도 브랜치에 보관합니다. 그 뒤 수정 브랜치를 가져옵니다. 이 작업에서 기존 Codespace의 미저장 파일은 접근·동기화하지 않았습니다.
3. Supabase에서 현재 스키마·정책을 확인하고 백업합니다. 이미 서비스 테이블이 있는 환경에는 보안 마이그레이션 `20261006000000_security_and_ai_quota.sql`을 SQL Editor에서 적용할 수 있습니다. 이 SQL은 위 네 서비스 테이블의 기존 RLS 정책을 지정된 규칙으로 교체합니다. 테이블 이름과 소유자 컬럼이 위 구조와 일치해야 합니다.
4. 새 데이터베이스는 Supabase CLI의 `supabase db push`로 전체 마이그레이션을 순서대로 적용합니다. 기존 프로젝트에 새로 추가한 과거 시각의 baseline을 무작정 적용하지 마세요. CLI의 원격 migration 이력과 기존 스키마를 먼저 맞춰야 합니다. 선택과목의 `grade`는 현재 화면에서 `2학년` 같은 문자열로 저장합니다. 실제 DB가 정수 컬럼이면 백업 후 컬럼 타입을 맞춰야 합니다.
5. 기존 교사 계정 권한을 확인하고, 학생 2개·교사 1개 계정으로 타인의 기록 접근 차단과 자료 배정을 확인합니다. 적용된 한도 함수 및 RLS는 아래 쿼리로 조회할 수 있습니다.
6. Vercel의 **Root Directory는 기존 `student-research-platfrom`**을 유지합니다. Build Command는 `npm run build`, Output Directory는 `dist`입니다. `.env.example`에 적힌 환경변수를 등록하고, Supabase/Google의 허용 주소를 확인합니다. 별도 폴더 경로 변경은 필요하지 않습니다.
7. 수정 브랜치를 검토·병합한 뒤 배포하고 로그인·기록 저장·삭제·파일 선택·AI 분석을 확인합니다. DB 보안 SQL이 적용되지 않았으면 AI는 503으로 차단됩니다.

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in
  ('profiles','research_records','student_academic_profiles','teacher_shared_files','ai_analysis_quotas');
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public';
select to_regprocedure('public.consume_ai_analysis_quota()');
```

## 공식 참고 자료

- [Supabase: getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Google: 웹앱에 Picker 연결](https://developers.google.com/workspace/drive/picker/guides/web-picker)
- [Vercel: Vite 프로젝트](https://vercel.com/docs/frameworks/frontend/vite)

## 교사 학생 조회

교사 화면에서 학년·반·번호를 각각 선택하거나 비워둘 수 있습니다. 카드에는 이름과 학년·반·번호·학번을 표시하고, 클릭하면 이메일·선택과목·최근 활동 기록을 확인할 수 있습니다. 학번은 `10315 = 1학년 3반 15번` 형식을 사용합니다. 5자리 형식에 맞지 않는 학번은 필터를 비운 전체 목록에서 확인할 수 있습니다.

이 기능에는 기존 보안 SQL을 적용한 뒤 **`supabase/migrations/20261006001000_teacher_student_directory.sql`**도 실제 Supabase에 적용해야 합니다. 승인된 교사에게 학생 프로필·선택과목·활동 기록의 읽기 권한을 추가하며, 학생의 접근·수정 권한은 유지합니다. 학생 목록은 서버에서 필터링하고 30명씩 표시하며 상세 창은 최신 활동 20개를 표시합니다.

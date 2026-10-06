# Gothic · 활동 연결 노트

고등학생의 활동 기록과 선택과목, 교사 제공 자료를 모아 다음 탐구 방향을 정리하는 React 서비스입니다.

프로젝트 폴더는 **`student-research-platform`**입니다. 기존 `student-research-platfrom` 폴더는 이름을 바로잡았습니다.

```bash
npm run setup
cp student-research-platform/.env.example student-research-platform/.env.local
# .env.local에 실제 설정값 입력
npm run dev
```

Codespaces에서는 PORTS 탭의 **8000**번 포트를 열면 됩니다. 저장소 최상위에서 `npm run build`, `npm test`, `npm run lint`도 실행할 수 있습니다. Node.js 22.12 이상이 필요합니다.

서비스 구조, 데이터베이스 설정과 배포 절차는 [프로젝트 README](student-research-platform/README.md)에 있습니다. 실제 서비스로 적용하기 전에 [적용 순서](student-research-platform/README.md#기존-서비스에-적용하는-순서)를 확인하세요.

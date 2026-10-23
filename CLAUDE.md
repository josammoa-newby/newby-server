# Newby Server

사회초년생 대상 AI 직장 성장 코칭 앱의 백엔드 (Node.js / Express / TypeScript / Supabase / Gemini 2.5 Flash)

## 규칙

- 모든 API 는 /api 로 시작하고, 응답은 { success, data, error } 형태로 통일
- 환경변수는 .env 에서만 읽고 src/config 에서 검증 (키 없으면 서버 시작 시 에러)
- .env 와 API 키, Supabase 키는 절대 커밋하지 않음. .env.example 에 변수 이름만 둠
- 라우트 / 서비스 / 레포지토리 계층을 분리 (라우트에 DB 쿼리와 비즈니스 로직을 넣지 않음)
- 커밋 전에 npx tsc --noEmit 통과 필수
- 패키지는 npm 으로 설치하고, 설치한 패키지는 알려줌

## 브랜치

- main 직접 푸시 금지, feature/\* 브랜치에서 작업 후 PR
- 한 브랜치 = 한 기능. 범위를 넘는 작업은 하지 않음
- 커밋은 git add <파일> 로 지정해서 추가 (git add . 금지)

## 팀 협업 규칙

- 공유 파일(package.json, package-lock.json, src/routes/index.ts, docs/api.md, supabase/, .github/, CLAUDE.md)은 성찬만 수정한다. 다른 사람이 필요하면 수정하지 말고 요청한다.
- 패키지 설치가 필요하면 설치하지 말고 먼저 알려준다.
- 항상 최신 main에서 브랜치를 만들고, PR 전에 git merge main 한다.
- 새 기능은 새 파일에 만든다. 기존 파일은 꼭 필요한 부분만 최소한으로 수정한다.
- 한 브랜치 = 한 기능. git add는 파일을 지정해서 한다. git add . 금지.

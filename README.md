# Newby Server

사회초년생 대상 AI 직장 성장 코칭 앱의 백엔드 (Node.js / Express / TypeScript / Supabase / OpenAI gpt-6-luna)

## 실행 방법

```bash
npm install
cp .env.example .env   # 값을 채워 넣기
npm run dev            # 개발 서버 (tsx watch)
```

```bash
npm run build          # tsc 로 dist 에 빌드
npm start              # 빌드 결과 실행
npx tsc --noEmit       # 타입 검사 (커밋 전 필수)
```

### 환경변수 (.env)

| 이름 | 설명 |
| --- | --- |
| PORT | 서버 포트 (기본 3000) |
| SUPABASE_URL | Supabase 프로젝트 URL (필수) |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role 키 (필수) |
| OPENAI_API_KEY | OpenAI API 키 (AI 기능 사용 시. 없으면 AI 호출만 500 `AI_NOT_CONFIGURED`) |
| OPENAI_MODEL | OpenAI 모델 (선택, 기본 `gpt-6-luna`. 구조화 출력을 지원하는 모델이어야 함) |
| OPENAI_REASONING_EFFORT | reasoning.effort (선택, 기본 `low`. `none` `low` `medium` `high` `xhigh` `max`) |

필수 값이 없으면 서버 시작 시 에러가 납니다. `.env` 는 절대 커밋하지 않습니다.

### Render 환경변수 변경 (Gemini → OpenAI)

AI 를 Gemini 에서 OpenAI 로 바꿨습니다. 이미 만들어 둔 Render 서비스는 `render.yaml` 이 자동으로 반영되지 않으므로 대시보드 Environment 에서 직접 바꿉니다.

- 삭제: `GEMINI_API_KEY`, `GEMINI_MODEL`
- 추가: `OPENAI_API_KEY` (필수), `OPENAI_MODEL` (선택), `OPENAI_REASONING_EFFORT` (선택)

### AI 확인 스크립트

```bash
npm run ai:smoke                                   # 실제 호출 1회로 json_schema strict 응답 확인 (통과/실패, 지연 시간만 출력)
OPENAI_MODEL=gpt-6.1-terra npm run ai:smoke        # 다른 모델로 확인
npm run persona:eval -- --judge --interval 3000    # 페르소나 품질 평가 (케이스 x 상사 호출 + 평가자)
```

## API 규칙

- 모든 API 는 `/api` 로 시작합니다.
- 응답은 `{ success, data, error }` 형태로 통일합니다.

```json
{ "success": true, "data": { "status": "ok" }, "error": null }
{ "success": false, "data": null, "error": { "code": "NOT_FOUND", "message": "..." } }
```

- 응답은 `src/lib/response.ts` 의 `sendSuccess` / `sendError` 로 보내고, 의도된 에러는 `AppError` 를 던집니다.
- 없는 경로는 404, 처리되지 않은 에러는 500 (`INTERNAL_ERROR`) 으로 응답합니다.

### 엔드포인트

- `GET /api/health` → `{ "success": true, "data": { "status": "ok" }, "error": null }`

## 폴더 구조

```
src/
  index.ts        서버 시작
  app.ts          Express 앱
  config/         환경변수 검증
  routes/         라우트 (비즈니스 로직 금지)
  services/       비즈니스 로직
  lib/            Supabase 클라이언트, 응답 헬퍼
  middlewares/    에러 처리, 404
```

작업 규칙은 [CLAUDE.md](./CLAUDE.md) 를 따릅니다.

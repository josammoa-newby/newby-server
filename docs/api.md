# Newby Server API

- Base URL: `http://localhost:3000` (PORT 에 따라 다름)
- 모든 응답은 `{ success, data, error }` 형태입니다.
  - 성공: `{ "success": true, "data": ..., "error": null }`
  - 실패: `{ "success": false, "data": null, "error": { "code": "...", "message": "..." } }`

## 공통 에러

| status | code | 설명 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 요청 값 검증 실패 |
| 401 | UNAUTHORIZED | 토큰이 없거나 유효하지 않음 |
| 404 | NOT_FOUND | 없는 경로 |
| 500 | INTERNAL_ERROR | 서버 오류 |

## GET /api/auth/check-username

아이디 사용 가능 여부를 확인합니다. (대소문자 무시)

```powershell
Invoke-RestMethod "http://localhost:3000/api/auth/check-username?username=newby_01"
```

성공 (200)

```json
{ "success": true, "data": { "available": true }, "error": null }
```

실패 (400) — 형식 오류

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "아이디는 영문 소문자, 숫자, 언더스코어(_) 4~20자로 입력해주세요"
  }
}
```

## POST /api/auth/signup

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| name | O | 1~50자 |
| username | O | 영문 소문자 + 숫자 + `_`, 4~20자 |
| email | O | 이메일 형식 (소문자로 저장) |
| password | O | 8~72자 |
| marketingAgreed | | boolean, 기본 false |
| job / workStyle / bossStyle | | 문자열, 100자 이하 |

```powershell
$body = @{
  name = "홍길동"; username = "newby_01"; email = "newby@example.com"
  password = "password123"; marketingAgreed = $true
  job = "developer"; workStyle = "planner"; bossStyle = "supportive"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/signup" `
  -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

성공 (201)

```json
{
  "success": true,
  "data": { "user": { "id": "0b6f...", "username": "newby_01", "name": "홍길동" } },
  "error": null
}
```

실패

- 400 `VALIDATION_ERROR` — 예: `"비밀번호는 8자 이상 입력해주세요"`
- 409 `USERNAME_TAKEN` — `"이미 사용 중인 아이디예요"`
- 409 `EMAIL_TAKEN` — `"이미 가입된 이메일이에요"`

```json
{
  "success": false,
  "data": null,
  "error": { "code": "USERNAME_TAKEN", "message": "이미 사용 중인 아이디예요" }
}
```

## POST /api/auth/login

```powershell
$body = @{ username = "newby_01"; password = "password123" } | ConvertTo-Json
$res = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/login" `
  -ContentType "application/json" -Body $body
$token = $res.data.accessToken
```

성공 (200)

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "...",
    "user": { "id": "0b6f...", "username": "newby_01", "name": "홍길동" }
  },
  "error": null
}
```

실패 (401) — 아이디가 없든 비밀번호가 틀리든 동일한 응답입니다.

```json
{
  "success": false,
  "data": null,
  "error": { "code": "INVALID_CREDENTIALS", "message": "아이디 또는 비밀번호가 올바르지 않아요" }
}
```

## POST /api/auth/refresh

만료된 accessToken 을 새로 발급받습니다. Supabase 는 refresh token 을 회전시키므로, 응답의 새 `refreshToken` 으로 반드시 교체해서 저장하세요.

요청 body: `{ "refreshToken": "..." }`

```powershell
# login 으로 받은 $res.data.refreshToken 사용
$body = @{ refreshToken = $res.data.refreshToken } | ConvertTo-Json
$res = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/refresh" `
  -ContentType "application/json" -Body $body
$token = $res.data.accessToken
```

성공 (200) — login 응답과 같은 모양입니다.

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "...",
    "user": { "id": "0b6f...", "username": "newby_01", "name": "홍길동" }
  },
  "error": null
}
```

실패 (400) — body 가 없거나 `refreshToken` 이 비어 있거나 문자열이 아닌 경우

```json
{
  "success": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "refreshToken을 입력해주세요" }
}
```

실패 (401) — 만료되었거나 유효하지 않은 토큰입니다. 클라이언트는 로그인 화면으로 보내세요.

```json
{
  "success": false,
  "data": null,
  "error": { "code": "UNAUTHORIZED", "message": "세션이 만료됐어요. 다시 로그인해주세요" }
}
```

실패 (404) — 토큰은 유효하지만 프로필이 없는 경우 (`PROFILE_NOT_FOUND`)

```json
{
  "success": false,
  "data": null,
  "error": { "code": "PROFILE_NOT_FOUND", "message": "프로필을 찾을 수 없어요" }
}
```

참고: 회전 직후 약 10초간은 이전 refreshToken 도 허용될 수 있습니다 (Supabase 설정).

## GET /api/auth/me

`Authorization: Bearer <accessToken>` 헤더가 필요합니다.

```powershell
Invoke-RestMethod "http://localhost:3000/api/auth/me" `
  -Headers @{ Authorization = "Bearer $token" }
```

성공 (200)

```json
{
  "success": true,
  "data": {
    "id": "0b6f...",
    "username": "newby_01",
    "name": "홍길동",
    "email": "newby@example.com",
    "job": "developer",
    "workStyle": "planner",
    "bossStyle": "supportive",
    "marketingAgreed": true,
    "createdAt": "2026-10-22T09:00:00.000Z"
  },
  "error": null
}
```

실패 (401)

```json
{
  "success": false,
  "data": null,
  "error": { "code": "UNAUTHORIZED", "message": "로그인이 필요해요" }
}
```

## PATCH /api/me

내 프로필을 부분 수정합니다. `Authorization: Bearer <accessToken>` 헤더가 필요하고, 항상 토큰의 사용자 본인 프로필만 수정됩니다.

보낸 필드만 수정되며 최소 1개는 있어야 합니다. 아래 목록에 없는 필드(`id`, `username`, `email`, `password` 등)가 하나라도 있으면 400 입니다.

| 필드 | 규칙 |
| --- | --- |
| name | 1~50자 (공백은 앞뒤 제거) |
| job / workStyle / bossStyle | 문자열 100자 이하. `null` 또는 빈 문자열이면 값을 비웁니다 |
| marketingAgreed | boolean |

```powershell
$body = @{ name = "김뉴비"; job = "developer" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "http://localhost:3000/api/me" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" -Body $body
```

성공 (200) — login 의 `user` 와 같은 모양입니다. 수정된 전체 프로필은 `GET /api/auth/me` 로 확인하세요.

```json
{
  "success": true,
  "data": { "id": "0b6f...", "username": "newby_01", "name": "김뉴비" },
  "error": null
}
```

실패 (400) — 빈 body, 수정할 수 없는 필드, 값 검증 실패

```json
{
  "success": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "수정할 수 없는 항목이에요: username" }
}
```

실패 (401)

```json
{
  "success": false,
  "data": null,
  "error": { "code": "UNAUTHORIZED", "message": "로그인이 필요해요" }
}
```

실패 (404) — 토큰은 유효하지만 프로필이 없는 경우

```json
{
  "success": false,
  "data": null,
  "error": { "code": "PROFILE_NOT_FOUND", "message": "프로필을 찾을 수 없어요" }
}
```

## GET /api/persona/questions

`Authorization: Bearer <accessToken>` 헤더가 필요합니다. 상사 성향 질문지를 돌려줍니다. 채점 정보(축, 역채점, 점수)는 포함되지 않습니다.

| 쿼리 | 설명 |
| --- | --- |
| mode | `quick`(기본, 12문항) 또는 `full`(28문항). 그 외 값은 400 |

```powershell
Invoke-RestMethod "http://localhost:3000/api/persona/questions?mode=quick" `
  -Headers @{ Authorization = "Bearer $token" }
```

성공 (200) — 리커트 문항은 `{ id, text }`(1~5 정수로 응답), 상황형 문항은 `options`가 있고 `key`(`a`~`d`)로 응답합니다.

```json
{
  "success": true,
  "data": [
    { "id": "L1", "text": "마음에 안 드는 게 있으면 그 자리에서 바로 말한다" },
    {
      "id": "S1",
      "text": "네가 낸 기획안이 별로일 때 상사 반응은?",
      "options": [
        { "key": "a", "text": "\"이건 방향이 틀렸어\"라고 바로 말한다" },
        { "key": "b", "text": "좋은 점을 먼저 말하고 고칠 점을 말한다" }
      ]
    }
  ],
  "error": null
}
```

실패 (400) — `mode` 가 `quick`/`full` 이 아닌 경우 (`VALIDATION_ERROR`)

## POST /api/supervisors

상사를 등록합니다. 사용자의 첫 상사는 자동으로 기본 상사(`isDefault: true`)가 됩니다. `Authorization: Bearer <accessToken>` 헤더가 필요합니다.

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| nickname | O | 1~20자 |
| answers | O | 문항 id → 값. 리커트 1~5 정수, 상황형 `a`~`d`. `mode` 의 필수 문항이 모두 있어야 합니다 |
| mode | | `quick`(기본) / `full` |
| channel | | `messenger`(기본) / `face` / `email` |
| position | | 50자 이하 |
| catchphrases | | 문자열 배열, 3개 이하, 각 30자 이하 |
| angerSignals / happySignals / dislikes / valuesText | | 각 300자 이하 |
| examples | | `{ said, meant }` 배열, 3개 이하, 각 200자 이하 |

이 목록에 없는 필드(`id`, `user_id`, `scores` 등)가 있으면 400 입니다.

```powershell
$body = @{
  nickname = "김팀장"; position = "팀장"; channel = "messenger"; mode = "quick"
  answers = @{ L1 = 5; L2 = 1; L5 = 5; L6 = 1; L9 = 5; L10 = 1; L13 = 1; L14 = 5; S1 = "a"; S2 = "a"; S3 = "a"; S4 = "a" }
  catchphrases = @("그래서 결론이 뭐야?")
  examples = @(@{ said = "한번 검토해보자"; meant = "고치라는 뜻" })
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/supervisors" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
```

성공 (201) — 상사 상세 (아래 `GET /api/supervisors/:id` 와 같은 모양)

실패 (400) — 누락된 문항이 있으면 문항 id 를 메시지에 모두 알려줍니다.

```json
{
  "success": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "응답하지 않은 문항이 있어요: L1, S4" }
}
```

## GET /api/supervisors/:id

`Authorization: Bearer <accessToken>` 헤더가 필요합니다. 내 상사만 조회됩니다.

성공 (200)

```json
{
  "success": true,
  "data": {
    "id": "5b1c...",
    "nickname": "김팀장",
    "position": "팀장",
    "channel": "messenger",
    "mode": "quick",
    "code": "DCRT",
    "typeName": "레이더형 팀장",
    "scores": {
      "directness": { "score": 80, "letter": "D", "strength": "strong", "consistency": 0.95 },
      "control": { "score": 90, "letter": "C", "strength": "strong", "consistency": 0.95 },
      "reporting": { "score": 90, "letter": "R", "strength": "strong", "consistency": 0.95 },
      "warmth": { "score": 90, "letter": "T", "strength": "strong", "consistency": 0.95 },
      "speed": null,
      "stability": null
    },
    "needsCheck": [],
    "topRules": ["말을 돌리지 않는다. ...", "진행 상황을 수시로 알고 싶어한다. ...", "결론부터 말해야 한다. ..."],
    "catchphrases": ["그래서 결론이 뭐야?"],
    "angerSignals": null,
    "happySignals": null,
    "dislikes": null,
    "valuesText": null,
    "examples": [{ "said": "한번 검토해보자", "meant": "고치라는 뜻" }],
    "learnedNotes": [],
    "isDefault": true,
    "createdAt": "2026-10-24T09:00:00.000Z",
    "updatedAt": "2026-10-24T09:00:00.000Z"
  },
  "error": null
}
```

- `scores` 는 보정값(`score_adjust`)이 있으면 적용한 값입니다. 측정되지 않은 축(빠른 모드의 `speed`, `stability`)은 `null` 입니다.
- `needsCheck` 는 응답이 엇갈려(`consistency < 0.5`) 확인이 필요한 축 이름 배열입니다.
- `topRules` 는 뚜렷한 축(`strong`)의 행동 규칙을 우선 최대 3개, 부족하면 약한 축(`mild`)으로 채웁니다. 조합 규칙은 제외됩니다.

실패 (404) — 없는 id, 남의 상사, 잘못된 id 형식은 모두 같은 응답입니다.

```json
{
  "success": false,
  "data": null,
  "error": { "code": "SUPERVISOR_NOT_FOUND", "message": "상사 정보를 찾을 수 없어요" }
}
```

## GET /api/supervisors

`Authorization: Bearer <accessToken>` 헤더가 필요합니다. 내 상사 목록을 최신순으로 돌려줍니다.

성공 (200)

```json
{
  "success": true,
  "data": [
    {
      "id": "5b1c...",
      "nickname": "김팀장",
      "position": "팀장",
      "channel": "messenger",
      "code": "DCRT",
      "typeName": "레이더형 팀장",
      "isDefault": true,
      "createdAt": "2026-10-24T09:00:00.000Z"
    }
  ],
  "error": null
}
```

## PATCH /api/supervisors/:id

내 상사를 부분 수정합니다. `Authorization: Bearer <accessToken>` 헤더가 필요하고, 보낸 필드만 수정됩니다.

| 필드 | 규칙 |
| --- | --- |
| nickname / position / channel | `POST` 와 같음. `position` 은 `null` 로 비울 수 있음 |
| catchphrases / angerSignals / happySignals / dislikes / valuesText / examples | `POST` 와 같음. `null`/빈 문자열/빈 배열로 비울 수 있음 |
| answers | 기존 `answers` 에 문항 id 단위로 병합. 병합 결과를 검증한 뒤 다시 채점합니다 |
| mode | `quick` → `full` 승격만 가능. `full` → `quick` 은 400 |

- `answers` 나 `mode` 가 바뀌면 `scores`, `code` 를 다시 계산합니다. 보정값(`score_adjust`)은 유지됩니다.
- `quick` → `full` 로 올릴 때는 빠진 문항(`L3` 등)의 응답을 `answers` 에 같이 보내야 합니다.
- 허용 목록 밖 필드(`id`, `user_id` 등)와 빈 body 는 400 입니다.

```powershell
$body = @{ nickname = "박팀장"; angerSignals = "말수가 줄어든다" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "http://localhost:3000/api/supervisors/$id" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
```

성공 (200) — 수정된 상사 상세 (`GET /api/supervisors/:id` 와 같은 모양)

실패 (400)

```json
{
  "success": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "정밀 모드에서 빠른 모드로 되돌릴 수 없어요" }
}
```

실패 (401) — 위 모든 엔드포인트에서 토큰이 없거나 유효하지 않은 경우

```json
{
  "success": false,
  "data": null,
  "error": { "code": "UNAUTHORIZED", "message": "로그인이 필요해요" }
}
```

실패 (404) — `SUPERVISOR_NOT_FOUND` (위와 같은 응답)

## POST /api/sessions

내 상사와의 AI 상담 세션을 만들고, AI 첫 인사 메시지를 함께 돌려줍니다. `Authorization: Bearer <accessToken>` 헤더가 필요합니다.

요청 body: `{ "supervisorId": "5b1c..." }`

```powershell
$body = @{ supervisorId = $supervisorId } | ConvertTo-Json
$res = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/sessions" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
$sessionId = $res.data.session.id
```

성공 (201)

```json
{
  "success": true,
  "data": {
    "session": { "id": "9fba...", "supervisorId": "5b1c...", "title": "김팀장 상담", "createdAt": "2026-10-24T09:00:00.000Z" },
    "messages": [
      {
        "id": "3ccd...",
        "role": "ai",
        "text": "김팀장이랑 무슨 일 있었어? 상사가 한 말 그대로 적어주면 더 정확해!",
        "payload": null,
        "createdAt": "2026-10-24T09:00:00.000Z"
      }
    ]
  },
  "error": null
}
```

실패 (400) — `supervisorId` 가 없거나 문자열이 아닌 경우 (`VALIDATION_ERROR`)

실패 (404) — 내 상사가 아니거나 없는 상사, 잘못된 id 형식 (`SUPERVISOR_NOT_FOUND`)

## POST /api/sessions/:id/messages

상황을 입력하면 상사 프로필(성향 규칙, 사용자가 알려준 정보, 학습 메모)과 최근 대화 10개를 바탕으로 AI 가 답합니다. `Authorization: Bearer <accessToken>` 헤더가 필요하고, 사용자당 분당 10회로 제한됩니다.

요청 body: `{ "text": "보고서 냈더니 상사가 '음, 한번 더 검토해보자'라고 했어" }` — 앞뒤 공백을 제거한 뒤 1~1000자

성공 (200) — `aiMessage.text` 는 `intent` 와 `recommended_action` 을 한 줄씩 이은 요약이고, 전체 답변은 `aiMessage.payload` 에 있습니다.

```json
{
  "success": true,
  "data": {
    "userMessage": { "id": "a1...", "role": "user", "text": "보고서 냈더니 ...", "payload": null, "createdAt": "2026-10-24T09:01:00.000Z" },
    "aiMessage": {
      "id": "b2...",
      "role": "ai",
      "text": "실제로 다시 검토해보라는 뜻이야.\n지적받은 부분을 수정해서 다시 보고해.",
      "payload": {
        "intent": "실제로 다시 검토해보라는 뜻이야.",
        "confidence": "high",
        "persona_basis": ["D 직설형: 표현을 그대로 받아들여도 됨"],
        "recommended_action": "지적받은 부분을 수정해서 다시 보고해.",
        "suggested_message": "넵, 수정해서 다시 드리겠습니다!",
        "avoid": "변명을 길게 늘어놓기",
        "follow_up_question": null,
        "safety_flag": false
      },
      "createdAt": "2026-10-24T09:01:08.000Z"
    }
  },
  "error": null
}
```

| payload 필드 | 설명 |
| --- | --- |
| intent | 상사의 말이나 상황에 담긴 의도 해석 |
| confidence | `high` / `medium` / `low` |
| persona_basis | 해석에 사용한 성향/정보 (문자열 배열, 1개 이상) |
| recommended_action | 지금 하면 좋은 행동 |
| suggested_message | 주 소통 채널에 맞춰 그대로 보낼 수 있는 문장 |
| avoid | 피해야 할 행동이나 표현 (문자열) |
| follow_up_question | 정확도를 높이기 위한 되묻기 질문. 없으면 `null` |
| safety_flag | 직장 내 괴롭힘 등 안전 이슈가 의심되면 `true` |

실패

| status | code | 설명 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | `text` 가 비어 있거나 1000자 초과 |
| 404 | SESSION_NOT_FOUND | 내 세션이 아니거나 없는 세션, 잘못된 id 형식 |
| 404 | SUPERVISOR_NOT_FOUND | 세션에 연결된 상사가 없거나 삭제됨 |
| 429 | RATE_LIMITED | 분당 10회 초과 |
| 500 | AI_NOT_CONFIGURED | 서버에 Gemini 키가 설정되지 않음 |
| 502 | AI_UNAVAILABLE | Gemini 호출 실패 또는 30초 초과 |
| 502 | AI_RESPONSE_INVALID | AI 응답이 형식에 맞지 않아 1회 재시도했지만 실패 |

`AI_UNAVAILABLE`, `AI_RESPONSE_INVALID` 일 때도 사용자의 메시지는 저장된 상태로 남습니다. 같은 문장을 다시 보내면 사용자 메시지가 중복 저장됩니다.

## GET /api/sessions/:id

`Authorization: Bearer <accessToken>` 헤더가 필요합니다. 내 세션의 정보와 메시지를 시간순으로 돌려줍니다.

성공 (200)

```json
{
  "success": true,
  "data": {
    "session": { "id": "9fba...", "supervisorId": "5b1c...", "title": "김팀장 상담", "createdAt": "2026-10-24T09:00:00.000Z" },
    "messages": [
      { "id": "3ccd...", "role": "ai", "text": "김팀장이랑 무슨 일 있었어? ...", "payload": null, "createdAt": "..." },
      { "id": "a1...", "role": "user", "text": "보고서 냈더니 ...", "payload": null, "createdAt": "..." },
      { "id": "b2...", "role": "ai", "text": "실제로 다시 검토해보라는 뜻이야.\n...", "payload": { "intent": "..." }, "createdAt": "..." }
    ]
  },
  "error": null
}
```

실패 (404) — 내 세션이 아니거나 없는 세션, 잘못된 id 형식 (`SESSION_NOT_FOUND`)

실패 (401) — 위 모든 엔드포인트에서 토큰이 없거나 유효하지 않은 경우 (`UNAUTHORIZED`)

## 인증이 필요한 다른 API 에서 재사용

```ts
import { requireAuth } from '../middlewares/auth.js';

router.get('/something', requireAuth, async (req, res) => {
  const userId = req.user!.id;
});
```

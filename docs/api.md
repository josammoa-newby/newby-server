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

## GET /api/me/stats

`Authorization: Bearer <accessToken>` 헤더가 필요합니다. 경험치, 직급(레벨), 연속 기록을 돌려줍니다. 아직 경험치가 없으면 `xp: 0`, `level: 1` 입니다.

```powershell
Invoke-RestMethod "http://localhost:3000/api/me/stats" -Headers @{ Authorization = "Bearer $token" }
```

성공 (200)

```json
{
  "success": true,
  "data": {
    "xp": 120,
    "level": 2,
    "title": "사원",
    "currentLevelXp": 50,
    "nextLevelXp": 150,
    "progress": 70,
    "streak": 3,
    "lastActiveDate": "2026-11-12"
  },
  "error": null
}
```

| 필드 | 설명 |
| --- | --- |
| xp | 누적 경험치 |
| level / title | 직급. 1 신입(0), 2 사원(50), 3 주임(150), 4 대리(300), 5 과장(500), 6 차장(800), 7 부장(1200) (괄호는 시작 경험치) |
| currentLevelXp / nextLevelXp | 현재 직급 시작 경험치 / 다음 직급 경험치. 최고 직급이면 `nextLevelXp` 는 `null` |
| progress | 다음 직급까지 진행률 0~100. 최고 직급이면 100 |
| streak | 연속 기록 일수. 어제도 오늘도 활동이 없으면 0 |
| lastActiveDate | 마지막으로 활동한 날 `YYYY-MM-DD` (없으면 `null`) |

경험치는 일기 작성(하루 첫 일기 +10)과 미션 완료(미션마다 xp)로 오르고, 되돌리면 같은 만큼 내려갑니다.

실패 (401) — 토큰이 없거나 유효하지 않은 경우 (`UNAUTHORIZED`)

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
    "recentAdjustments": [{ "axis": "directness", "dir": -1, "createdAt": "2026-10-24T10:00:00.000Z" }],
    "isDefault": true,
    "createdAt": "2026-10-24T09:00:00.000Z",
    "updatedAt": "2026-10-24T09:00:00.000Z"
  },
  "error": null
}
```

- `scores` 는 보정값(`score_adjust`)이 있으면 적용한 값입니다. 측정되지 않은 축(빠른 모드의 `speed`, `stability`)은 `null` 입니다.
- `needsCheck` 는 응답이 엇갈려(`consistency < 0.5`) 확인이 필요한 축 이름 배열입니다.
- `recentAdjustments` 는 피드백(`POST /api/messages/:id/feedback`)으로 점수가 보정된(`applied`) 피드백 중 최근 3개의 `{ axis, dir, createdAt }` 입니다. `dir` 은 점수가 이동한 방향(`1` 또는 `-1`)이고, 없으면 빈 배열입니다. 결과 카드에 "최근 피드백으로 조금 더 돌려말형으로 바뀌었어요" 같은 안내를 보여줄 때 쓰세요.
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
| 500 | AI_NOT_CONFIGURED | 서버에 OpenAI 키가 설정되지 않음 (`OPENAI_REASONING_EFFORT` 값이 올바르지 않을 때도) |
| 502 | AI_UNAVAILABLE | OpenAI 호출 실패 또는 30초 초과 |
| 502 | AI_RESPONSE_INVALID | AI 응답이 형식에 맞지 않아 1회 재시도했지만 실패, 또는 모델이 답변을 거절(refusal)함 (거절은 재시도하지 않음) |

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

## POST /api/messages/:id/feedback

AI 답변 카드의 👍/👎 피드백을 남깁니다. `:id` 는 AI 답변 메시지(`aiMessage.id`)입니다. `Authorization: Bearer <accessToken>` 헤더가 필요하고, 사용자당 분당 10회로 제한됩니다.

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| helpful | O | boolean. 👍 `true`, 👎 `false` |
| actualReaction | | 실제 상사 반응. 앞뒤 공백을 제거한 뒤 500자 이하. `helpful: true` 이면 무시됩니다 |

```powershell
$body = @{ helpful = $false; actualReaction = "그냥 말 그대로 한 번 같이 보자는 뜻이었어" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/messages/$messageId/feedback" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
```

처리

- 메시지당 피드백은 1번만 남길 수 있습니다.
- 👍: 저장만 합니다.
- 👎 + `actualReaction`: AI 가 이 상사에 대해 새로 알게 된 사실(`newNote`)과 AI 해석이 틀린 성향 축(`axisHint`)을 뽑습니다.
  - `newNote` 는 상사의 학습 메모(`learnedNotes`)에 추가됩니다. 최대 10개이고, 넘으면 가장 오래된 5개를 1~2문장으로 합칩니다. 합치기가 실패하면 가장 오래된 것부터 버립니다.
  - 같은 축, 같은 방향(`dir`)의 `axisHint` 가 2번 쌓이면 그 축의 점수가 `dir × 10` 만큼 보정되고(최종 점수는 -100~100 범위), 그 2개 피드백은 반영됨(`applied`)으로 바뀝니다. 이때 응답의 `scoreAdjusted` 에 값이 들어옵니다.
- AI 호출이 실패하거나 응답이 올바르지 않아도 피드백은 저장되고 200 으로 응답합니다. 이때 `newNote`, `axisHint`, `scoreAdjusted` 는 `null` 입니다.
- 빠른 모드로 만든 상사의 `speed`, `stability` 처럼 측정되지 않은 축은 보정되지 않습니다.

성공 (200)

```json
{
  "success": true,
  "data": {
    "id": "7d3e...",
    "helpful": false,
    "newNote": "이 상사는 '검토해보자'를 정말 같이 보자는 뜻으로 쓴다",
    "axisHint": { "axis": "directness", "dir": 1 },
    "scoreAdjusted": null
  },
  "error": null
}
```

| 필드 | 설명 |
| --- | --- |
| id | 피드백 id |
| helpful | 보낸 값 |
| newNote | 학습 메모에 추가된 문장. 없으면 `null` |
| axisHint | AI 가 알려준 `{ axis, dir }`. `axis` 는 `directness`/`control`/`reporting`/`warmth`/`speed`/`stability`, `dir` 은 `1` 또는 `-1`(점수가 이동해야 하는 방향). 없으면 `null` |
| scoreAdjusted | 이번 피드백으로 점수가 보정되었으면 `{ axis, dir }`, 아니면 `null` |

실패

| status | code | 설명 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | `helpful` 이 boolean 이 아님, `actualReaction` 이 문자열이 아니거나 500자 초과 |
| 401 | UNAUTHORIZED | 토큰이 없거나 유효하지 않음 |
| 404 | MESSAGE_NOT_FOUND | 내 세션의 AI 답변 메시지가 아님 (없는 id, 남의 메시지, 사용자 메시지, 첫 인사 메시지, 잘못된 id 형식) |
| 404 | SUPERVISOR_NOT_FOUND | 세션에 연결된 상사가 없거나 삭제됨 |
| 409 | FEEDBACK_ALREADY_EXISTS | 이 메시지에는 이미 피드백이 있음 |
| 429 | RATE_LIMITED | 분당 10회 초과 |

## 일기 (diaries)

모든 일기 API 는 `Authorization: Bearer <accessToken>` 헤더가 필요하고, 항상 토큰의 사용자 본인 일기만 다룹니다. 남의 일기나 없는 일기, 잘못된 id 형식은 모두 404 `DIARY_NOT_FOUND` 입니다. 날짜는 `YYYY-MM-DD` 입니다.

일기 객체

```json
{
  "id": "6f2a...",
  "date": "2026-11-12",
  "content": "오늘은 처음으로 회의에서 의견을 말했다. 긴장했지만 끝나고 나니 뿌듯했다.",
  "mood": "뿌듯",
  "source": "manual",
  "messageId": null,
  "createdAt": "2026-11-12T00:00:00.000Z",
  "updatedAt": "2026-11-12T00:00:00.000Z",
  "analysis": null
}
```

`analysis` 는 AI 분석 결과이고, 아직 분석하지 않았거나 `content`/`mood` 가 수정돼 비워졌으면 `null` 입니다. 모양은 아래 `POST /api/diaries/:id/analyze` 를 보세요. 분석을 저장하면 `updatedAt` 도 함께 갱신됩니다.

### POST /api/diaries

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| content | O | 앞뒤 공백 제거 후 1~2000자 |
| date | | `YYYY-MM-DD`. 없으면 한국 시간 기준 오늘 |
| mood | | 20자 이하 문자열. 빈 문자열이면 `null` |
| source | | `manual`(기본) 또는 `ai_message` |
| messageId | source 가 `ai_message` 일 때 O | AI 답변 메시지 id (uuid) |

```powershell
$body = @{ content = "오늘은 처음으로 회의에서 의견을 말했다. 긴장했지만 끝나고 나니 뿌듯했다."; mood = "뿌듯" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/diaries" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json; charset=utf-8" `
  -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

성공 (201) — 일기 객체에 `reward` 가 더해집니다. 그날 첫 일기면 경험치 +10 지급 결과(`{ stats, gainedXp, leveledUp }`, `stats` 는 `GET /api/me/stats` 와 같은 모양)이고, 아니면 `null` 입니다.

실패 (400) — 값 검증 실패 (`VALIDATION_ERROR`)

### GET /api/diaries

| 쿼리 | 설명 |
| --- | --- |
| from / to | 날짜 범위 (포함). `from` 이 `to` 보다 이후면 400 |
| limit | 1~100, 기본 30 |

성공 (200) — 일기 객체 배열. 날짜 내림차순이고, 같은 날은 최근에 쓴 것이 먼저입니다.

### GET /api/diaries/:id

성공 (200) — 일기 객체. 실패 (404) `DIARY_NOT_FOUND`

### PATCH /api/diaries/:id

보낸 필드(`date`, `content`, `mood`)만 수정되고 최소 1개는 있어야 합니다. 규칙은 작성과 같습니다. `mood` 에 `null` 이나 빈 문자열을 보내면 지웁니다.

**`content` 나 `mood` 의 값이 실제로 바뀌면 `analysis` 가 `null` 로 초기화됩니다.** 같은 값을 다시 보내거나 `date` 만 바꾸면 분석이 유지됩니다.

성공 (200) — 수정된 일기 객체. 실패 (400) `VALIDATION_ERROR`, (404) `DIARY_NOT_FOUND`

### DELETE /api/diaries/:id

성공 (200) — `{ "id": "..." }`. 그날 일기가 하나도 안 남으면 첫 일기 경험치(-10)가 되돌려집니다. 실패 (404) `DIARY_NOT_FOUND`

### POST /api/diaries/:id/analyze

일기를 AI 가 분석해서 성장 방향을 돌려줍니다. 사용자당 분당 10회로 제한되고, 저장된 분석을 그대로 돌려주는 요청도 횟수에 포함됩니다.

- 이미 `analysis` 가 있으면(일기가 그대로라는 뜻) AI 를 부르지 않고 저장된 값을 돌려줍니다. (`reused: true`)
- 요청 본문 `{ "force": true }` 를 보내면 저장된 분석이 있어도 다시 분석합니다. 본문은 생략할 수 있고, `force` 는 boolean 이어야 합니다.
- 앞뒤 공백을 뺀 일기가 20자 미만이면 분석하지 않고 400 `DIARY_TOO_SHORT` 입니다.
- 분석에는 일기 `content`, `mood` 와 프로필의 직무(`job`), 일하는 방식(`workStyle`)이 쓰입니다. 일기 원문과 분석 결과는 서버 로그에 남기지 않습니다.

```powershell
$res = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/diaries/$diaryId/analyze" `
  -Headers @{ Authorization = "Bearer $token" }
$res.data.analysis
```

성공 (200)

```json
{
  "success": true,
  "data": {
    "id": "6f2a...",
    "analysis": {
      "summary": "회의에서 처음으로 의견을 말해 뿌듯했던 하루예요.",
      "emotion": "뿌듯함",
      "strengths": ["긴장 속에서도 의견을 말했어요"],
      "growthPoints": ["회의 전에 핵심 한 줄을 정리해 보세요"],
      "nextStep": "내일 회의 전에 하고 싶은 말을 한 줄로 적어 보세요.",
      "safetyFlag": false,
      "model": "gpt-6-luna",
      "generatedAt": "2026-11-12T01:25:05.000Z"
    },
    "reused": false
  },
  "error": null
}
```

| analysis 필드 | 설명 |
| --- | --- |
| summary | 일기 요약 1~2문장 |
| emotion | 핵심 감정 한 단어 |
| strengths | 오늘 잘한 점 1~3개 (`safetyFlag` 가 true 면 0~3개) |
| growthPoints | 내일 더 성장할 수 있는 방향 1~3개 (`safetyFlag` 가 true 면 0~3개) |
| nextStep | 내일 해볼 작은 행동 한 가지 |
| safetyFlag | 자해·자살·심각한 괴롭힘 등이 언급되면 `true` |
| model | 분석에 쓴 모델 |
| generatedAt | 분석을 저장한 시각 |

`safetyFlag` 가 `true` 면 `strengths`, `growthPoints` 는 짧은 지지 문구 중심이거나 비어 있고, `nextStep` 뒤에 서버가 고정 안내 문구("혼자 감당하기 어렵다면 자살예방 상담전화 109(24시간)나 가까운 전문 상담 기관에 꼭 이야기해 보세요.")를 붙입니다. 이 문구는 모델이 아니라 서버가 붙입니다.

| status | code | 설명 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | `force` 가 boolean 이 아니거나 본문이 올바르지 않음 |
| 400 | DIARY_TOO_SHORT | 일기가 20자 미만 |
| 401 | UNAUTHORIZED | 토큰이 없거나 유효하지 않음 |
| 404 | DIARY_NOT_FOUND | 내 일기가 아니거나 없는 일기, 잘못된 id 형식 (분석 도중 삭제된 경우도 포함) |
| 409 | DIARY_CHANGED | 분석하는 동안 일기의 `content`/`mood` 가 수정됨. 오래된 분석은 저장하지 않으니 다시 요청 |
| 429 | RATE_LIMITED | 분당 10회 초과 |
| 500 | AI_NOT_CONFIGURED | 서버에 OpenAI 키가 설정되지 않음 |
| 502 | AI_UNAVAILABLE | OpenAI 호출 실패 또는 30초 초과 |
| 502 | AI_RESPONSE_INVALID | AI 응답이 규칙에 맞지 않아 1회 재시도했지만 실패, 또는 모델이 답변을 거절함 |

## 미션 (missions)

모든 미션 API 는 `Authorization: Bearer <accessToken>` 헤더가 필요하고, 본인 미션만 다룹니다. 없는 미션이나 잘못된 id 형식은 404 `MISSION_NOT_FOUND` 입니다.

미션 객체: `{ "id": "...", "date": "2026-11-12", "title": "...", "done": false, "xp": 10, "createdAt": "..." }`

### GET /api/missions

| 쿼리 | 설명 |
| --- | --- |
| date | `YYYY-MM-DD`. 없으면 한국 시간 기준 오늘 |

날짜별 미션을 돌려줍니다. **오늘(한국 시간) 미션이 하나도 없으면 서버가 기본 미션 3개(각 xp 10)를 만들어 줍니다.** 지난 날짜나 미래 날짜는 만들지 않고 빈 배열을 돌려줍니다.

성공 (200)

```json
{
  "success": true,
  "data": {
    "date": "2026-11-12",
    "missions": [
      { "id": "...", "date": "2026-11-12", "title": "출근 후 오늘 할 일 3가지 적어보기", "done": false, "xp": 10, "createdAt": "..." }
    ],
    "doneCount": 0,
    "total": 3
  },
  "error": null
}
```

미션은 만든 시각 순이며, 한 번에 만든 미션(기본 미션 등)은 시각이 같아 순서가 바뀔 수 있습니다.

실패 (400) — `date` 형식 오류 (`VALIDATION_ERROR`)

### POST /api/missions

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| title | O | 앞뒤 공백 제거 후 1~100자 |
| xp | | 1~100 정수, 기본 10 |
| date | | `YYYY-MM-DD`, 기본 한국 시간 기준 오늘 |

성공 (201) — 미션 객체. 실패 (400) `VALIDATION_ERROR`

### PATCH /api/missions/:id

요청 body: `{ "done": true }` (boolean 필수). 완료로 체크하면 미션의 xp 만큼 경험치가 오르고, 해제하면 같은 만큼 내려갑니다. 이미 같은 값이면 경험치는 바뀌지 않습니다(체크/해제를 반복해도 경험치를 쌓을 수 없습니다).

성공 (200)

```json
{
  "success": true,
  "data": {
    "mission": { "id": "...", "date": "2026-11-12", "title": "...", "done": true, "xp": 10, "createdAt": "..." },
    "changed": true,
    "reward": { "stats": { "xp": 10, "level": 1, "title": "신입", "currentLevelXp": 0, "nextLevelXp": 50, "progress": 20, "streak": 1, "lastActiveDate": "2026-11-12" }, "gainedXp": 10, "leveledUp": false }
  },
  "error": null
}
```

`changed` 는 `done` 값이 실제로 바뀌었는지이고, 바뀌지 않았으면 `reward` 는 `null` 입니다. 실패 (400) `VALIDATION_ERROR`, (404) `MISSION_NOT_FOUND`

### DELETE /api/missions/:id

성공 (200) — `{ "id": "..." }`. 실패 (404) `MISSION_NOT_FOUND`

## 인증이 필요한 다른 API 에서 재사용

```ts
import { requireAuth } from '../middlewares/auth.js';

router.get('/something', requireAuth, async (req, res) => {
  const userId = req.user!.id;
});
```

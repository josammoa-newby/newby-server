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

## 인증이 필요한 다른 API 에서 재사용

```ts
import { requireAuth } from '../middlewares/auth.js';

router.get('/something', requireAuth, async (req, res) => {
  const userId = req.user!.id;
});
```

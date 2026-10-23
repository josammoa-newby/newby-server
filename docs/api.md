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

## 인증이 필요한 다른 API 에서 재사용

```ts
import { requireAuth } from '../middlewares/auth.js';

router.get('/something', requireAuth, async (req, res) => {
  const userId = req.user!.id;
});
```

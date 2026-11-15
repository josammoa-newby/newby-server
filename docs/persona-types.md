<!-- 이 문서는 src 의 scoring 등 코드를 기준으로 정리한 것이며, 코드가 바뀌면 이 문서도 갱신해야 한다. -->

# 상사 유형 판정 기준

근거 파일: [src/persona/questions.ts](../src/persona/questions.ts), [src/persona/scoring.ts](../src/persona/scoring.ts), [src/persona/rules.ts](../src/persona/rules.ts), [src/persona/topRules.ts](../src/persona/topRules.ts), [src/persona/types.ts](../src/persona/types.ts), [src/services/feedbackFlow.ts](../src/services/feedbackFlow.ts), [src/ai/feedback.ts](../src/ai/feedback.ts), [src/services/supervisorMapper.ts](../src/services/supervisorMapper.ts)

## 1. 개요

사용자가 상사에 대해 질문지에 답한다. 빠른 모드(`quick`)는 12문항(리커트 8 + 상황형 4), 정밀 모드(`full`)는 28문항(리커트 24 + 상황형 4)이다. 응답은 축별로 모아 -100~100 점수로 바뀐다. 리커트는 `(응답-3)×50` 으로, 상황형은 보기별 고정 점수로 바꾸고, 가중 평균을 반올림한 값이 축 점수다. 점수의 부호로 축 글자(letter)가 정해지고, 절댓값으로 강도(strength)가, 응답이 엇갈리는 정도로 일관성(consistency)이 정해진다. 앞의 핵심 4축(directness, control, reporting, warmth)의 글자를 이어 붙인 것이 `code`(예: `DCRT`)이고, `typeName` 은 code 의 앞 두 글자(directness + control)로 고른다. 근거: `scorePersona`, `buildCode`, `getTypeName` ([scoring.ts](../src/persona/scoring.ts)).

## 2. 축

부호 규칙: 점수가 0 이상이면 앞 글자, 음수면 뒤 글자 (`letterOf`, [scoring.ts:24](../src/persona/scoring.ts#L24)).

| 축 | 의미 | 앞 글자 (점수 ≥ 0) | 뒤 글자 (점수 < 0) | quick 측정 | code 포함 |
| --- | --- | --- | --- | --- | --- |
| directness | 말하는 방식 | D = 직설형 | I = 돌려말형 | O | O (1번째) |
| control | 업무 통제 | C = 디테일·통제형 | A = 자율·위임형 | O | O (2번째) |
| reporting | 보고 방식 | R = 결론 중심 | P = 과정 중심 | O | O (3번째) |
| warmth | 관계 태도 | T = 업무 위주 | W = 관계·정서형 | O | O (4번째) |
| speed | 응답 속도 | 즉시형 | 여유형 | X (정밀만) | X |
| stability | 반응 일관성 | 안정형 | 기복형 | X (정밀만) | X |

- 글자 뜻은 [questions.ts](../src/persona/questions.ts) 의 축별 주석과 [rules.ts](../src/persona/rules.ts) 의 `AXIS_LABELS` 기준이다.
- quick 에서 speed, stability 는 문항이 없어 샘플이 0개이므로 결과가 `null` 이다 (`scoreAxis`).
- code 는 `CORE_AXES` 4개만 쓴다. 측정되지 않은 핵심 축이 있으면 그 자리는 `?` 가 된다 (`buildCode`).

## 3. 문항

척도: 리커트 1 전혀 아니다 / 2 아닌 편 / 3 보통 / 4 그런 편 / 5 매우 그렇다. reverse 는 점수 부호를 뒤집는다(리커트에만 있음). 가중치는 리커트 1, 상황형 1.5 (`LIKERT_WEIGHT`, `SITUATION_WEIGHT`).

### 리커트 (L1~L24)

| id | 문장 | 축 | reverse | 가중치 | quick |
| --- | --- | --- | --- | --- | --- |
| L1 | 마음에 안 드는 게 있으면 그 자리에서 바로 말한다 | directness | X | 1 | O |
| L2 | "한번 생각해보자", "나중에 다시 보자"처럼 애매하게 말하고 넘어갈 때가 많다 | directness | O | 1 | O |
| L3 | 지적할 때 돌려 말하지 않고 무엇이 문제인지 정확히 짚는다 | directness | X | 1 | X |
| L4 | 진짜 하고 싶은 말을 농담이나 혼잣말처럼 할 때가 있다 | directness | O | 1 | X |
| L5 | 일을 맡긴 뒤에도 중간중간 진행 상황을 물어본다 | control | X | 1 | O |
| L6 | 방법은 알아서 하라 하고 결과만 본다 | control | O | 1 | O |
| L7 | 오타, 양식, 줄 간격 같은 세부사항까지 체크한다 | control | X | 1 | X |
| L8 | 내가 먼저 묻지 않으면 별말 없이 기다려준다 | control | O | 1 | X |
| L9 | 보고 중에 "그래서 결론이 뭐야?"라고 자주 끊는다 | reporting | X | 1 | O |
| L10 | 결과보다 어떤 과정을 거쳤는지 궁금해한다 | reporting | O | 1 | O |
| L11 | 긴 메시지나 문서를 싫어하고 요약을 원한다 | reporting | X | 1 | X |
| L12 | 보고할 때 대안이나 고민한 흔적을 같이 가져오길 원한다 | reporting | O | 1 | X |
| L13 | 업무와 상관없는 사적인 대화를 먼저 꺼낸다 | warmth | O | 1 | O |
| L14 | 같이 밥을 먹어도 주로 일 얘기를 한다 | warmth | X | 1 | O |
| L15 | 인사나 감사 표현 같은 예의를 중요하게 여긴다 | warmth | O | 1 | X |
| L16 | 팀 분위기나 사람 사이 관계보다 결과를 우선한다 | warmth | X | 1 | X |
| L17 | 메신저에 바로 답하지 않으면 다시 연락이 온다 | speed | X | 1 | X |
| L18 | 급하지 않은 일은 여유 있게 처리해도 괜찮아한다 | speed | O | 1 | X |
| L19 | "지금 바로", "ASAP" 같은 말을 자주 쓴다 | speed | X | 1 | X |
| L20 | 생각할 시간이 필요하다며 결정을 미룰 때가 있다 | speed | O | 1 | X |
| L21 | 기분에 따라 같은 일에도 반응이 달라진다 | stability | O | 1 | X |
| L22 | 화가 나도 목소리나 표정이 크게 달라지지 않는다 | stability | X | 1 | X |
| L23 | 컨디션이 안 좋은 날은 팀원 모두가 눈치를 본다 | stability | O | 1 | X |
| L24 | 칭찬이나 지적의 기준이 일정하다 | stability | X | 1 | X |

### 상황형 (S1~S4)

상황형은 모두 quick 에 포함되고 reverse 개념이 없다 (보기 점수 자체가 부호를 가진다).

| id | 문장 | 축 | 가중치 | quick |
| --- | --- | --- | --- | --- |
| S1 | 네가 낸 기획안이 별로일 때 상사 반응은? | directness | 1.5 | O |
| S2 | 3일짜리 업무를 맡겼을 때 상사는? | control | 1.5 | O |
| S3 | 문제가 생겨서 보고해야 할 때 상사가 가장 원하는 건? | reporting | 1.5 | O |
| S4 | 네가 실수했을 때 상사는? | warmth | 1.5 | O |

## 4. 상황형 보기별 점수

보기 key 는 위에서부터 `a`, `b`, `c`, `d` (`String.fromCharCode(97 + i)`).

| 문항 | key | 보기 | 점수 |
| --- | --- | --- | --- |
| S1 | a | "이건 방향이 틀렸어"라고 바로 말한다 | 80 |
| S1 | b | 좋은 점을 먼저 말하고 고칠 점을 말한다 | 30 |
| S1 | c | "음… 좀 더 고민해볼까?" 하고 넘어간다 | -60 |
| S1 | d | 아무 말 없다가 나중에 다른 사람에게 일을 넘긴다 | -90 |
| S2 | a | 매일 진행 상황을 묻는다 | 90 |
| S2 | b | 중간에 한 번 확인한다 | 30 |
| S2 | c | 마감 날 결과만 확인한다 | -60 |
| S2 | d | 마감이 지나도 먼저 묻지 않는다 | -90 |
| S3 | a | 무슨 일이고 어떻게 할지 한 줄로 | 90 |
| S3 | b | 결론 먼저, 원인은 물어보면 설명 | 40 |
| S3 | c | 어떻게 된 건지 처음부터 차근차근 | -50 |
| S3 | d | 원인 분석과 대안 여러 개 | -80 |
| S4 | a | 원인과 해결책만 말하고 끝낸다 | 80 |
| S4 | b | 실수를 짚고 "다음엔 이렇게 하자"고 한다 | 20 |
| S4 | c | "괜찮아, 처음엔 다 그래"라고 먼저 위로한다 | -60 |
| S4 | d | 실수보다 내 기분이나 상태를 먼저 묻는다 | -90 |

## 5. 점수화 규칙 (`collectSamples`, `scoreAxis`)

| 항목 | 규칙 |
| --- | --- |
| 응답 검증 | 해당 모드의 필수 문항이 모두 있어야 한다. 리커트는 1~5 정수, 상황형은 보기 key 중 하나 (`validateAnswers`) |
| 리커트 변환 | `raw = (응답 - 3) × 50` → 1:-100, 2:-50, 3:0, 4:50, 5:100. reverse 이면 `-raw` |
| 상황형 변환 | 보기에 정해진 점수 그대로 (4절) |
| 축 점수 | 축별 샘플의 가중 평균(가중치 1 / 1.5)을 `Math.round` |
| letter | 점수 ≥ 0 이면 앞 글자, 아니면 뒤 글자 (2절). 0 도 앞 글자 |
| strength | 절댓값 ≥ 50 `strong`, ≥ 20 `mild`, 그 미만 `neutral` (`STRONG_THRESHOLD` 50, `MILD_THRESHOLD` 20) |
| consistency | 가중 표준편차 `sd` 로 `round(clamp(1 - sd/100, 0, 1) × 100) / 100` (0~1, 소수 둘째 자리) |
| needsCheck | `consistency < 0.5` (`NEEDS_CHECK_BELOW`) |
| 샘플 0개 | 축 결과 `null` (quick 의 speed, stability) |

- `scoreAxis` 가 반환하는 `needsCheck` 외에, 상사 상세 응답의 `needsCheck`(축 이름 배열)는 [supervisorMapper.ts](../src/services/supervisorMapper.ts) 가 같은 기준(0.5 미만)으로 다시 모은다.
- neutral 축은 규칙 문장에서 "뚜렷하지 않다" 문장이 되고, consistency 가 0.5 미만이면 "엇갈려 확신할 수 없다" 문장이 추가된다 (`axisLines`, [rules.ts](../src/persona/rules.ts)).

## 6. code 와 typeName

### code

- code = directness, control, reporting, warmth 4축의 letter 를 순서대로 이은 문자열 (예: `DARW`). 측정되지 않은 핵심 축은 `?`.
- speed, stability 는 code 에 들어가지 않는다.
- 이론상 가능한 조합은 2⁴ = 16개다 (strength 와 무관하게 부호만 본다).

### typeName 표 (`TYPE_NAMES`, [scoring.ts:137](../src/persona/scoring.ts#L137))

| 키 (code 앞 두 글자) | typeName | typeSummary |
| --- | --- | --- |
| DC | 레이더형 팀장 | 다 보고 있고, 바로 말한다 |
| DA | 쿨한 사수 | 맡기고, 아니면 아니라고 한다 |
| IC | 눈치게임형 | 다 보고 있는데, 돌려 말한다 |
| IA | 무소식이 희소식형 | 말이 없으면 괜찮은 거고, 애매하면 확인해야 한다 |

- `getTypeName(code)` 는 `code.slice(0, 2)` 로 위 표를 찾고, 없으면 `null` 이다. 표는 이 4개가 전부다.
- 키는 directness(D/I)와 control(C/A) 글자뿐이다. 따라서 **reporting(R/P)이나 warmth(T/W) 글자가 바뀌어도 typeName 은 바뀌지 않는다** (예: `DCRT` 와 `DCPW` 는 둘 다 레이더형 팀장). 반대로 D↔I 또는 C↔A 가 바뀌면 typeName 이 바뀐다.
- code 첫 두 글자에 `?` 가 있으면 표에 없으므로 typeName 은 `null` 이다. (필수 문항 검증을 통과한 응답에서 이런 경우가 생기는지는 코드에서 확인 불가. 단, 위 `validateAnswers` 는 모드별 필수 문항을 모두 요구한다.)
- 피드백 보정(7절) 후에는 `applyAdjust` 가 letter 와 code 를 다시 계산한다. 응답과 AI 프롬프트는 보정된 code 로 typeName 을 구하므로 (`toDetail`, `toSummary`, `toPromptInput`), 보정으로 D/I 또는 C/A 가 뒤집히면 typeName 도 바뀐다. DB `code` 컬럼에는 채점 시점의 값(`scores.code`)이 저장되어 있다 ([supervisorService.ts](../src/services/supervisorService.ts)).
- typeName 의 `typeSummary`, 그리고 typeName 이 4개뿐인 이유(기획 의도)는 코드에서 확인 불가.

## 7. 피드백 학습 (보정)

근거: [feedbackFlow.ts](../src/services/feedbackFlow.ts), [ai/feedback.ts](../src/ai/feedback.ts)

| 항목 | 규칙 |
| --- | --- |
| 분석 조건 | `helpful=false` 이고 `actualReaction` 이 있을 때만 AI 가 `newNote`, `axisHint` 를 만든다. AI 호출이 실패해도 피드백은 저장되고 둘 다 `null` |
| axisHint | `{ axis, dir }`. axis 는 6개 축 중 하나, dir 는 +1/-1 (해당 축 점수가 이동해야 하는 방향) |
| newNote | 한 문장. 200자(`MAX_NOTE_LENGTH`)로 자른다. 이미 아는 사실과 겹치면 `null` |
| 보정 조건 | **같은 축, 같은 방향**이면서 아직 반영되지 않은(`applied=false`) 힌트가 2개 이상 (`APPLY_THRESHOLD` 2). 오래된 2개를 고른다 |
| 보정 크기 | 축 점수 ±10 (`ADJUST_STEP` 10). 최종 점수는 `clamp(base + adjust, -100, 100)` 이 되도록 `score_adjust` 를 저장 |
| 반영 후 | 사용한 2개 힌트를 `applied=true` 로 표시. 응답의 `scoreAdjusted` 에 `{ axis, dir }` |
| 반영 방식 | `applyAdjust` 가 점수를 더하고 letter, strength, code 를 다시 계산. consistency, needsCheck 는 유지. 원본 `scores` 는 바뀌지 않는다 |
| 측정되지 않은 축 | `scores[axis]` 가 `null` 이면 보정하지 않는다 (quick 의 speed, stability) |
| 반대 방향 힌트 | 같은 축이어도 방향이 다르면 따로 센다 (`pickHintsToApply` 가 axis 와 dir 둘 다 비교) |
| 재채점 | 상사 수정으로 다시 채점해도 `score_adjust` 는 유지 ([supervisorService.ts](../src/services/supervisorService.ts), `supabase/002_persona.sql` 주석) |
| 학습 메모 | 최대 10개 (`MAX_LEARNED_NOTES`). 새 메모를 붙인 뒤 10개를 넘으면 가장 오래된 5개(`NOTES_TO_SUMMARIZE`)를 AI 로 1~2문장 요약해 1개로 교체 |
| 요약 실패 | 요약이 실패하면 가장 오래된 것부터 버려 10개로 맞춘다 |
| 프롬프트 사용 | 시스템 프롬프트에는 학습 메모를 최근 10개까지만 쓴다 ([promptBuilder.ts](../src/persona/promptBuilder.ts)) |

## 8. topRules (`getTopRules`, [topRules.ts](../src/persona/topRules.ts))

상사 상세 응답의 `topRules` 를 만드는 규칙이다. 입력은 보정이 적용된 점수다.

1. strength 가 `strong` 인 축을 먼저, 그다음 `mild` 인 축을 모은다. 각 단계 안의 순서는 directness, control, reporting, warmth, speed, stability. `neutral` 축과 측정되지 않은 축은 제외한다.
2. 축마다 한 문장만 쓴다. 그 축만 따로 놓고 `getAxisRules` 의 첫 문장을 얻는데, consistency 를 1 로 고정해서 "엇갈려 확신할 수 없다" 문장이 섞이지 않게 한다.
3. 문장은 [rules.ts](../src/persona/rules.ts) `LETTER_SENTENCES[letter][strong 또는 mild]` 에서 온다. 조합 규칙(`COMBO_RULES`) 문장은 포함하지 않는다.
4. 앞에서부터 최대 3개 (`limit` 기본 3). strong/mild 축이 하나도 없으면 빈 배열.

## 코드에서 확인 불가한 항목

- typeName 이 4개뿐인 이유, 나머지 code 조합에 이름이 없는 것이 의도인지 여부
- 문항 점수(보기별 점수, 임계값 50/20, 0.5 등)를 정한 근거
- code 앞 두 글자에 `?` 가 실제로 저장되는 경우가 있는지 (검증 코드상 필수 문항이 모두 요구되므로 일반적으로는 없어 보이나, 데이터를 확인한 것은 아님)

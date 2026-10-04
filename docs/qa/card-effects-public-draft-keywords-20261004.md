# 현재 카드 효과·드래프트 공개·키워드 표시 검증 — 2026-10-04 KST

## 변경과 검증 범위

이전 검사 지점 db35f42와 운영 main 415886c9에서 이어서 진행했다. 기존 변경사항을 되돌리지 않았다.
공개 API 54장과 관리자 화면 미공개/비활성 40장을 읽기 전용으로 대조했다. 설명, effectId/config, 원본 ATK/HP/비용과 keywords는 이전 기준과 같았다. 사용자가 변경한 매드 사이언티스트 퍼플레인 등급 NORMAL→EPIC만 QA fixture에 반영했다. 운영 카드 원본, 사용자 덱/컬렉션, 구매 내역을 변경하지 않았다.

- 현재 94장 설명별 효과/직렬화 및 기존 회귀: PASS.
- 새 검사: 각 카드 사용 후 실제 AI 액션·대상 선택·턴 트리거를 6턴 진행, 액션 사이 직렬화: 94/94 PASS.
- 매드 펌킨/하녀 판도라 대상 선택 반복: FAIL → FIXED → PASS. AI가 취소 환불을 이득으로 평가하여 재사용/취소를 반복했다. 유효 대상이 있으면 선택을 끝내도록 수정했다. legacy/NORMAL/HARD/BOSS 8개 검사 PASS. 사람의 취소 기능은 유지된다.
- 합산 자동 검사: 1,032 PASS / FAIL 0 / skipped 0 (20.25초).
- 프런트엔드/API 타입 검사 및 각각 production build: PASS.

## 일반 유저 드래프트

로그인 사용자는 /draft, /draft/match/:id 및 /api/draft로 기존 AI/PvP 드래프트에 접근한다. 관리자 /admin/draft와 /api/admin/draft는 유지된다. ON/OFF 및 설정 PUT은 ADMIN만 가능하다. 메인 메뉴는 enabled 상태에 드래프트 버튼을 표시한다. 기존 운영 스위치는 이미 ON으로 관찰하여 설정 저장을 하지 않았다.

격리 PGlite DB의 실제 HTTP/auth 검사 5개 PASS: 로그인 필요, USER 입장, ADMIN 관리 경로 유지, USER 설정 변경 거부, OFF 시작 거부, ADMIN ON, USER 챔피언/25장 선택/READY 및 실제 전투 스냅샷, 재접속 복원, 비참가자 세션/전투 403. 드래프트 엔진 1,000개 seeded draft 검사도 PASS. 운영 세션 생성·게임 보상 지급은 하지 않았다.

## 컬렉션 키워드

공용 CardRenderer에 원본 keywords/effectConfig 입력을 추가했다. 컬렉션, 덱 카드/hover/제작 정보, 상세창, 관리자 카드 목록에서 같은 배지를 사용한다. 아머 수치와 회피 횟수를 표시하고 치유/흡혈/방어 등 기존 한글 키워드 라벨을 재사용한다. runtimeKeywords가 제공되면 기존 게임 상태를 우선하므로 침묵/회피 소모 표시가 원본 키워드로 복원되지 않는다. 등급 아래 flex-wrap으로 배치한다.

## 남은 실환경 검사

배포 main 6fd2d4c7281e0e610f6bfd4ec6dbfd3eb930d2b5: PASS. 운영 JS index-B-hswHNm.js SHA256 addc8afbef9afc35ad35cdf61c600eb1ed9bec84dca464d853fcd433026b330b가 로컬 빌드와 같다. 실제 운영 컬렉션과 상세 루나 아머(2)/도발, MK 아머(1), 치유/회피 등 배지를 확인했다. 메인 드래프트 버튼과 /draft의 AI/PvP 진입 및 관리자 설정 미노출을 확인했다.
실제 휴대전화 UI 및 두 계정 운영 PvP: UNVERIFIED. 엔진/격리 HTTP 검사를 실제 휴대전화/운영 두 계정 검사로 보고하지 않는다.
전체 실환경 QA 완료라고 주장하지 않는다.

## 파일

- `artifacts/api-server/src/routes/admin-draft.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/ko-game/src/App.tsx`
- `artifacts/ko-game/src/audio/music-route.test.ts`
- `artifacts/ko-game/src/audio/music-route.ts`
- `artifacts/ko-game/src/components/admin-card-manager.tsx`
- `artifacts/ko-game/src/components/admin-draft-manager.tsx`
- `artifacts/ko-game/src/components/card-detail-dialog.tsx`
- `artifacts/ko-game/src/components/card-renderer.tsx`
- `artifacts/ko-game/src/components/main-menu.tsx`
- `artifacts/ko-game/src/game/actions/ai-evaluator.ts`
- `artifacts/ko-game/src/game/qa/fixtures/cards-2026-10-04.json`
- `artifacts/ko-game/src/lib/collection-client.ts`
- `artifacts/ko-game/src/lib/decks-client.ts`
- `artifacts/ko-game/src/lib/draft-client.ts`
- `artifacts/ko-game/src/pages/collection.tsx`
- `artifacts/ko-game/src/pages/decks.tsx`
- `artifacts/ko-game/src/pages/online-match.tsx`
- `artifacts/ko-game/src/game/qa/current-card-action-continuation.test.ts`
- `artifacts/ko-game/src/pages/draft.tsx`
- `lib/db/qa/public-draft-access.test.ts`

## 후속 발견

예거(latest-wrestler-5)의 설명은 회피를 명시하지만 DB keywords=[]이었다. 원본 데이터/ATK/HP/비용 변경 없이 기존 변환 경로에서 해당 ID와 회피 시작 문구를 확인하여 DODGE를 보완했다. 같은 함수를 정적 카드 표시에도 사용한다. 실제 첫 공격 회피/횟수 소모/두 번째 피해 및 원본 불변 검사 PASS. 조건부 미래 회피 문구에는 적용하지 않는다. 후속 전체 1,032 PASS.

AI 덱에 챔피언 라 칼라베라가 없는 이유는 관리자 전체 챔피언 화면의 DISABLED v22로 직접 확인했다. AI 옵션은 DISABLED를 제외하고 DRAFT를 허용한다. 챔피언 공개 상태나 원본 데이터, 기존 AI 덱을 변경하지 않았다.

## 2026-10-05 urgent follow-up

- PASS: authenticated PvP draft matchmaking endpoint pairs waiting players under the existing database advisory lock. Repeated requests restore the same session; third players enter another queue; cancellation releases participation; OFF and login restrictions remain.
- PASS: removed technique pool warning and room ID UI; waiting state polls, cancellation is available. Technique offers do not show ATK/HP.
- FAIL → FIXED → PASS: normal online snapshots previously registered cardPool only when Minion A was present. Register the match-authorized pool for every snapshot and retain it if account resources arrive later. Both arrival orders and unpublished opponent definition lookup are covered. No catalog publication or collection access changes.
- FAIL → FIXED → PASS: socket errors previously depended on a later close event to reconnect. Error now closes the failed socket and schedules retry; delayed stale events cannot overwrite the recovered socket.
- PASS: production health HTTP 200 and live quick-match UI showed server connected at 2026-10-05 00:05 KST. User's individual interrupted PvP session cause remains UNVERIFIED.
- PASS: suite 1,043 tests, zero failures/skips; six additional current-catalog armor tests PASS (219 catalog tests total). Luna armor 2; Luna MK, Blackout, Silence, Arbiter and Frankenstein Mandrill armor 1. Effect damage, combat damage, zero floor, serialization and silence removal checked against current fixture without original specification changes.
- UNVERIFIED: two-account production PvP, actual mobile device and live queue pairing. No production test matches or account/catalog writes were made.

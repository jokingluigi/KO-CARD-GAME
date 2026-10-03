# EPIC 확장 패치 검증 보고서 — 2026-10-03

전체 상태: **UNVERIFIED**. 코드 변경은 로컬 작업 브랜치에 보존했다. 운영 배포는 하지 않았다. 모바일/데스크톱 실제 화면 검증과 전체 회귀의 잔여 항목이 있어 완료로 표시하지 않는다.

## 1. 기존 rarity 구조 분석 결과

카드 DB는 `cards.rarity text NOT NULL DEFAULT NORMAL`이며 PostgreSQL enum이 아니다. 프런트엔드 `CardRarity`는 NORMAL / LEGENDARY / CHAMPION / TOKEN union이다. shared game-engine은 이 카드 타입을 재사용하여 export한다. 카드 API와 DB record는 rarity 문자열을 그대로 전달한다. 덱은 `card_definition_ids text[]`와 champion ID를 저장하며 rarity snapshot은 없다.

중요한 전제 차이: 분석 당시 코드의 NORMAL 동일 카드 제한은 2장, LEGENDARY 총 제한은 5장이었다. 사용자에게 이를 알리고 **요청서 수치 적용** 응답을 받은 후 NORMAL 3장, EPIC 2장, LEGENDARY 동일 1장/총 3장으로 변경했다. 기존 4~5장 레전더리 덱은 삭제/변환하지 않고 재검증에서 오류를 표시한다.

## 2. 수정한 파일

아래 전체 경로는 repository root 기준이다. 기존 카드/챔피언 데이터 fixture는 변경하지 않았다.

- `artifacts/api-server/src/lib/ai-deck-service.ts`
- `artifacts/api-server/src/lib/pack-details.ts`
- `artifacts/api-server/src/lib/pack-opening-service.ts`
- `artifacts/api-server/src/lib/prism-economy.ts`
- `artifacts/api-server/src/lib/startup-schema.ts`
- `artifacts/api-server/src/routes/admin-packs.ts`
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/api-server/src/routes/collection.ts`
- `artifacts/api-server/src/routes/decks.ts`
- `artifacts/api-server/src/routes/packs.ts`
- `artifacts/api-server/src/routes/prism.ts`
- `artifacts/ko-game/src/components/admin-ai-deck-manager.tsx`
- `artifacts/ko-game/src/components/admin-card-frame-manager.tsx`
- `artifacts/ko-game/src/components/admin-card-manager.tsx`
- `artifacts/ko-game/src/components/admin-pack-manager.tsx`
- `artifacts/ko-game/src/components/admin-prism-manager.tsx`
- `artifacts/ko-game/src/components/card-detail-dialog.tsx`
- `artifacts/ko-game/src/components/card-renderer.tsx`
- `artifacts/ko-game/src/components/card-tag-explorer-dialog.tsx`
- `artifacts/ko-game/src/components/pack-detail-dialog.tsx`
- `artifacts/ko-game/src/components/pack-opening.tsx`
- `artifacts/ko-game/src/game/cards/types.ts`
- `artifacts/ko-game/src/game/engine/deck-rules.test.ts`
- `artifacts/ko-game/src/index.css`
- `artifacts/ko-game/src/lib/card-frames-client.ts`
- `artifacts/ko-game/src/lib/collection-client.ts`
- `artifacts/ko-game/src/lib/decks-client.ts`
- `artifacts/ko-game/src/pages/collection.tsx`
- `artifacts/ko-game/src/pages/deck-card-availability.test.ts`
- `artifacts/ko-game/src/pages/deck-card-availability.ts`
- `artifacts/ko-game/src/pages/deck-validation.test.ts`
- `artifacts/ko-game/src/pages/decks.tsx`
- `artifacts/ko-game/src/pages/packs.tsx`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-spec/openapi.yaml`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/packRewardRewardType.ts`
- `lib/db/src/schema/packs.ts`
- `lib/game-engine/src/index.ts`
- `lib/game-engine/src/rules.ts`
- `lib/db/migrations/0036_epic_pack_configuration.sql`
- `lib/db/qa/epic-http.test.ts`
- `lib/db/qa/epic-rarity.test.ts`
- `lib/db/qa/isolated-test-db.ts`

이 보고서도 `docs/qa/epic-rarity-patch.md`에 저장했다.

## 3. DB migration 여부

**PASS** — 카드 rarity에는 migration이 필요 없다. `0036_epic_pack_configuration.sql`만 추가했다. 팩에 `epic_rate integer DEFAULT 0`와 `epic_card_pool text[] DEFAULT []`를 additive 방식으로 추가한다. 기존 행/등급/확률을 재작성하지 않는다. 반복 실행, 기존 팩 확률 보존, 테이블 없는 초기 상태, 스타트업 트랜잭션 및 롤백 검증을 수행했다. 운영 DB에 직접 실행하지 않았다.

## 4. EPIC type 추가 위치

**PASS** — `game/cards/types.ts`의 union/label/normalize/allowedCardRarities, Admin 서버 CARD_RARITIES, Collection/Deck/Card frame/Prism 클라이언트 타입과 필터에 EPIC을 추가했다. EPIC 기술 카드도 선택 가능하며 기존 LEGENDARY/CHAMPION 기술 카드의 기존 처리 정책은 유지했다. OpenAPI 및 생성된 React API/Zod reward 타입은 EPIC_CARD를 인식한다.

## 5. Deck validation 구현 위치

**PASS** — `lib/game-engine/src/rules.ts`에 `MAX_COPIES_BY_RARITY`, `maxCardCopies`, `cardCopyLimitMessage`를 정의했다. `validateDeckCounts`는 기존 덱 25장/챔피언 1명 검증을 유지하고 LEGENDARY 총 3장을 검증한다. 서버 `routes/decks.ts`의 authoritative `validateReferences`를 POST/PATCH 저장 경로가 공유한다. `resolveDeck`는 저장 덱 조회·대표 덱 선택·온라인 매치 시작 전에 재검증한다. Deck Editor 추가/로컬 오류와 PLAYER_DECK AI helper도 같은 copy 정책을 사용한다. 클라이언트 우회 HTTP 요청의 저장 거부를 검증했다.

기존 미완성 덱 초안 저장 기능은 유지했다. 25장 미만 초안은 대표 덱/일반 매치로 사용할 수 없다. 이번 확장으로 초안 저장 정책을 임의 제거하지 않았다.

## 6. NORMAL 3장 검증 결과

**PASS** — 동일 카드 1/2/3장 허용, 4장 거부. 격리 DB authoritative 저장/불러오기 및 실제 HTTP POST/PATCH 모두 확인했다. 소유 수량 제한은 별도로 유지한다.

## 7. EPIC 2장 검증 결과

**PASS** — 동일 카드 1/2장 허용, 3장 거부. EPIC 12종을 각각 2장 + NORMAL 1장으로 구성한 25장 덱을 검증하여 EPIC 총량 제한이 없음을 확인했다.

## 8. LEGENDARY 1장 검증 결과

**PASS** — 동일 카드 1장 허용, 2장 거부. DB validator와 직접 HTTP 생성/수정 요청에서 확인했다.

## 9. LEGENDARY 총 3장 검증 결과

**PASS** — 서로 다른 레전더리 1/2/3장 허용, 4장 거부. 중복 제한과 총량 제한은 동시에 적용한다.

## 10. 기존 Deck 호환성

**PASS** — 기존 NORMAL 덱 및 레전더리 3장 덱 load/save를 검증했다. 25장 혼합 덱의 ID 배열 저장·조회가 동일함을 확인했다. 레전더리 4장 기존 행은 그대로 유지하며 사용 불가 이유를 반환한다. 기존 카드 rarity 자동 변환, 덱 삭제/이관은 없다.

## 11. Collection / Deck Editor / Admin 변경

API/타입/로직: **PASS**. 실제 브라우저 화면 조작: **UNVERIFIED**.

Collection에 EPIC label/filter 및 NORMAL → EPIC → LEGENDARY 정렬을 추가했다. 카드 상세/태그 상세/덱 카드 표시가 EPIC을 보존한다. Admin 생성/수정 selector와 조회 필터 및 프레임 관리에 EPIC을 추가했다. 실제 HTTP 카드 생성 → 수정 → 다시 로그인 → 등급 필터 조회의 persistence를 검증했다. 기존 ALT/full-art/이미지 표시 구현은 변경하지 않았다.

최종 EPIC frame asset은 없다. 기존 NORMAL 베이스에 EPIC 전용 보라색 outline/badge와 `data-rarity=EPIC`을 표시하는 임시 표현을 사용한다. LEGENDARY artwork나 특수 입장 연출을 EPIC에 복사하지 않았다. 프레임 Admin에서 EPIC asset을 별도 지정할 수 있다. 이미지 생성은 하지 않았다.

## 12. Pack / Reward 영향 여부

**PASS** — 기존 팩에는 EPIC 확률 0%/빈 풀이 추가되어 기존 확률 분포가 유지된다. 관리자가 EPIC 확률/풀을 설정할 수 있고 등급 확률 합계 100%와 공개 EPIC 풀을 검증한다. EPIC 카드 보상, 팩 상세 확률, 강제 preview, 실제 팩 개봉, retry/idempotent claim 및 소유 수량 증가를 검증했다. EPIC 프리즘 제작/분해 값은 기존 설정 구조에 추가하되 설정 전에는 configured=false로 유지한다. 임의 가격을 만들지 않았다. 일반 CARD 퀘스트/타워 보상은 기존 card ID 기반 경로를 유지한다.

## 13. AI / Test Match 영향 여부

**PASS** — AI_DECK은 기존 1~100장/중복 제한 예외를 유지한다. EPIC 7장 중복 AI 덱 허용을 검증했다. PLAYER_DECK 문맥은 일반 25장/등급 제한을 사용한다. 관리자 테스트 덱의 기존 1~60장/중복 무제한 예외를 유지하고 EPIC 카드로 게임 시작을 확인했다. 일반 엔진의 EPIC 혼합 25장 시작과 초기 손패를 확인했다. 격리 API 카탈로그에서 AI 100경기 종료와 숨겨진 손패에 대한 판단 안정성 테스트가 통과했다. 실제 HTTP PvP 생성·참가와 EPIC snapshot serialization을 확인했다.

Tower의 기존 starter/preset/run/reward 규칙은 변경하지 않았다. Tower가 EPIC을 정상 문자열로 취급하는 기존 ID lookup 경로를 유지했고 기존 Tower DB/엔진 테스트를 수행했다.

## 14. 모바일 검증 결과

**UNVERIFIED** — Collection 필터는 기존 select 구조를 확장했고 Deck 제한 설명 행에는 flex-wrap을 추가했다. 실제 가로 overflow/clipping/auto zoom/팝업/그리드 검증은 수행하지 못했다. 현재 제공된 브라우저는 로컬 검증 서버 열기를 `ERR_BLOCKED_BY_CLIENT`로 거부했다. 이를 모바일 검증 PASS로 대체하지 않는다.

## 15. regression test 결과

| 검증 | 상태 | 실제 결과 |
|---|---|---|
| 전체 기존 unit/engine/API 소스 테스트 실행 | UNVERIFIED | 121개 파일, 941개 테스트 중 926개 통과; 동일한 15개 실패가 패치 전 baseline에서도 발생 |
| 전체 격리 DB/HTTP 묶음 | PASS | 64/64; EPIC DB 19개 + HTTP/AI 17개 + 기존 DB 28개 |
| 기존 보상/신규 계정 팩 회귀 | PASS | 격리 PGlite preload에서 15/15 |
| 기존 팩 bulk/concurrent/idempotency | PASS | 격리 PGlite에서 1/1 |
| 덱 UI 로직/소유 제한/공통 카운트 | PASS | 13/13 |
| shared 빌드/프런트엔드/API typecheck | PASS | tsc --build와 두 프로젝트 noEmit 검사 |
| 프런트엔드 및 API production build | PASS | Vite/esbuild 성공 |
| 실제 모바일/데스크톱 화면 | UNVERIFIED | 브라우저의 로컬 접근 차단 |
| 운영 환경 배포 후 로그인/실제 PvP 화면 | UNVERIFIED | 이번 패치는 운영에 배포하지 않음 |

전체 회귀의 연결 의존 6개 DB 실패는 격리 preload에서, 2개 AI 실패는 격리 HTTP 서버에서 각각 다시 검증하여 통과했다. 남은 기존 문제는 효과 생성 provider 호출 수 기대값, 좀비의 상대 리타이어에 관한 오래된 테스트 기대값, Node에서의 설치 기능 import.meta.env 테스트 환경이다. 별도 공개 카탈로그에 연결하는 4개 QA 파일은 기본 로컬 서버가 없어 해당 실행에서 연결 실패했다. 관련 없는 게임 효과/AI 판단/설치 로직을 변경하여 테스트만 통과시키지 않았다.

## 16. 발견한 버그와 수정 내용

**FAIL → FIXED → PASS** — 서버 덱 저장 validator가 `DeckValidationReason[]`에 바로 join을 사용하여 오류가 `[object Object]`가 되는 문제. 각 reason.message를 사용하도록 수정하고 초과 덱의 실제 HTTP 오류 문자열을 검증했다.

**FAIL → FIXED → PASS** — 새 팩 확장 migration의 초기 검증에서 pack_definitions 없는 최소 startup fixture가 실패했다. ALTER TABLE IF EXISTS로 테이블이 없는 초기 상태를 허용하고, 기존 startup 설치/롤백 및 팩 migration 반복 실행 검증을 통과했다.

## 17. 남은 미검증 사항

- 모바일 및 데스크톱 Collection/Deck Editor/Admin/카드 상세/프레임의 실제 렌더링과 조작.
- UI에서의 AI/Test/PvP 전체 흐름, ALT/full-art/popup, 브라우저 세션 복구.
- 전체 회귀의 위 기존 문제 및 연결 의존 공개 카탈로그 QA 항목.
- 운영 배포와 운영 DB startup migration 적용 후 상태. 운영 데이터 직접 수정이나 기존 카드 등급 변환은 수행하지 않았다.

따라서 이번 보고서는 완료 보고가 아니라 코드 패치 및 검증 현황 보고다.

# 신규 EPIC 주문 11종 — 구현 및 검증 기록

2026-10-03. **실제 화면·모바일 검증이 남아 있으므로 작업 완료로 보고하지 않음. 운영 배포하지 않음.**

## 카드

전부 EPIC / TECHNIQUE / DRAFT. 기존 카드·챔피언·덱·보유 목록·팩 확률을 변경하지 않는다. 숫자 ATK/HP 0은 기존 DB 필수 컬럼의 저장 형식이며 주문 UI는 전투 스탯을 표시하지 않는다.

| 이름 | 비용 | cardId | 엔진 검증 |
|---|---:|---|---|
| 처형 | 5 | epic-spell-execution | PASS |
| 만찬 | 4 | epic-spell-feast | PASS |
| 침묵의 장막 | 5 | epic-spell-veil-of-silence | PASS |
| 복귀 | 3 | epic-spell-return | FAIL → FIXED → PASS |
| 금지된 계약 | 4 | epic-spell-forbidden-contract | PASS |
| 생명의 교환 | 4 | epic-spell-life-exchange | PASS |
| 절멸 | 6 | epic-spell-annihilation | PASS |
| 강제 교환 | 4 | epic-spell-forced-exchange | PASS |
| 탈출 | 3 | epic-spell-escape | FAIL → FIXED → PASS |
| 강제 침묵 | 3 | epic-spell-forced-silence | PASS |
| 밀쳐내기 | 1 | epic-spell-push | PASS |

## 기존 구조와 구현 위치

기존 카드 저장은 문자열 rarity/card_type, effect_id/effect_config JSONB다. DB의 attack/health 필수 컬럼은 Technique도 0을 저장한다. `cardRecordToDefinition`이 SCRIPT_V1/STRUCTURED_EFFECTS_V1을 실행 가능한 abilities로 변환한다. 클라이언트 AI 및 서버 매치는 같은 DOM 없는 게임 엔진을 사용한다.

- `artifacts/ko-game/src/game/cards/epic-techniques.ts`: 11장 데이터 및 SCRIPT_V1 효과 정의. SELECT/AGGREGATE/EFFECT를 재사용한다.
- `lib/db/migrations/0039_epic_techniques.sql`: 고정 cardId 11개 INSERT, ON CONFLICT DO NOTHING. 기존 row와 collection/deck를 수정하지 않는다.
- `artifacts/api-server/src/lib/startup-schema.ts`: 기존 advisory-lock startup transaction에 additive 설치 연결.
- `lib/effect-registry/src/index.ts`: SET_STAT의 currentHealthOnly 옵션, QUEUE_EFFECT의 기존 THIS_TURN duration 허용.
- `artifacts/ko-game/src/game/effects/effect-engine.ts`: SELECT resultId 후보 제한, 주문의 선행 필수 SELECT를 비용 지불 전 검사, HP 현재값만 변경하는 옵션, 예약 expiry, 원본 정의를 이용한 복귀 초기화.
- `artifacts/ko-game/src/game/types/game-state.ts`: 예약 효과의 직렬화 가능한 expiresAtTurn 필드.
- `artifacts/ko-game/src/game/engine/play-wrestler.ts`: HAND 선수에 예약된 SET_STAT COST 0을 실제 결제 전에 계산. 기존 소환/Technique에는 적용하지 않는다.
- `artifacts/ko-game/src/game/engine/turn-system.ts`: THIS_TURN 예약을 턴 끝에 제거. 기존 영구 예약 유지.
- `artifacts/ko-game/src/game/cards/zone-state.ts`: 손패/덱 복귀 시 원래 스탯·비용·키워드/능력을 복구하고 침묵·기절·능력 잠금·획득 텍스트를 제거.
- `artifacts/ko-game/src/components/game-state-preview.tsx`: 기존 묘지 팝업을 복귀 후보 선택에도 사용, 실제 비용 0을 손패·사용 가능 표시에 반영, 주문 묘지 UI의 ATK/HP 표시 제거.
- `artifacts/ko-game/src/game/engine/epic-techniques.test.ts`: 신규 29개 엔진 테스트.
- `lib/db/qa/epic-techniques.test.ts`: 신규 13개 격리 DB/HTTP 테스트.
- `docs/qa/epic-techniques.md`: 이 기록.

## 자동 검증

| 항목 | 상태 | 증거 |
|---|---|---|
| 신규 카드 효과 | PASS | 실제 executeAction으로 29개 테스트 |
| DESTROY / RETIRE 구분 | PASS | 처형·절멸: 무덤 이동 및 SELF_RETIRE 효과 없음 |
| HP +3 | PASS | 모든 아군 현재/최대 HP +3, 상대 유지 |
| 침묵 | PASS | 단일/전체 상대, 이미 침묵한 대상, 원래 ATK/최대 HP |
| 기절 | PASS | 기존 STUN 사용, 대상 소유자의 턴 종료 시 해제 |
| 복귀 후보 | PASS | 무덤 1/2/3/5장, 최대 3개, 후보 밖 선택 거부, 토큰 선수 포함, 0장 사용 거부 |
| 복귀 이동·초기화 | FAIL → FIXED → PASS | 선택 1장만 이동, 나머지 무덤 유지, 원래 ATK/HP/비용/상태 |
| HP/ATK 교환 | PASS | 양 진영 순서 검증, 변경 전 수치 스냅샷, 두 대상 STUN, 기본 정의 불변 |
| HP 상한 | PASS | 현재 HP 교환은 기존 최대 HP로 제한, 최대 HP 자체 변경 없음 |
| 금지된 계약 | PASS | 실제 챔피언 5 피해, 다음 선수 실제 결제 0, 한 번 소비, 주문 제외, 턴 끝 소멸 |
| 탈출 초기화 | FAIL → FIXED → PASS | 원래 스탯·비용, 침묵/기절 제거, RETIRE 없음 |
| no target / 잘못된 진영 | PASS | 비용/손패 변화 없이 authoritative action 거부, 무한 선택 없음 |
| AI legal actions | PASS | 대상 없는 주문 제외, 대상이 있는 11장은 legal action 포함 |
| 두 대상 precommit | PASS | 아군→상대 선택, 비용 한 번만 지불, 둘 선택 전 교환 없음 |
| DB persistence | PASS | 실제 격리 PostgreSQL 호환 PGlite INSERT/조회, 11개 JSON 동일, 재실행 idempotence, 원본 row 보존 |
| HTTP API / Admin 저장 | PASS | 실제 로컬 HTTP 로그인, EPIC/TECHNIQUE 필터, 11장 PATCH 저장·재조회, 효과 JSON 보존 |
| 미공개 노출 방지 | PASS | 일반 /api/cards에 DRAFT 11장 미노출 |
| 기존 엔진·덱·Admin Test | PASS | 신규 포함 최종 선택 suite 284개, 0 실패. 기존 Technique, SCRIPT, structured effect, targeting/cancel, saved effects, keywords, champions, deck rules, turn/endgame, AI evaluator, admin test deck, EPIC DB/pack configuration |
| 최종 대상 처리 재확인 | PASS | 마지막 범위 축소 후 신규/선택/SCRIPT/structured 125개, 0 실패 |
| shared/frontend/API types | PASS | tsc --build 및 frontend/API --noEmit |
| frontend/API build | PASS | Vite production build 및 API build |
| 팩/보상 정책 보존 | PASS | 기존 rarity/pack 회귀 테스트 통과, 확률·보상·보유 수량 변경 없음 |
| 실제 브라우저 Test Match 11장 | UNVERIFIED | 브라우저의 localhost 접근이 ERR_BLOCKED_BY_CLIENT로 차단됨 |
| 모바일 표시·대상 선택 | UNVERIFIED | 실제 화면 검증 경로 차단. 기존 반응형 팝업/프레임 재사용만으로 PASS 처리하지 않음 |
| 운영 DB/API 및 배포 | UNVERIFIED | 본 패치를 운영에 배포하거나 운영 카드/보유 데이터를 수정하지 않음 |
| 실카탈로그 기존 효과 전수 회귀 | UNVERIFIED | 아래 기존 실패 7개는 수정 전/후 동일 재현. 본 작업 범위 밖 기존 효과를 바꾸지 않음 |

## 발견한 문제

1. 기존 SCRIPT SELECT는 resultId를 후보 제한에 반영하지 않았다. 복귀에서 선발한 최대 3장만 선택되도록 수정했다.
2. SCRIPT 플레이어 선택의 선행 대상 부족을 주문 결제 전에 확인하지 않았다. 두 진영 중 하나가 없으면 교환 주문을 거부하도록 검증했다. 선수/챔피언의 기존 SCRIPT 필수 선택 정책은 바꾸지 않는다.
3. 기존 zone reset은 침묵/획득 텍스트가 남았다. 손패/덱 복귀 초기화에서 제거하고 원래 카드 정의를 사용한다.
4. 기존 SET_STAT HEALTH는 최대 HP도 변경했다. 새 교환 주문만 currentHealthOnly를 설정하여 기존 SET_STAT 동작은 보존했다.
5. 기존 선수 예약은 소환 이후 소비되어 비용 결제에 사용할 수 없었다. HAND 선수 비용 0 예약만 결제 전 확인하고 기존 소비 흐름을 재사용했다.
6. 기존 관리자 STRUCTURED 편집 정책이 ACTIVE 선택 주문 등 일부 정의를 거부하므로 해당 정책을 임의로 넓히지 않고 기존 SCRIPT_V1으로 모든 새 주문을 정의했다. 실제 Admin HTTP 저장으로 검증했다.

실카탈로그 `targeted-card-fixes.test.ts`는 운영의 공개 카탈로그를 **읽기만** 해서 로컬 엔진에서 검증했다. 수정 전 12a570f 별도 worktree에서도 동일한 7개 실패가 발생했다: 흑구슬마스터 PLAY_FROM_HAND, HAND stat-increase listener, 대상 없는 ON_ENTER, Pandora Token 공격 흡수, 데헌 HAND 첫 강화/BOARD 제외, 나토마토 이번 턴 강화. 기존 사용자 카드 데이터를 수정하지 않았다.

## 남은 작업

브라우저 접근 가능한 테스트 환경에서 실제 11장 사용·애니메이션·다음 행동·모바일 선택을 확인해야 한다. 운영 적용 여부와 공개 여부는 아직 검증되지 않았다. DRAFT 상태가 기존 카드 생성 기본 정책이며 관리자 테스트를 먼저 할 수 있게 설치된다. 미검증 항목이 있으므로 완료 선언하지 않는다.

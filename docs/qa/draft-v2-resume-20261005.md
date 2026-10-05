# Draft Mode 2.0 복구 작업 및 QA

기준 commit: `a602b6f46f3c1ce483974b134c039f6a7c04a4d8`. 작업 branch: `feat/draft-v2-resume-20261005`.
기존 중단 작업 checkout은 수정하지 않았고 reset/revert 없이 최신 main에서 추가 변경했다. 기존 PvP 연속 이벤트 batch의 잘못된 resync 방지 수정도 유지한다.

이 기록은 완료 선언이 아니다. 모바일 실제 화면과 실전 네트워크에서의 PvP 체감 성능은 UNVERIFIED이다.

| 항목 | 결과 | 내용 |
| --- | --- | --- |
| 1. 기존 Draft 구조 분석 | PASS | 기존 domain의 pool/copy 제한/슬롯 규칙과 서버 session JSON, 버전 및 requestId, Champion 선택, 25장 구성, AI/PvP battle 연결을 유지했다. 별도 Draft engine을 만들지 않았다. |
| 2. 수정 파일 | PASS | 아래 파일 목록 참조. |
| 3. Draft state | PASS | 기존 deck ID 배열을 유지하고 cards, rerollsUsed, lockedOfferId, specialPick, grandMutationUsed, mutationEvent를 추가했다. 오래된 설정은 기본값으로 정규화한다. |
| 4. seed/random | PASS | 기존 deterministic random을 사용하고 pick/seat/사용 reroll 횟수에 따른 seed를 구분한다. 특수 종류와 변이 후보는 저장하며 재조회로 변경되지 않는다. |
| 5. Synergy Pick | PASS | structured tag와 비용 곡선으로 가중 선택. 일반 2 random + 1 weighted, 없으면 random fallback. Champion 가중치는 덱보다 작다. |
| 6. Special Pick | PASS | 5/10/15/20/25 EPIC/HIGH_COST/LOW_COST/SYNERGY/CHAOS. 기존 카드 제한을 유지하며 부족한 종류는 fallback. Chaos는 공개된 정상 플레이 가능 token/Champion token을 허용한다. 미공개 데이터는 제외했다. |
| 7. Reroll | PASS | 전체 기본 2회, 저장/버전/idempotency 검증. 후보 1장 잠금과 부분 reroll 구현. 0회에서는 거절한다. |
| 8. Mutation 모델 | PASS | 카드 instance의 draftMutation과 원본 baseline snapshot인 draftCatalogBase에 저장한다. catalog/collection/일반 deck은 변경하지 않는다. |
| 9. Instance 식별 | PASS | session/seat/pick 기준 안정적인 copy ID. 동일 cardId의 서로 다른 변이가 battle와 재접속까지 유지된다. |
| 10. Stat Mutation | PASS | 일반 12종, grand 3종의 비용/ATK/HP/keyword 효과와 유효 수치 검증. Technique 및 이미 개조한 카드는 대상 제외. 비용 최저 0, 최대 6. |
| 11. Keyword Mutation | PASS | 엔진의 ARMOR/REGEN/DEFENSE/LIFESTEAL 사용. IMMUNE 및 새 keyword 없음. |
| 12. Zone reset | PASS | catalog + Draft baseline으로 복구하고 전투 임시 버프만 제거한다. 실제 bounce/deck return/draw/RETIRE/DESTROY 경로와 임시 keyword/armor 제거 테스트. |
| 13. Silence | PASS | 침묵 중 keyword 비활성화, 변이 metadata는 유지하고 정상 zone reset 이후 keyword 복구. |
| 14. Grand Mutation | PASS | 설정 확률 기본 0.1, 획득 최대 1회. 저장된 후보/획득 상태와 원본 불변 검증. |
| 15. Persistence/reconnect | PASS | HTTP 재조회로 reroll/잠금/특수/변이 대상/후보/적용 및 양쪽 참가자의 battle instance 보존 검증. 실제 브라우저 refresh는 UNVERIFIED. |
| 16. AI/PvP Draft Match | PASS | HTTP에서 AI 5경기를 실제 legal action으로 종료/reward까지 수행. 양쪽 PvP 25 pick과 mutation 후 authoritative battle 및 reconnect 검증. 실제 원격 PvP 한 경기 전체 플레이는 UNVERIFIED. |
| 17. 모바일 QA | UNVERIFIED | 기존 responsive stacking, 터치 버튼, 변이 UI/summary 추가 및 build 통과. Work 브라우저 localhost 접근이 ERR_BLOCKED_BY_CLIENT로 막혀 화면/터치 검증 불가. |
| 18. 기존 게임 Regression | PASS | 90개 파일 781개 테스트 통과. 이후 변경에 관련된 mutation/keyword/sanitizer 44개 및 HTTP 9개 재검증 통과. 네트워크 catalog QA, 실제 일반 PvP/Tower/Deck Editor/Collection 화면 플레이는 UNVERIFIED. |
| 19. 발견한 버그 및 수정 | FAIL → FIXED → PASS | workspace 의존성이 이전 checkout을 가리키던 문제 수정. mutation baseline에 임시 keyword/armor가 섞이지 않도록 원본 snapshot 추가. timeout mutation 중단과 stale poll, legacy summary 평균 비용도 보완했다. 테스트의 drawCard 반환 형태 오류도 수정했다. |
| 20. 남은 검증 | UNVERIFIED | 실제 모바일/브라우저 flow, 원격 PvP 체감 지연 및 전체 플레이, 실서비스 설정/배포 확인. 카드 제한 때문에 고갈된 특수 sparse pool에서 정확히 3개의 서로 다른 합법 후보를 보장할 수 없는 경우는 기존 적은 후보 동작을 유지한다. |

## 변경 파일

- `lib/game-engine/src/draft/domain.ts`, `mutations.ts`, `mutations.test.ts`, `src/index.ts`, `tsconfig.json`
- `artifacts/api-server/src/lib/draft-service.ts`, `online/sanitizer.ts`, `routes/admin-draft.ts`
- `artifacts/ko-game/src/game/cards/draft-mutation.ts`, `types.ts`, `zone-state.ts`, `game/engine/card-status.ts`
- `artifacts/ko-game/src/components/admin-draft-manager.tsx`, `alt-inspector.tsx`, `draft-config-fields.tsx`
- `lib/db/qa/draft-http.test.ts`

## PvP 성능 변경

기존 연속 action batch resync 수정은 그대로 유지한다. Draft room 변경 lock을 room별로 나눠 서로 다른 room의 polling/action 직렬화를 줄였으며 matchmaking과 row lock은 유지한다. 상태 변경 없는 heartbeat는 lastSeen만 갱신한다. viewer sanitizer는 event batch마다 숨겨진 card ID 집합을 한 번 생성한다. UI polling은 실행 중 중복 요청 및 이미 승인한 command를 덮는 오래된 응답을 차단한다.

정합성과 정보 은닉 자동 검증은 PASS. 실전 체감 렉 제거 여부는 UNVERIFIED이며 완전히 제거했다고 주장하지 않는다.

## 검증 범위 및 제한

engine/frontend/server TypeScript 검사는 PASS. Vite production build는 PASS. sourcemap 및 기존 큰 chunk 경고가 있다. HTTP 테스트는 synthetic card/auth와 격리된 PGlite를 사용했으며 실서비스 DB를 수정하지 않았다. 테스트 로그는 같은 폴더에 저장했다.

일반 regression 이후 immutable Draft baseline 보완은 해당 mutation/keyword/sanitizer 테스트 44개와 HTTP 9개로 다시 확인했다. 전체 781개를 최종 변경 뒤 다시 돌렸다는 의미는 아니다. 기존 Node 환경의 import.meta.env 의존 app test와 외부 catalog/DB 연결 테스트는 broad suite에서 제외했다.

선택 카드 잠금은 구현했다. 선택 기능인 카드 교체 event는 이번 변경에서 제외했다. Pick 25 변이는 추가하지 않았으며 완료/summary 흐름을 우선한다. 일반 카드 원본, Collection, 일반 Deck, Tower의 저장 구조를 변경하지 않았다.

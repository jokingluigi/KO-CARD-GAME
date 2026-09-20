# KO CARD GAME QA 2 결과

- API source: development API (`http://127.0.0.1:8080`)
- Published cards: 49
- QA2 card verdict: PASS 25 / FAIL 3 / UNVERIFIED 21
- Published Champions: 4
- Production DB/Supabase/user data: 변경 없음
- Development DB: 예거 Champion의 `quest_progress_required`와 `quest_condition.required`를 7로 정규화

## 예거 Champion

- 개발 DB record: `챔피언 예거`, `status=PUBLISHED`
- 수정 후 API snapshot: `questProgressRequired=7`, `questCondition.required=7`
- 실제 event processor 진행: `0/7 → 1/7 → 2/7 → 3/7 → 4/7 → 5/7 → 6/7 → 7/7`
- `7/7` 직후 `CHAMPION_QUEST_COMPLETED` 발생
- `questCompleted=true`
- `upgradedAbility`가 활성화되고 `USE_CHAMPION_ABILITY`가 성공
- 업그레이드 능력의 `SUMMON` 결과가 생성 카드로 필드에 추가됨

## 카드별 결과

| 카드 | 설명 핵심 | 실제 검증 | 결과 |
|---|---|---|---|
| RM우디르 | 현재 공격/체력 2배 | 2/3 → 4/6, maxHealth 6, ENTER_FIELD 확인 | PASS |
| 독세아 | 모든 생성 아군 +1/+1 | 손패/덱/필드 생성 카드 모두 정확히 +1/+1 | PASS |
| 디 오리진 | 묘지 선수 수만큼 +공격/+체력 | 묘지 2장 → 정확히 +2/+2 | PASS |
| 블랙 마카롱 | 손패 수만큼 +1/+1 | 손패 2장 → 정확히 +2/+2 | PASS |
| 여울 | 손패 선수 최대 3장 +1/+1 | 손패 3장 모두 정확히 +1/+1 | PASS |
| 피 스타 세븐 | 자신을 제외한 아군 +2 공격 | 실제로 자기 자신도 +2를 받음 | FAIL |
| 로드 | 카드 1장 드로우 | 덱 감소, 손패 동일 instance 증가, CARD_DRAWN | PASS |
| 아르카나 조커 | top mill 후 비용/공격/체력 -1 생성 | 묘지 이동, 덱 top 생성, 최소값 clamp 확인 | PASS |
| 씨 몬스터 | 아군 retire마다 손패 비용 -1, 최소 1 | retire event 후 4 → 3 | PASS |
| 뒷정리맨 | 다음 아군 선수 체력 +2 예약 | 턴 경과 후 다음 play에만 적용, queue 제거 | PASS |
| 오심정정 | 묘지 선수 1장 손패 이동 | 묘지 감소, 동일 instance 손패 증가 | PASS |
| 라 칼라베라 | 비용 3 이하 묘지 선수 revive | 동일 instance가 묘지에서 필드로 이동, `entryCause=REVIVE` | PASS |
| 나토마토 | 마지막 아군 공격력만큼 공격 증가 후 턴 종료 0 | 4 공격 attacker → 정확히 +4, 턴 종료 0 | PASS |
| 보드바 | 자기 공격마다 다음 턴 골드 +1 | self attack 후 `nextTurnGoldBonus=1` | PASS |
| 루나 | 첫 공격자 침묵, 능력 비활성화 | enemy attacker 침묵, Luna ability disabled | PASS |
| 판도라 | 1 damage 후 체력 1이면 자신 +2/+2 | 2 → 1 damage, 자기 +2/+2 | PASS |
| 퍼플레인 | 적 공격력 -2, 0이면 기절/침묵 | 2 → 0, stunned/silenced 모두 확인 | PASS |
| 플래티넘 구슬 마스터 | 남은 골드 전부 소비, G당 +2/+2 | 3G → 0G, 정확히 +6/+6 | PASS |
| 발단 | 생성 카드 파괴 후 현재 능력치 합산 좀비 소환/도발 | 2/3 + 4/5 → 좀비 6/8, TAUNT | PASS |
| 휴먼쿠커 | 선택 아군 2 회복 | 1 → 3 | PASS |
| 데헌 | 첫 공격력 증가 시 회피 1 | `STAT_CHANGED` attack gain 후 DODGE 1 | PASS |
| 용병 | SUMMON 경로 | generated, definition/stats, SUMMON entry 확인 | PASS |
| 엘리트 용병 | SUMMON 경로 | generated, definition/stats, SUMMON entry 확인 | PASS |
| 잔상 | SUMMON 경로 | generated, definition/stats, SUMMON entry 확인 | PASS |
| 위리녀 | SUMMON 경로 | generated, definition/stats, SUMMON entry 확인 | PASS |
| 좀비 | SUMMON 경로 | generated, definition/stats, SUMMON entry 확인 | PASS |
| 조킹루이지 | 양옆 무작위 선수 소환/도발 | published definition에 runtime ability가 없어 아무 카드도 소환되지 않음 | FAIL |
| 그레이트 챤 | 액티브 공격/체력 교환 | published definition에 runtime ability가 없어 교환되지 않음 | FAIL |

## UNVERIFIED

현재 QA2에서 실제 수치 oracle을 추가하지 못한 published 카드:

`도쿵`, `레이븐`, `만드릴쿤`, `매드 펌킨`, `벨로나`, `숨 고르기`, `스카드`, `아비터`, `예거`, `워썬더`, `위리놈`, `저지먼트`, `챔피언 판도라(폭주)`, `카미사토르`, `태그 체인지`, `트래쉬 토크`, `팬텀워커`, `하스이`, `황소할배`, `흑구슬마스터`, `히트 온`

이 목록은 crash/action accepted를 PASS로 올리지 않고 남긴 것이다.

## FAIL 재현

### 피 스타 세븐

- 초기 상태: 피 스타 세븐과 다른 아군 선수를 필드에 배치
- Action: 피 스타 세븐을 필드에 진입
- 기대 결과: 다른 아군만 공격력 +2, 피 스타 세븐은 원래 공격력 유지
- 실제 결과: 피 스타 세븐도 +2를 받아 `excludeSource` 조건이 runtime target filtering에 반영되지 않음
- Event/상태: 아군은 +2, source도 +2
- 관련 위치: `src/game/effects/effect-engine.ts`의 structured target eligibility 처리

### 조킹루이지

- 초기 상태: published `조킹루이지`, 양옆 빈 슬롯, 비용 3 이상 published wrestler pool
- Action: 필드 진입
- 기대 결과: 양옆 빈 슬롯에 무작위 wrestler 소환 및 TAUNT
- 실제 결과: runtime `abilities`가 비어 있어 소환/TAUNT event와 board card가 없음
- 관련 위치: `src/game/cards/published-cards.ts`의 published effect-to-ability mapping 및 해당 DB definition

### 그레이트 챤

- 초기 상태: 현재 공격 3, 현재 체력 7, maxHealth 9
- Action: ACTIVE 사용
- 기대 결과: 공격 7, 체력 3
- 실제 결과: runtime `abilities`가 비어 있어 상태가 3/7 그대로임
- 관련 위치: `src/game/cards/published-cards.ts`의 legacy/published effect mapping 및 해당 DB definition

## Token/Champion Token 경계

- 일반 Token은 손패 일반 플레이가 아니라 SUMMON 경로로 검증했다.
- 생성 Token은 `isGenerated=true`, stable `definitionId`, stats, `ENTER_FIELD.entryCause=SUMMON`을 확인했다.
- SUMMON된 Token은 `CARD_PLAYED`가 없고 손패 play용 ENTER_FIELD effect를 재실행하지 않았다.
- Champion Token 직접 전개는 `isDirectDeployedChampion=true`, `isSilenceImmune=true`, Champion current HP 합산, `entryCause=CHAMPION_DEPLOY`를 확인했다.
- 일반 소환된 동일 Champion Token definition은 직접 전개 보호를 받지 않았다.

## 실행한 QA

- `artifacts/ko-game/src/game/qa/published-effects-qa2.test.ts`
- API snapshot과 실제 engine `GameState`/Event 결과를 사용
- targeted invalid selection rejection도 확인
- 기존 `alt-inspector.test.ts`의 `import.meta.env.BASE_URL` 문제는 stale browser-only test로 분리

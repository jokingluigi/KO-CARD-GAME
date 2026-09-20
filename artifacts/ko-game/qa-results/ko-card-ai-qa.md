# KO CARD GAME AI/효과 QA 결과

- API source: http://127.0.0.1:8080
- Published cards: 49
- Published Champions: 4
- DB/storage mutation: 없음
- Deterministic seed: 20260920

## 요약

- 카드 verdict: PASS 17 / FAIL 0 / UNVERIFIED 32
- Champion dimension hits: PASS 4 / FAIL 1 / UNVERIFIED 2
- 알려진 카드 목록 누락: 밀크 메이드

## 카드별 결과

| 이름 | 타입 | 결과 | Action/Event | 설명/수치 비교 | 테스트 | 비고 |
|---|---|---|---|---|---:|---|
| RM우디르 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 그레이트 챤 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 나토마토 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 데헌 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 도쿵 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 독세아 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 뒷정리맨 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 디 오리진 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 라 칼라베라 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 레이븐 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 로드 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 루나 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 만드릴쿤 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 매드 펌킨 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 발단 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 벨로나 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 보드바 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 블랙 마카롱 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 숨 고르기 | TECHNIQUE | PASS | PASS | PASS | 2 | - |
| 스카드 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 씨 몬스터 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 아르카나 조커 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 아비터 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 엘리트 용병 | WRESTLER | UNVERIFIED | UNVERIFIED | UNVERIFIED | 2 | token은 일반 hand-play가 아닌 summon/deploy 경로 대상 |
| 여울 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 예거 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 오심정정 | TECHNIQUE | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 용병 | WRESTLER | UNVERIFIED | UNVERIFIED | UNVERIFIED | 2 | token은 일반 hand-play가 아닌 summon/deploy 경로 대상 |
| 워썬더 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 위리녀 | WRESTLER | UNVERIFIED | UNVERIFIED | UNVERIFIED | 2 | token은 일반 hand-play가 아닌 summon/deploy 경로 대상 |
| 위리놈 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 잔상 | WRESTLER | UNVERIFIED | UNVERIFIED | UNVERIFIED | 2 | token은 일반 hand-play가 아닌 summon/deploy 경로 대상 |
| 저지먼트 | TECHNIQUE | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 조킹루이지 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 좀비 | WRESTLER | UNVERIFIED | UNVERIFIED | UNVERIFIED | 2 | token은 일반 hand-play가 아닌 summon/deploy 경로 대상 |
| 챔피언 판도라(폭주) | WRESTLER | UNVERIFIED | UNVERIFIED | UNVERIFIED | 2 | token은 일반 hand-play가 아닌 summon/deploy 경로 대상 |
| 카미사토르 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 태그 체인지 | TECHNIQUE | PASS | PASS | PASS | 2 | - |
| 트래쉬 토크 | TECHNIQUE | PASS | PASS | PASS | 2 | - |
| 판도라 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 팬텀워커 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 퍼플레인 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 플래티넘 구슬 마스터 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 피 스타 세븐 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 하스이 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 황소할배 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 휴먼쿠커 | WRESTLER | UNVERIFIED | PASS | UNVERIFIED | 2 | 정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음 |
| 흑구슬마스터 | WRESTLER | PASS | PASS | PASS | 2 | - |
| 히트 온 | TECHNIQUE | PASS | PASS | PASS | 2 | - |

## Champion별 결과

| Champion | Base | Quest | Upgrade | Token | 비고 |
|---|---|---|---|---|---|
| 챔피언 여울 | PASS | PASS | PASS | PASS | - |
| 챔피언 예거 | PASS | FAIL | UNVERIFIED | PASS | 요청 기준 required=7, published data는 8 |
| 챔피언 판도라 | PASS | UNVERIFIED | UNVERIFIED | PASS | deterministic quest event progression and completion passed |
| 챔피언 피 스타 세븐 | PASS | PASS | PASS | PASS | - |

## Quest 진행 로그

### 챔피언 예거: FAIL
- observed deterministic engine progression: yes
- observed natural full-match progression: no
- steps: 0/8 → 1/8 → 2/8 → 3/8 → 4/8 → 5/8 → 6/8 → 7/8 → 8/8
- notes: 요청 기준 required=7, published data는 8

### 챔피언 판도라: UNVERIFIED
- observed deterministic engine progression: yes
- observed natural full-match progression: no
- steps: 0/5 → 1/5 → 2/5 → 3/5 → 4/5 → 5/5
- notes: deterministic quest event progression and completion passed

## FAIL 상세 재현

- 대상: 챔피언 예거
- 초기 상태: published Champion snapshot, questProgress=0, deterministic CARD_GENERATED/CARD_RETIRED event fixture
- 실행 흐름: 실제 quest event processor에 이벤트를 넣고 progress/completion event와 저장된 Champion state를 확인
- 기대값: 7회에서 7/7 완료 및 강화
- 실제값: 8/8까지 완료 기준이 적용됨
- 관련 로그: 요청 기준 required=7, published data는 8
- 심각도: Medium — 즉시 게임이 중단되지는 않지만 Quest reward/upgrade 시점이 달라짐

## STALE_TEST

- `src/components/alt-inspector.test.ts`: Node 직접 실행 시 `import.meta.env.BASE_URL`가 없어 모듈 import 단계에서 실패했다. Vite 브라우저 환경 전용 테스트 설정 문제로 분류했으며 게임 엔진 버그로 집계하지 않았다.

## 범위와 제한

- 각 published card는 현재 API snapshot에서 수집한 실제 definition으로 일반 `PLAY_WRESTLER` 또는 `PLAY_TECHNIQUE` 경로를 실행했다.
- target이 필요한 효과는 먼저 invalid target rejection을 확인한 뒤 deterministic fixture의 첫 valid target을 선택했다.
- token은 일반 hand-play 대상이 아니므로 직접 play 대신 `UNVERIFIED`로 기록했다.
- 효과 설명과 실제 결과의 완전한 differential oracle이 없는 항목은 `UNVERIFIED`이며, crash가 없었다는 이유만으로 PASS 처리하지 않았다.
- 이 QA runner는 버그를 자동 수정하지 않는다.


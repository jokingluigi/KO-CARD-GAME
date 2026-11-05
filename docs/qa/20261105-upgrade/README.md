# 업그레이드 키워드 구현 및 검증

브랜치: `feat/program-keyword`. 게임 표시 명칭은 **업그레이드(X)**이며 저장된 DSL·키워드·이벤트의 내부 식별자 `PROGRAM`은 유지한다. 과거 `프로그램(X)` 문장도 분석할 수 있다. 운영 DB 변경, 운영 배포, main 병합은 하지 않았다.

## 실제 구현

- 공통 효과 DSL에 자동 추가 비용 그룹을 추가했다. 기본 카드 비용을 먼저 지불하고 정상 등장한 뒤, 유효 대상과 남은 골드를 검사한다. 추가 비용을 기본 비용과 합산하지 않는다.
- 필요한 대상이 없거나 골드가 부족하면 그룹만 건너뛰며 일반 등장 효과와 소환은 계속된다. 대상 없는 효과도 같은 인터프리터를 사용한다. 소환 그룹은 필드 공간과 소환 정의도 확인한다.
- 결제 성공은 `GOLD_CHANGED / CARD_EFFECT_COST`와 `PROGRAM_ACTIVATED` 이벤트로 기록한다. 기존 피니셔 준비의 골드 누적 집계에 포함된다. 대상 선택 후 누적이 중복되지 않는지도 검사했다.
- 기존 효과 프레임에 결제 완료 상태와 남은 효과를 직렬화한다. 이미 결제한 선택은 취소하거나 이전 카드 사용 전체를 되돌릴 수 없다. 선택 완료 후 이어지는 별도의 선택 효과에는 원래의 선택 규칙을 적용한다.
- 등장 사건·카드 인스턴스·원래 능력 인덱스·효과 인덱스가 중복 방지 키다. 같은 사건 재처리, 골드 재충전, 다른 능력 조건 변화로 결제가 반복되지 않는다. 새 등장 사건은 새로 발동할 수 있다.
- 서버에서 유효 대상·골드·카드 이동·요청 버전을 검증한다. 선택 중 기존 턴 제한 시간이 지나도 결제한 효과가 삭제되지 않는다. 상대는 공개 골드와 선택 대기 안내를 받고, 비공개 선택 프레임은 받지 않는다.
- 기존 등장 규칙을 유지한다. 현재 엔진의 직접 사용과 `CHAMPION_DEPLOY`는 등장 효과를 실행한다. 일반 `SUMMON`과 `REVIVE`가 등장 효과를 재실행하지 않던 규칙은 바꾸지 않았다. `SELF_ENTERED` 등 다른 기존 트리거에도 같은 그룹을 정의할 수 있다.
- 일반 등장 효과와 업그레이드 그룹을 정의 순서대로 해결한다. 각 그룹의 조건을 다른 등장 효과에 합치지 않는다. 강화에 따른 기존 스탯 변경 연쇄도 재사용한다.
- 카드 상세 툴팁, 카드 키워드, 관리자 선택·효과 라이브러리, 전투 로그, 450ms 카드 강조에 새 명칭을 적용했다. 전용 자원·아이콘·오라는 추가하지 않았다. 연출 완료를 판정의 조건으로 삼지 않는다.
- AI는 실제 엔진 결과를 탐색한다. 추가 결제 없이 일반 소환하는 상황과, 추가 효과를 얻는 상황을 구분하며 필요한 대상을 자동 선택한다. 키워드 표시 자체에 별도의 지속 전투 가치를 더하지 않는다.

## 관리자 등록 방법과 데이터

기존 카드 관리자에서 카드 기본 비용을 그대로 설정한다. 효과 문장에 다음과 같이 입력한 후 기존 효과 분석·적용 기능으로 구조화한다. 수동 등록 시 효과 ID는 `STRUCTURED_EFFECTS_V1`이다.

```text
등장 — 업그레이드(2): 다른 아군 좀비 1장에게 +2/+2를 부여합니다.
```

기본 비용 2는 카드 비용 필드이며 아래의 `programCost: 2`와 별개다. 키워드 선택 표시명은 ‘업그레이드’다.

```json
{
  "effects": [
    {
      "trigger": "ENTER_FIELD",
      "action": "PROGRAM",
      "values": {
        "programCost": 2,
        "programEffects": [
          {
            "action": "BUFF",
            "target": {
              "zone": "BOARD",
              "owner": "SELF",
              "cardType": "WRESTLER",
              "selection": "PLAYER_CHOICE",
              "count": 1,
              "filter": {
                "excludeSource": true,
                "definitionRef": { "name": "좀비" }
              }
            },
            "values": { "attack": 2, "health": 2 }
          }
        ]
      }
    }
  ]
}
```

`programCost`는 0~999의 정수로 검증한다. 실제 보유 골드와 게임의 최대 골드 규칙은 기존 엔진을 따른다. `programEffects`는 기존 효과 정의를 사용하며 1~10개의 순서 있는 효과를 담는다. 직접 중첩한 PROGRAM 그룹은 허용하지 않는다. 일반 등장 효과를 별도 효과 항목으로 앞뒤에 추가할 수 있다. 주문·고유능력의 확정된 효과에서도 그룹을 재사용할 수 있도록 검증·사전 대상 선택 처리와 연결했다.

자연어 분석은 명시적인 등장형 업그레이드 문장을 지원한다. 분석에 실패한 문장을 성공으로 간주하지 않는다. 복잡한 효과는 기존 구조화 설정과 검증을 사용한다. 특정 챔피언·좀비 전용 실행 코드는 추가하지 않았다.

## 실제 실행 결과

| 검증 | 결과 |
| --- | --- |
| 공통 게임 엔진 회귀 | 1,017개 통과 |
| 업그레이드 엔진·문장/데이터 검증·표시·요청 검증 묶음 | 36개 통과 |
| API 라이브러리·온라인 검증·상태 공개 범위·표시 회귀 | 298개 통과 |
| 격리 DB 관리자 저장·PvP·재접속·중복 요청 | 3개 통과 |
| 기존 보상 회귀의 격리 DB 재실행 | 15개 통과 |
| 전체 `pnpm build` | 타입 검사 및 프런트·서버 빌드 통과 |
| 실제 온라인 대전 화면 | 390×844, 844×390, 1440×900에서 양측 화면 확인 |

핵심 테스트에는 보유 골드 2/3/4/6, 기본 비용 감소·증가, 유효 대상 없음, 카드 기본 소환 유지, 대상 선택 중 취소·잘못된 대상·상대 요청 거부, JSON 복원, 동일 등장 중복 방지, 새 등장, 일반 효과와 복수 그룹의 순서, 스탯 연쇄, 골드 누적, AI 선택·비용에 따른 판단 차이, 필드 제한이 있는 타워 컨텍스트, 미래 주문에서의 그룹 재사용이 포함된다.

브라우저 검증은 정적 목업이 아니다. 실제 `/online/match/:id` 화면 두 개를 열어 카드 사용과 대상 선택을 수행했다. WebSocket 전송 경로는 로컬에서 실제 온라인 서비스와 임시 PGlite DB로 연결했다. 실제 외부 운영 서버에 접속한 네트워크 부하 검증은 아니다. 모바일 두 방향은 터치 입력을 사용했다. 새로고침 후 선택 복구, 양측 골드 0 표시, 대상 +2/+2 한 번 적용, 취소 버튼 없음, 새 명칭 툴팁을 확인했다. 화면은 이름·능력을 명시한 테스트 카드이며 일러스트가 없는 대체 표시를 사용했다. 테스트 카드를 운영 풀에 추가하지 않았다.

초기 광범위 실행에서 모듈 모킹 실행 옵션 누락 1건, 로컬 PostgreSQL 미기동에 의한 보상 테스트 6건, 예전 `QUEST COMPLETE` 문구를 기대하던 테스트 1건이 실패했다. 모킹 옵션을 추가하고 기존 표시 테스트의 기대값을 현재 ‘피니셔 준비 완료’에 맞췄다. 보상 검증은 별도 임시 DB 실행기로 분리했다. 이 과정에서 보상 로직이나 운영 데이터를 바꾸지 않았다.

실행기:

- `docs/qa/upgrade-service.test.mjs`: 실제 관리자 HTTP API·온라인 서비스·영속화, 격리 DB.
- `docs/qa/upgrade-browser.mjs`: 실제 온라인 화면 두 개, PC/모바일, 로컬 서비스 연결.
- `docs/qa/upgrade-isolated-rewards.test.mjs`: 기존 보상 회귀를 임시 DB로 실행.

## 실제 동작 자료

- [모바일 대상 선택](mobile-target.png)
- [모바일 툴팁](mobile-tooltip.png)
- [PC 적용 결과](pc-resolved.png)
- [모바일 실제 대전 영상](mobile-match.mp4)
- [브라우저 검증 결과](browser-results.json)

## 검증 범위와 남은 확인

PvP는 격리 서버와 실제 양측 화면에서 확인했다. AI의 합리적인 카드·대상 선택과 타워 컨텍스트 처리는 실제 공통 엔진 테스트로 확인했다. 드래프트 선택 과정부터의 전체 대전, 타워 입장부터 종료까지, 빠른 대전 매칭 큐, 운영 환경의 실제 기기·실제 네트워크 지연은 이번에 끝까지 실행하지 않았다. 해당 모드는 공통 엔진을 사용하지만 이를 각각의 전체 흐름 검증 통과로 보고하지 않는다. 실제 운영 카드·밸런스·골드 상한·턴 초기화·챔피언 능력·피니셔 준비 조건은 변경하지 않았다.

미확정 카드를 추가하지 않았으므로 실제 카드 풀 등록과 카드별 밸런스 검증은 별도 확정 이후 필요하다. 이번 기능은 브랜치에만 구현했다.

## 변경 파일

- `artifacts/api-server/src/lib/program.test.ts`
- `artifacts/api-server/src/lib/structured-effects.ts`
- `artifacts/api-server/src/online/action-validation.test.ts`
- `artifacts/api-server/src/online/action-validation.ts`
- `artifacts/api-server/src/online/sanitizer.ts`
- `artifacts/api-server/src/online/service.ts`
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/ko-game/src/components/action-history-utils.ts`
- `artifacts/ko-game/src/components/admin-card-manager.tsx`
- `artifacts/ko-game/src/components/alt-inspector-utils.ts`
- `artifacts/ko-game/src/components/card-renderer.tsx`
- `artifacts/ko-game/src/components/game-state-preview.tsx`
- `artifacts/ko-game/src/components/presentation-feedback-utils.test.ts`
- `artifacts/ko-game/src/components/presentation-feedback-utils.ts`
- `artifacts/ko-game/src/components/upgrade-presentation.test.ts`
- `artifacts/ko-game/src/game/actions/ai-evaluator.ts`
- `artifacts/ko-game/src/game/actions/engine-actions.ts`
- `artifacts/ko-game/src/game/cards/published-cards.ts`
- `artifacts/ko-game/src/game/effects/effect-engine.ts`
- `artifacts/ko-game/src/game/effects/types.ts`
- `artifacts/ko-game/src/game/engine/play-wrestler.ts`
- `artifacts/ko-game/src/game/engine/program.test.ts`
- `artifacts/ko-game/src/game/engine/program.ts`
- `artifacts/ko-game/src/game/events/types.ts`
- `artifacts/ko-game/src/game/types/game-state.ts`
- `artifacts/ko-game/src/pages/online-match.tsx`
- `docs/qa/upgrade-browser.mjs`
- `docs/qa/upgrade-isolated-rewards.test.mjs`
- `docs/qa/upgrade-service.test.mjs`
- `lib/effect-registry/src/index.ts`
- `lib/game-engine/src/index.ts`

추가 자료: 이 보고서와 같은 폴더의 스크린샷·영상·브라우저 결과 JSON.

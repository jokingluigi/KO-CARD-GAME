# KO CARD GAME 품질 개선 — 묶음 A

2026-11-28 한국 시간 기준. 사용자가 첨부한 `KO_CARD_GAME_GPT_CLAUDE_DEV_BRIEF_2026-11-28.md`를 지시서로 적용했다. 문서의 원인 추정은 그대로 채택하지 않고 현행 공개 규칙·실행 결과를 대조했다.

## 작업 기준과 보존

- 기준 운영 코드: `d5f5d8812988169998fca07d2f600c50cf7e9b96`. 실제 API healthz와 프런트 version.json, 원격 production이 모두 일치했다. 처음 문서에 나온 main/feature SHA는 기준으로 사용하지 않았다.
- 작업 브랜치: `codex/quality-bundle-a-20261128`, 폴더 `/workspace/ko-quality-bundle-a-20261128`.
- 기존 `/workspace/KO-CARD-GAME`의 카드/효과 미커밋 작업을 덮어쓰거나 정리하지 않았다. 최신 production의 명예로운 처치·광역 피해·퇴장 순서·연출 패치를 유지했다.
- **운영 미배포. 운영 DB·계정·보상·덱·요금제·카드 밸런스 변경 없음.** 공개 카탈로그와 버전의 GET 조회만 사용했다. 브라우저 QA의 API는 mock이며 외부 요청을 차단했다.
- 전체 36개 항목의 현행/미검증 분류: [ISSUE_TRIAGE.md](../qa/20261128-quality-a/ISSUE_TRIAGE.md). 이번 구현 범위는 묶음 A와 결과 확인 중 발견한 클릭 결함이다.

## 항목별 변경·검증

파일 경로의 `src/`는 `artifacts/ko-game/src/`를 뜻한다.

| ID | 현행 재현 결과 | 원인/의도 | 변경 파일 | 변경 내용 | 수행한 검증과 결과 | 미수행 검증 | 상태 |
|---|---|---|---|---|---|---|---|
| A1 · Q08/Q09 | 판도라 선택 안내가 ‘현재 효과’, 버튼은 일반 능력명. 상세 inspector 자체는 이미 존재. | 챔피언 합성 source에는 카드 정의가 없고, 원 능력 정보는 별도 데이터에 있음. | `src/lib/battle-action-explanation.ts`, `src/components/game-state-preview.tsx`, `src/components/battle-action-explanation.css` | 현행 능력/override의 이름·본문·실제 비용·대상 조건을 사용. 사용 전 ‘설명’, 선택 중 ‘효과 설명’을 터치/클릭으로 열기. 기존 inspector 보존. 모달 위 화살표/선택 마스크 겹침도 방지. | 현재 공개 판도라의 양쪽 선수 대상, 아군 벨로나 피해 후 좀비 소환, PRE_COMMIT 취소 후 골드/사용 횟수/이벤트 보존, 확정 1회 지불, override 데이터 사용. 데스크톱/390px 모의 터치 설명창 열기·닫기 및 상태 불변 통과. | 모든 챔피언 본문/복합 효과 UI 전수, 실제 휴대전화. | 코드 수정·해당 검증 완료 / 미배포 |
| A2 · Q10 | AI 선택 중 사람용 ‘0개 선택 가능·선택 취소’ 노출을 로컬에서 재현. | UI가 targeting 활성 여부만 읽고 소유자를 확인하지 않음. | `src/lib/battle-action-explanation.ts`, `src/components/game-state-preview.tsx` | 선택 UI와 강조는 권리가 있는 플레이어에게만 표시. 다른 행위자는 대기 안내. 진행 중 선택 동안 새 턴 종료/소환 차단 유지. | AI의 실제 선택 후 해소, 대상 없음의 무지불 실패, 상대 턴의 내 선택 UI 보존. 데스크톱·모의 터치에서 AI 취소 버튼 0개/내 응답 취소 1개 확인. | 운영 AI 한 판, 실제 PvP 반응 규칙 전체. | 코드 수정·해당 검증 완료 / 미배포 |
| A3 · Q11 | 2골드에서 기본 1 + 자동 업그레이드 1을 지불해 2/2가 되는 엔진 결과 확인. | 정상 규칙. 사용 전 최종 지불 안내가 없고 `PROGRAM_ACTIVATED`가 로그 표시 목록에서 빠져 있음. | `src/lib/card-play-preview.ts`, `src/components/game-state-preview.tsx`, `src/components/battle-action-explanation.css`, `src/components/action-history-utils.ts` | 선택된 업그레이드 카드만 실제 엔진을 복제 상태에서 실행해 기본/추가/합계와 소환 능력치 표시. 위치별 결과를 슬롯에도 표시. 기본 지불과 업그레이드 로그를 복구. 규칙·피해·지불액 미변경. | 1골드→1/1, 2골드→2/2, 기본 비용 부족, 강화 대상 부재, 추가 비용 면제, 원 상태 불변. 데스크톱과 모의 터치의 사용 전 ‘1+1=2골드, 2/2’ 통과. | 대상 선택 뒤에야 계산 가능한 복합/무작위 후속 효과의 전체 카탈로그. 이 경우 현재 계산분과 선택 후 확정을 구분해 표시하며 정확한 최종값으로 주장하지 않음. | 신입 사이드킥 및 검사한 공통 경로 완료 / 미배포 |
| A4 · Q12 | 폭죽광이 2/2 불록스에 1피해 두 번을 기록하나 펼친 UI에서 한 타격이 사라짐. | 같은 문자열의 서로 다른 이벤트를 UI가 중복으로 제거. 엔진의 총 2피해는 정상. | `src/components/action-history-utils.ts`, `src/components/action-history.tsx` | 문장 기준 삭제 제거. 헤더와 같은 **이벤트**는 반복 표시하지 않되 별개 타격은 모두 유지. 체력 2→1, 1→0 표시. 기술의 선행 비용도 같은 행동 묶음에 포함하고 회복 연결은 실제 행동 인덱스 유지. | 같은 대상 두 타격/분산 두 타격/전후 체력이 없는 옛 이벤트/헤더 중복 배제/지불 로그 묶음 통과. 브라우저 실제 로그의 두 타격과 리타이어 확인. | 기존의 모든 역사 경기 형식, 실제 온라인 한 판. | 코드 수정·해당 검증 완료 / 미배포 |
| A5 · Q13 | 전투판 1/8·4/8 대비 결과표 0/8·0/8 재현. | 최종 상태 유실이나 초기화가 아니라 `questConditionCounts` 대 `questProgress` 매핑 불일치. | `src/lib/champion-preparation-progress.ts`, `src/components/finisher-progress.tsx`, `src/lib/match-summary.ts`, `src/components/match-result-overlay.tsx` | 전투판의 기존 계산 함수를 공용으로 옮겨 결과도 사용. ‘종료 시 피니셔 준비’와 실제 `CARD_PLAYED` 기반 ‘피니셔 사용 횟수’ 분리. 선택지 진행도도 공통 표현 사용. | 1/8·4/8, 실제 조건 달성→보상 지급→미사용 8/8·0회→실제 사용 후 종료 8/8·1회, 초기화된 상태의 별도 진행도/사용 횟수, 자동 발동과 선택지 통과. 데스크톱/모의 터치 결과표 확인. | 전체 챔피언·실제 정식 대전 연출 완주. 최고 진행도 이력은 수집되지 않아 표시/추정하지 않음. | 코드 수정·해당 검증 완료 / 미배포 |
| 추가 · Q18 결과 버튼 | 패배 상태에서는 마우스 클릭이 html에 막혀 상세 결과를 못 엶. 수정 전 키보드로만 확인 가능. | VFX의 `[class^=kj-]` pointer-events 규칙이 `html.kj-defeat-gray`까지 포함. | `src/components/battle-juice.css` | 연출 레이어의 클릭 방지 대상에서 html만 제외. 패배 시각 효과와 기존 결과 도구 유지. | 수정 전 computed pointer-events `none`, 수정 후 `auto`. 실제 마우스 클릭·모의 터치로 상세 결과 열기 통과. | 실제 모바일 브라우저의 패배 한 판. | 코드 수정·해당 검증 완료 / 미배포 |

## 테스트 자료와 재현

- 신규 회귀는 `artifacts/ko-game/src/game/qa/quality-bundle-a.test.ts`. 공개 카드·챔피언의 필요한 필드만 고정한 JSON과 `artifacts/ko-game/qa/quality-a-fixture.ts`를 사용한다. 로그인·운영 DB·무작위 드로우에 의존하지 않는다. 분산 피해는 유한한 고정 seed 탐색으로 동일 결과를 재현한다.
- 관련 회귀: **162개 통과**, 그중 신규 **18개**. 기존 업그레이드·챔피언·피니셔·취소·최근 명예로운 처치·동시 퇴장/광역 피해·로그/결과 테스트 포함. 프로젝트 전체 테스트를 전부 실행했다는 뜻은 아니다.
- 라이브러리 빌드 타입 검사, 프런트/API 타입 검사, 프런트/API 빌드, diff 공백 검사 통과. 정확한 명령·종료 코드는 [verification.json](../qa/20261128-quality-a/verification.json), 출력은 같은 폴더의 `.log` 파일에 있다.
- 브라우저: 로컬 Chromium 1440×1000 마우스 및 390×844 `isMobile/hasTouch` 모의 터치. 각 7개 시나리오 확인, pageerror 0. 실제 Android/iOS 장비 검증이 아니다.
- 수정 전은 동일 SHA의 별도 `/tmp/ko-quality-a-before`에서 실행했다. UI 소스는 원본이며 고정 QA 픽스처만 추가했다. 수정 전 패배 상세 결과는 pointer-events 결함 때문에 키보드로 열었다. 수정 후는 정상 마우스 클릭/모의 터치로 열었다.
- 기본 Node/TypeScript 의존성은 기존 설치를 재사용하되 workspace 링크는 해당 작업 폴더를 가리킨다. 빠져 있던 lockfile의 `canvas-confetti@1.9.4`, `@types/canvas-confetti@1.9.0`만 작업용 의존성 폴더에 보완했다. package.json/lockfile 변경 없음.
- 실제 음악 청취, FPS/서버 메모리 계측, 신규 계정 지급·결제, PvP 전체 경기, 모바일 한 판 완주는 하지 않았다.

```sh
# 저장소 루트
node docs/qa/20261128-quality-a/verify.mjs
# 별도 터미널, 로컬 QA 프런트
PORT=5187 BASE_PATH=/ node artifacts/ko-game/node_modules/vite/bin/vite.js --config artifacts/ko-game/vite.config.ts --host 127.0.0.1
node docs/qa/20261128-quality-a/browser.mjs after
KO_QUALITY_MOBILE=1 node docs/qa/20261128-quality-a/browser.mjs after
```

브라우저는 `docs/qa/black-gold-playwright.mjs`의 기존 로컬 Chromium 설정을 사용한다. 다른 머신에서는 `KO_QA_BOARD_BASE_PLAYWRIGHT`, `KO_QA_CHROMIUM_EXECUTABLE`에 설치 위치를 지정한다.

## 화면 자료

- [선택 중 효과 설명](../qa/20261128-quality-a/after/ability-detail.png), [사용 전 능력 설명](../qa/20261128-quality-a/after/ability-before-use.png)
- [신입 사이드킥 비용](../qa/20261128-quality-a/after/sidekick.png), [두 타격의 로그](../qa/20261128-quality-a/after/fireworks.png), [최종 진행도](../qa/20261128-quality-a/after/result.png)
- [모의 모바일 효과 설명](../qa/20261128-quality-a/after-mobile/ability-detail.png), [모의 모바일 비용](../qa/20261128-quality-a/after-mobile/sidekick.png), [모의 모바일 결과](../qa/20261128-quality-a/after-mobile/result.png)
- 원본 전후 수치: [before/results.json](../qa/20261128-quality-a/before/results.json), [after/results.json](../qa/20261128-quality-a/after/results.json), [after-mobile/results.json](../qa/20261128-quality-a/after-mobile/results.json).

샘플 화면의 아트 누락은 계정·외부 저장소 요청을 차단한 로컬 픽스처 조건이다. 운영 그림이 삭제됐다는 뜻이 아니다. 결과의 +200 표시는 기존 QA harness의 고정 표시일 뿐이며 실제 계정 지급은 발생하지 않는다.

## 다음 범위

B/C의 새 방문→가입→완성 덱→정식 첫 AI 및 실기기 완주는 후속 범위다. 현재 판정은 전체 이슈 분류표에 보존했다. 이 패치를 운영에 반영하려면 **별도 배포 승인**이 필요하며, 이번에는 배포 명령·운영 데이터 변경을 실행하지 않았다.

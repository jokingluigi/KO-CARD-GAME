# 다크 우드 × 베이지 천 전투 보드 — 검토용 구현

2026-10-20. 최신 main `ac30343` 확인 후, 기존 프로토타입 `6e4bd1c`를 보존한 `feat/wood-cloth-battle-board-preview`에서 작업했다. 기존 분석 및 첫 프로토타입은 PR #64에 보존되어 있다. **운영 배포, main 병합, Production DB 접근·변경은 하지 않았다.**

## 구현과 배경 겹침 수정

- 화면 전체에 가로 원목 판자를 표현하는 원본 SVG를 고정된 타일 크기로 사용한다. 두 필드에 별도의 투명 SVG 천을 배치했다. 천은 불규칙한 가장자리·모서리 접힘·평평한 중앙을 갖고, 아래 나무가 보인다. 참고 시안 전체를 배경으로 쓰지 않았다.
- 천은 필드 행의 장식 가상 요소이며 `pointer-events:none`, 행 내부의 독립 스택을 사용한다. 슬롯 안쪽 공간을 차지하지 않으므로 기존 카드 너비와 드래그 영역을 줄이지 않는다. 내 필드의 천만 좌우 반전한다. 게임 화면 전체에는 scale을 적용하지 않는다.
- 검은색이 새 배경을 가리던 원인은 `premium-presentation.css`의 `.ko-board-area::before`였다. 기존 영역을 `display:contents`로 배치하면 절대 위치의 검은 가상 배경이 새 전장 전체로 퍼진다. **새 보드 범위에서 `content:none; display:none`으로 해당 장식 생성 자체를 중단**했다. 기존 `.ko-cinematic-background`도 새 테마에서만 비활성화한다. z-index만 높여 덮는 방식이 아니다.
- 새 테마에서는 기존 선택 배경·타워 배경의 장식 이미지 대신 우드 테이블을 사용한다. 해당 설정·리소스·전투 연출은 삭제하지 않았고 CLASSIC에서는 기존 배경이 유지된다. 카드 소환·공격·피해·각성 등의 연출은 배경 장식과 분리되어 있다.
- 중앙 직사각형 챔피언 HUD, 원본/스킨 이미지의 CONTAIN, 실제 HP·골드·퀘스트·고유 능력·감정표현 연결은 첫 프로토타입을 유지한다. 카드 프레임·렌더러·엔진·서버·프로토콜·데이터는 이번 수정에서 변경하지 않았다.
- production 빌드에서 테마 스위치, 미리보기 CSS, 새 SVG와 QA 진입점이 제외되는 것을 검사했다. 운영 UI는 바뀌지 않는다.

## 변경 파일

이번 후속 작업에서 실제 수정/추가한 파일:

| 파일 | 목적 |
|---|---|
| `artifacts/ko-game/src/components/battle-board.css` | 우드 배경, 별도 천 레이어, 빈 슬롯 코너·가이드, 손패 받침, 기존 검은 배경/이미지 비활성화. 개발 전용 범위 유지 |
| `artifacts/ko-game/src/components/battle-board-assets/walnut-table.svg` | 가벼운 가로 원목 테이블 원본 리소스 |
| `artifacts/ko-game/src/components/battle-board-assets/linen-field.svg` | 투명 배경의 독립된 베이지 천 원본 리소스 |
| `docs/qa/black-gold-artwork-cache.py` | 기존 로컬 일러스트 캐시만 읽고 미존재 시 실패. 운영 원본 다운로드 제거 |
| `docs/qa/black-gold-board-browser.mjs` | 결과 폴더 분리 지원 |
| `docs/qa/black-gold-modes-runner.mjs` | 격리 서버 검증 결과 폴더 분리 지원 |
| `docs/qa/black-gold-playwright.mjs` | 직접 `browser.newPage()`를 쓰는 검사에도 개발 테마 적용 |
| `docs/qa/black-gold-production-gate.mjs` | production 산출물에 우드/천 리소스가 포함되지 않음을 검사 |
| `docs/qa/wood-cloth-board-capture.mjs` | 로컬 전용 기존/신규 실측·캡처, 이미지·장식 레이어·손패 크기 검사 |
| `docs/qa/wood-cloth-board-20261020/*` | 실제 PNG, 비교 HTML, 실측/검증 결과와 보고서 |

상속한 첫 프로토타입의 `game-state-preview.tsx`는 DEV 테마 게이트와 기존 ZoneStack의 HUD 배치를 담당한다. 이번 후속 작업에서는 이 컴포넌트나 `card-renderer.tsx`, `card-artwork.tsx`, 공격/소환 드래그 코드를 다시 수정하지 않았다. 기존 첫 보고서는 `../black-gold-board-20261020/README.md`에 보존했다.

## 실제 화면 및 시안 차이

`index.html`에서 같은 상태·카드·뷰포트의 기존/신규 화면을 비교할 수 있다. `new-390x844.png`는 카드가 배치된 화면, `empty-390x844.png`는 빈 전장, `ability-emotes-390x844.png`는 기존 감정표현 메뉴와 고유 능력, `new-360x740.png`는 짧은 모바일 화면이다. 각 PNG는 지정한 뷰포트의 **전체 스크롤 영역**을 캡처했다.

시안의 우드·천·검정 패널·골드의 구분과 중앙 초상화 배치를 재현했다. 원본 시안보다 질감과 주름, 프레임 장식을 단순화한 셀 셰이딩 SVG다. 모바일에서 기존 카드 너비를 지키므로 천이 옆으로 드러나는 여백은 좁다. 시안의 작은 손패는 따르지 않았다. 긴 챔피언 이름은 줄바꿈하며 CONTAIN 이미지에는 원본 비율에 따른 여백이 남는다.

| 뷰포트 | 전체 콘텐츠 높이 | 실제 손패 카드 W×H | 결과 |
|---|---:|---:|---|
| 360×740 | 775px | 84.84×118.80px | 기존과 동일, 세로 35px 스크롤 |
| 375×812 | 838px | 92×129px | 기존과 동일, 세로 26px 스크롤 |
| 390×844 | 855px | 92×129px | 기존과 동일, 세로 11px 스크롤 |
| 412×915 | 915px | 92×129px | 한 화면에 배치 |
| 1440×1000 | 1184px | 132×190px | 기존 카드 크기 유지, 세로 스크롤 |

모든 화면에서 가로 넘침 없음, scale=1, 초상화 이미지 로딩·contain 확인. 주요 동작 버튼과 정보 버튼의 44px 터치 영역 검사 통과. 실제 스마트폰이 아닌 Chromium 모바일 에뮬레이션이다.

## 테스트 결과

최종 상태 기준 **단위/격리 서버 103 PASS, 브라우저 검사 그룹 57 PASS, 0 FAIL**. 별도 기존/신규 비교 렌더 10회도 통과했다.

- 전투·챔피언·연출·감정표현 단위 회귀: 60 PASS.
- 분리된 PGlite 서버: PvP 꾸미기 14, 드래프트 18, 타워 11 PASS. 실제 서버 HTTP/WebSocket 경로를 사용했다.
- 모바일 4크기 공통 UI: 36 PASS. 실제 엔진을 통과하는 소환, 드래그 공격/취소, 챔피언 공격, 주문 대상 이동/취소, 퀘스트 완료/강화, 파괴, 연출 중 입력 잠금/복구, 감정표현, 설정·로그·묘지·상세정보·풀일러, 10장 손패 스크롤, 턴 종료/직렬화 복원을 검사했다.
- 실제 로컬 PvP/AI 화면 8, 드래프트 4, 타워 전투→KO→결과→보상→25장 교체 1 PASS. PvP 양쪽 스킨·뒷면·이모티콘, 재접속, 이미지 오류 시 원본 복원 확인. 타워의 기존 타이머 숨김 정책 확인.
- 기존 공격 드래그 4개 화면, 대상 선택 레이아웃 4개 너비 PASS. 후자의 검사 도구가 `browser.newPage()`를 직접 써서 테마 적용이 빠지는 것을 발견해 어댑터를 수정했다. 수정 후 신규 테마의 52px 조작부에서 다시 통과했다.
- 앱 타입 검사, 별도 QA 타입 검사, Vite build PASS. production 산출물 140개를 검사해 개발용 미리보기·새 리소스 제외 확인.
- 오프라인 실제 카드 이미지 누락 0, 비교 캡처의 페이지 오류 0. 운영 API·DB에 테스트 쓰기를 보내지 않았다. 관리자·보상·덱 변경 검사는 격리된 로컬 테스트 DB에서만 실행했다.

## 미검증 및 남은 항목

- 실제 휴대폰/Safari, 장기 실전 부하·GPU 프로파일링 미실행. CSS에 blur/실시간 필터나 새 애니메이션 루프를 추가하지 않았다.
- 짧은 화면은 위 표처럼 세로 스크롤이 필요하다. 모든 화면을 한 장에 맞추려고 카드나 보드를 축소하지 않았다.
- 샌드박스 타이머는 60초 표시이며 시간 만료까지의 별도 검사 미실행. 실제 서버 PvP 타이머 표시는 기존 경로를 유지한다.
- 영구 슬롯 파괴/잠금 상태는 현재 공통 모델에서 확인하지 못해 미검증. 실제 주문으로 카드 파괴 후 4칸·인덱스 유지 검사는 통과했다.
- 카드 합체/변신/소멸, 모든 카드 효과·모든 챔피언 각성 스킨을 이번 UI 작업에서 전수 실전 검증하지 않았다. 해당 로직·렌더러는 변경하지 않았다.
- 스크린샷용 실제 콘텐츠는 저장소 2026-10-12 스냅샷(129 카드/11 챔피언)이다. 최신 운영 효과와의 일치 검증 자료가 아니다. PvP/드래프트/타워 서버 테스트는 분리된 테스트 fixture를 사용한다.
- 미술 방향의 최종 만족 여부는 사용자 디자인 검토 대상이다. 운영 적용은 하지 않았다.

## 리소스 및 성능

추가 SVG는 우드 1,565B, 천 1,520B로 **합계 3,085B**다. 필터·외부 폰트·거대한 래스터 이미지를 추가하지 않는다. 두 진영의 천은 같은 정적 리소스를 재사용한다. CSS 전체 17,210B이며 이번 변경 증가량과 gzip 크기는 Git diff 및 `verification.json`으로 확인할 수 있다. Vite는 작은 SVG를 CSS에 인라인하므로 개발 페이지에서 별도 이미지 다운로드 요청을 반복하지 않는다. 향후 승인 후 production에 포함하는 경우 번들 캐시를 사용할 수 있다. 현재 production에는 새 리소스가 포함되지 않아 추가 전송량은 0이다.

## 재현

개발 서버: `http://127.0.0.1:5186/qa/black-gold-board.html`, 기존 비교 `?theme=classic`. 127.0.0.1은 다른 휴대폰에서 직접 열 수 없으므로 별도 PNG와 HTML을 제공한다. `index.html`은 폴더째 옮겨 열 수 있다.

```sh
PORT=5186 BASE_PATH=/ pnpm --filter @workspace/ko-game dev --host 127.0.0.1
KO_BOARD_OUTPUT=qa-results/wood-cloth-board node docs/qa/black-gold-board-browser.mjs
node docs/qa/wood-cloth-board-capture.mjs
KO_BOARD_MODES_OUTPUT=qa-results/wood-cloth-modes node docs/qa/black-gold-modes-runner.mjs pvp
KO_BOARD_MODES_OUTPUT=qa-results/wood-cloth-modes node docs/qa/black-gold-modes-runner.mjs draft
KO_BOARD_MODES_OUTPUT=qa-results/wood-cloth-modes node docs/qa/black-gold-modes-runner.mjs tower
pnpm --filter @workspace/ko-game typecheck
pnpm exec tsc -p artifacts/ko-game/qa/tsconfig.black-gold.json --noEmit
pnpm --filter @workspace/ko-game build
node docs/qa/black-gold-production-gate.mjs
```

일러스트 캐시는 `/tmp/ko-board-image-cache`에서만 읽으며 없으면 안전하게 실패한다. 새 환경에서는 민감정보 없는 오프라인 카드 이미지 내보내기가 필요하다. 테스트 결과의 private fixture 세션 파일은 제출물·커밋에 포함하지 않는다. 원본 UI는 CLASSIC 전환과 보존된 기준 브랜치로 복구 가능하다.

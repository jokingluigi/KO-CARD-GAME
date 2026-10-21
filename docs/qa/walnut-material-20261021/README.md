# 나무 배경 재질만 교체 — 2026-10-21

기준 커밋 `bad41b3`, 작업 브랜치 `feat/wood-cloth-battle-board-preview`. 현재 만족한 전투 UI를 유지하고 나무 배경만 바꿨다. **운영 배포, main 병합, Production DB 접근/변경은 하지 않았다.**

## 변경

기존 반복 SVG 나뭇결을 별도의 다크 월넛 이미지 리소스로 교체했다. 사용자가 제공한 `113846.jpg`의 짙은 월넛·가로 판자·자연스러운 결·미묘한 판자별 색 차이를 기준으로 나무 전용 이미지를 제작했다. 과도한 광택과 입체 베벨, 테두리/모서리 장식, 천·카드·UI를 이미지에 넣지 않았다. 배경 재질은 이미지 생성 도구로 제작했으며, 비교 스크린샷은 생성한 가짜 UI가 아니라 실제 게임 컴포넌트의 브라우저 렌더다.

모바일용 세로 이미지와 넓은 화면용 가로 이미지를 따로 사용한다. `background-size:cover`, `background-position:center top`, `background-repeat:no-repeat`으로 한 장씩 표시한다. 종횡비를 유지하며 화면 바깥 부분을 잘라 맞추므로 나뭇결을 가로/세로로 따로 늘리지 않는다. 타일 반복이나 이어붙인 경계가 없다. 기존 원목 SVG는 과거 작업 보존용으로 남아 있지만 새 배경에서 사용하지 않는다.

생성된 PNG 원본은 별도 보존하고, 픽셀 크기 변경이나 추가 그림 편집 없이 WebP quality 84로 압축했다.

| 리소스 | 원본 크기 | 파일 크기 | 사용 |
|---|---:|---:|---|
| `walnut-material-portrait.webp` | 948×1660 | 104,382B / 약 102KiB | 너비 768px 이하 |
| `walnut-material-wide.webp` | 1659×948 | 133,448B / 약 130KiB | 너비 769px 이상 |

각 화면은 해당 리소스 하나만 요청한다. 모바일 DPR 2 및 데스크톱 DPR 1에서 실제 로딩/디코드와 요청 1회를 확인했다. 게임 상태 변경 때 배경을 생성하거나 DB에서 읽지 않는다. 이미지가 없으면 기존 바탕색 `#38231B`가 남는 CSS 구조이며 게임 진행을 이미지 로딩으로 막지 않는다. 현재 production 빌드에는 두 리소스 모두 제외된다.

## 나머지 UI 보존 확인

360×740, 375×812, 390×844, 412×915, 1440×1000의 실제 공통 UI를 렌더하고 직전 버전과 비교했다. `unchanged-ui.json`에 다음 값이 모두 동일함을 기록했다.

- 천의 SVG/장식 스타일
- 상대/아군 초상화 좌표·크기·테두리
- 필드 카드와 슬롯의 좌표·크기
- 손패 받침 및 카드의 좌표·크기
- 중앙 조작부와 고유 능력의 좌표·크기
- 패널 테두리와 검정 카드 backing

원본 카드 프레임·일러스트·천·HUD·테두리·손패 크기/위치, 게임 상태/핸들러/엔진/서버는 변경하지 않았다. 반투명 패널 뒤의 나뭇결이 달라지는 것은 배경 교체에 따른 정상적인 합성 결과다.

## 비교 자료

`index.html`에서 동일 뷰포트의 수정 전/후 이미지를 선택할 수 있다. 기본 비교는 390×844이며 `comparison-390.png`는 한 장으로 정리한 실제 캡처다. `before-*`는 기준 커밋 때 보존한 동일 상태의 실제 렌더이고, `after-*`는 이번 변경 후 실제 렌더다. 지정한 뷰포트의 전체 스크롤 영역을 캡처하므로 짧은 화면의 PNG 높이는 뷰포트 높이보다 길 수 있다. 기존 세로 스크롤 정책은 유지했다.

참고 시안처럼 풍부한 자연 나뭇결과 어두운 판자 색 차이를 표현했다. 원본 시안의 가장자리 프레임은 추가하지 않았고, 판자의 개별 모양은 새 리소스에 맞춰 다르다. 천과 패널은 동일한 위치에 개별 요소로 올라가 있다.

## 검증 결과

- 5개 뷰포트의 개발 QA 렌더 10회(신규 월넛 5회 + CLASSIC 5회): PASS. 별도로 보존한 직전 월넛 보드 5장/실측과 비교했다. 이미지 누락 0, 페이지 오류 0.
- 위 UI 실측·스타일 동일 비교 5개 뷰포트: PASS.
- 선택된 손패 잘림, 퀘스트/능력 간격, 초상화 contain, 슬롯/카드 검정 바탕 및 소환 가능한 슬롯의 검정 유지 검사: PASS. 기존 QA 캡처 도구의 검사를 재사용했다.
- 모바일 390×844 DPR 2, 데스크톱 1440×1000 DPR 1에서 나무 파일 디코드, 올바른 반응형 리소스 선택, 요청 1회, no-repeat/cover/scale=1: PASS.
- Vite build: PASS. production 산출물 140개를 검사해 개발 보드와 신규 리소스 제외: PASS.

이번에는 나무 배경만 바꿨으므로 엔진/서버 회귀와 PvP·AI·드래프트·타워 실전 시나리오는 다시 실행하지 않았다. 이전 작업의 103/57 PASS를 이번 작업에서 재실행한 수로 표기하지 않는다. 실제 스마트폰/Safari 및 장기 성능 검사는 미실행이며 모바일 검증은 Chromium 에뮬레이션이다.

## 변경 파일

- `artifacts/ko-game/src/components/battle-board.css`: 나무 배경 URL·cover/no-repeat, 데스크톱용 이미지 선택만 변경. 그 외 UI 규칙은 동일.
- `artifacts/ko-game/src/components/battle-board-assets/walnut-material-portrait.webp`: 모바일용 나무 재질.
- `artifacts/ko-game/src/components/battle-board-assets/walnut-material-wide.webp`: 넓은 화면용 나무 재질.
- `docs/qa/wood-cloth-board-capture.mjs`: 배경 이미지 유효성 검사에 WebP 허용.
- `docs/qa/black-gold-production-gate.mjs`: 신규 나무 파일의 production 제외 검사.
- `docs/qa/walnut-material-20261021/*`: 비교 PNG·HTML·실측·리소스 해시·검증 보고.

개발 미리보기는 기존 `/qa/black-gold-board.html`을 사용한다. 캡처 재현:

```sh
KO_BOARD_CAPTURE_OUTPUT=qa-results/wood-material node docs/qa/wood-cloth-board-capture.mjs
pnpm --filter @workspace/ko-game build
node docs/qa/black-gold-production-gate.mjs
```

로컬 이미지 캐시를 사용하며 운영 API/DB로 일러스트를 다시 받지 않는다. PNG와 비교 HTML은 휴대폰 검토를 위해 폴더째 전달할 수 있다.

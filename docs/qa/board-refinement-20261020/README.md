# 전투 보드 UI 재질·검정 바탕 보정

2026-10-20. 기준 `7d17b87`의 우드/천 미리보기와 기존 작업물을 보존하고 같은 전용 브랜치 `feat/wood-cloth-battle-board-preview`에서 수정했다. 운영 배포·main 병합·Production DB 접근/변경은 하지 않았다. 기존 개발 전용 테마 및 CLASSIC 복구 경로를 유지한다.

## 요청별 수정

| 요청 | 구현 |
|---|---|
| 슬롯·카드 프레임 내부 검정 | 빈/점유 슬롯과 손패의 바탕을 `#000000`으로 통일했다. 소환 가능한 빈 칸도 기존 노란 채우기를 제거하고 검정 내부와 얇은 골드 점선으로 표시한다. 소환·공격 연출 중의 카드 렌더러도 같은 검정 바탕을 사용한다. 카드 프레임·일러스트·숫자·텍스트는 그대로이며 투명 영역 아래에 검정이 보인다. 카드 렌더러가 대상 지정/골드 부족/상대 턴에 흐려져도 바탕은 흐려지지 않도록 기존 카드 바깥 wrapper에도 불투명 검정 backing을 둔다. 실제 대상 선택과 턴 종료 후 이 상태를 검사한다. |
| 다크 우드 | 큰 띠와 반복적인 타원 무늬를 줄이고, 좁은 판자·연속적인 가는 결·작은 옹이를 절제된 셀 셰이딩 SVG로 표현했다. 짙은 월넛 계열이며 필터·광택·PBR·래스터 이미지를 사용하지 않는다. |
| 베이지·검정 천 | 베이지 천은 기존 위치와 팔레트를 유지하면서 곡선 기반 모서리 접힘과 낮은 대비의 섬유 결로 보정했다. 손패 받침에는 별도 검정 린넨 SVG를 추가했다. 천 리소스는 장식이며 포인터 이벤트를 받지 않는다. |
| 초상화 통일 | 양쪽에 같은 CSS 변수의 너비·높이, 1px 무광 골드 네 면 테두리와 `object-fit:contain`을 명시했다. 실제 원본/스킨은 변경하지 않는다. 다섯 뷰포트에서 두 프레임의 실측과 테두리 값이 동일하다. |
| 테두리 통일 | 슬롯·덱/묘지·체력/골드·퀘스트·조작부·손패 받침을 1px `#B99A60`으로 통일했다. 기존 카드 프레임과 선택/공격/효과 대상의 의미 있는 상태 강조는 유지한다. 비활성 턴 종료 버튼의 배경은 기존 어두운 골드 `#6D5B3C`를 보존한다. |
| 손패 위치 | 카드 크기는 바꾸지 않고 내부 트랙만 위로 8px 이동했다. 기존 카드 선택 lift/scale은 유지하며 선택된 카드의 wrapper 위치만 보정하여 짧은 화면과 데스크톱에서 위쪽이 잘리지 않게 했다. 드래그 좌표는 기존 DOM ref 경로를 사용한다. |

함께 발견한 퀘스트/능력 겹침: 기존 32px 그리드 행에 44px 고유 능력 버튼이 들어가면서 퀘스트와 2px 겹쳤다. HUD 전체 높이는 유지하고 해당 행에 실제 버튼 높이 44px를 배분했다. 퀘스트와 버튼은 모든 검증 크기에서 최소 4px 떨어진다.

## 실측 및 캡처

`index.html`과 `comparison-390.png`에서 **직전 우드/천 보드와 수정 후 화면**을 동일한 카드·챔피언·상태로 비교한다. `after-390x844.png`, `after-360x740.png`는 실제 카드 배치 화면이며 `selected-hand-390x844.png`는 선택된 손패, `ability-emotes-390x844.png`는 고유 능력과 감정표현 화면이다. PNG는 지정 뷰포트의 전체 스크롤 영역을 캡처했다.

| 뷰포트 | 손패 카드 크기 W×H | 위로 이동 | 퀘스트/능력 간격 | 콘텐츠 높이 |
|---|---:|---:|---:|---:|
| 360×740 | 84.84×118.80px | 8px | 8px | 775px |
| 375×812 | 92×129px | 8px | 4px | 838px |
| 390×844 | 92×129px | 8px | 4px | 855px |
| 412×915 | 92×129px | 8px | 10px | 915px |
| 1440×1000 | 132×190px | 8px | 14px | 1184px |

카드 크기·슬롯 크기·손패 받침 위치·양쪽 초상화 위치·중앙 조작부 위치는 직전 버전과 같다. `comparison-measurements.json`에 비교 결과를 기록했다. 가로 넘침 없음, scale=1, 양쪽 초상화 contain/이미지 로딩, 동일한 1px 테두리, 순수 검정 backing, 선택된 손패의 상하단이 스크롤 clip 안에 들어오는 것을 검사했다. 카드 확대/상세정보를 없애거나 카드 자체를 축소하지 않았다.

시안과 비교하면 작은 화면에서 카드 크기를 지키므로 천의 옆 여백은 여전히 좁다. 섬유와 나뭇결은 정교한 실사 질감 대신 저대비 벡터 표현을 사용했다. 원본 초상화의 비율에 따른 여백을 남기며 불필요하게 자르지 않는다. 시안에 그려진 작은 손패 크기는 적용하지 않았다. 짧은 화면의 기존 세로 스크롤은 유지한다.

## 검증

최종 실행의 결과는 `verification.json`, `interaction-results.json`, `measurements.json`, 서버별 브라우저 결과에 기록한다.

- 전투·챔피언·연출 단위 회귀: 60 PASS.
- 격리된 PGlite 서버 회귀: PvP/꾸미기 14, 드래프트 18, 타워 11 PASS.
- 공통 전투 UI 브라우저: 모바일 4크기 × 9그룹 = 36 PASS. 소환, 드래그 공격/취소, 주문 대상 선택/취소, 실제 효과, 퀘스트 완료/강화, 파괴, 입력 잠금/복구, 설정·로그·묘지·상세정보·풀일러, 손패 스크롤, 턴 종료/직렬화 복원 경로를 검사했다. 대상 지정 때 카드가 흐려져도 검정 backing이 유지되고, 상대 턴에 손패가 흐려져도 불투명 backing과 기존 비활성 턴 버튼 색이 유지되는 검사를 추가했다.
- 실제 로컬 PvP/AI 8, 드래프트 4, 타워 1 브라우저 그룹 PASS. 양쪽 스킨·뒷면·이모티콘·재접속·이미지 오류 대체, 타워 전투/KO/결과/보상/25장 교체 경로를 사용한다.
- 기존 공격 드래그 4개 화면, 대상 선택 레이아웃 4개 너비 PASS. 합계 브라우저 57그룹.
- 기존/신규 비교 렌더 10회 및 5개 뷰포트의 검정 바탕·동일 초상화/패널 테두리·선택 카드 clip 검사 PASS.
- 앱 타입 검사, 별도 QA 타입 검사, Vite build 및 production 산출물 140개에 개발 보드와 SVG가 제외되는 검사 PASS.

초기 드래프트 서버 검사 1회는 6개 통과 뒤 Node가 `Promise resolution is still pending but the event loop has already resolved`로 종료해 12개가 취소되었고 브라우저 준비 시간도 초과했다. 격리된 DB를 새로 만들어 단독 재실행한 결과 18개 서버·4개 브라우저 검사가 통과했다. 중단 원인을 UI 변경으로 단정하지 않으며 엔진/서버를 임의 수정하지 않았다. 이 최초 중단을 최종 PASS 수에 포함하지 않는다. 비활성 버튼 색 검사 1회도 CSS 색 전환 중간값을 즉시 읽어 실패했으며, 전환 완료를 기다리도록 검사 도구를 수정했다. 초기 선택 상태 캡처에서만 나타나던 노란 슬롯 채우기와 손패 상단 잘림은 실제 스타일 충돌을 수정하고 해당 상태의 자동 검사를 추가했다.

## 변경 파일

- `artifacts/ko-game/src/components/battle-board.css`: 검정 backing, 공통 테두리/초상화, 손패 위치/선택 여유, 퀘스트·능력 간격, 검정 천 연결.
- `artifacts/ko-game/src/components/battle-board-assets/walnut-table.svg`: 개선한 다크 우드.
- `artifacts/ko-game/src/components/battle-board-assets/linen-field.svg`: 섬유와 곡선 주름을 가진 베이지 천.
- `artifacts/ko-game/src/components/battle-board-assets/black-linen.svg`: 신규 손패 검정 천.
- `docs/qa/wood-cloth-board-capture.mjs`: 출력 폴더 분리, 검정 바탕/초상화·테두리/퀘스트 간격/선택 카드 잘림 실측 검사.
- `docs/qa/black-gold-board-browser.mjs`: 실제 대상 지정·상대 턴에서 backing과 비활성 배경 검사.
- `docs/qa/black-gold-production-gate.mjs`: 새 검정 천도 production 빌드에 포함되지 않는지 검사.
- `docs/qa/board-refinement-20261020/*`: 실제 캡처·비교 페이지·실측·검증 보고.

카드/챔피언 데이터, 카드 렌더러, 엔진·서버·프로토콜, 계정·상점·보상은 수정하지 않았다. 기존 프레임·일러스트 파일도 수정하지 않았다.

## 리소스·제한·재현

정적 SVG 합계 8,655B(우드 5,822B, 베이지 1,769B, 검정 천 1,064B). CSS 전체 19,353B. gzip 값은 `resources.json`에 기록했다. 우드는 가벼운 정적 파일로, 작은 천 SVG는 CSS에 인라인되어 캐시 가능하며, 별도 DB 조회·새 애니메이션 루프·실시간 블러·필터는 없다. 현재 production 빌드에는 미포함이다.

실제 휴대폰/Safari, 장시간 GPU 성능, 타이머 만료, 모든 카드·챔피언·합체/변신/소멸 전수 실전 검사는 미실행이다. 영구 슬롯 파괴/잠금 상태는 기존 모델에서 확인하지 못해 미검증이며 카드 파괴 후 4칸 유지 검사는 실행했다. 이미지 콘텐츠는 저장소 2026-10-12 스냅샷(129카드/11챔피언)과 로컬 파일 캐시다. 최신 운영 효과 검증 자료라고 주장하지 않는다. 운영 API/DB/계정에 테스트 기록을 남기지 않았다.

개발 서버의 `/qa/black-gold-board.html`에서 확인하며, `?theme=classic`은 원래 보드다. 로컬 주소만으로 다른 휴대폰에서 열 수 없으므로 PNG/HTML을 제공한다. 캐시가 없는 환경에서는 안전한 오프라인 일러스트 내보내기가 필요하며 자동 운영 다운로드는 하지 않는다.

```sh
KO_BOARD_CAPTURE_OUTPUT=qa-results/board-refinement node docs/qa/wood-cloth-board-capture.mjs
KO_BOARD_OUTPUT=qa-results/board-refinement node docs/qa/black-gold-board-browser.mjs
KO_BOARD_MODES_OUTPUT=qa-results/board-refinement-modes node docs/qa/black-gold-modes-runner.mjs pvp
KO_BOARD_MODES_OUTPUT=qa-results/board-refinement-modes node docs/qa/black-gold-modes-runner.mjs draft
KO_BOARD_MODES_OUTPUT=qa-results/board-refinement-modes node docs/qa/black-gold-modes-runner.mjs tower
```

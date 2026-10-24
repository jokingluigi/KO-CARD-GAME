# Game experience overhaul — 검토용 구현

기준: main bb102939. 브랜치: feat/game-experience-overhaul. 운영 배포/main 병합/Production DB 변경 없음.

## 범위와 우선순위

| 우선순위 | 확인한 문제 / 영향 | 구현 및 근거 | 위험 / 검증 |
|---|---|---|---|
| P0 | 전투 대상 안내가 턴 바 아래 아군 필드 위에 겹침. 오류와 턴 종료 확인도 별도 떠 있는 패널 | 중앙 조작부에 항상 확보하는 44px 안내·취소 행. 선택 취소/계속 플레이를 기존 콜백과 연결. 피드백, 실수 방지 | 보드 총높이 +48px. 카드 크기는 동일. 작은 폰은 세로 스크롤 필요. 실제 주문 드래그와 PC 손패 검사 |
| P0 | 대상 지정 중 설정 버튼이 취소 버튼으로 교체됨 | 취소를 별도 안내 행으로 이동해 설정과 로그 유지 | 기존 합체/토큰의 취소 가능 조건 그대로 사용 |
| P1 | 메인 목적이 다른 메뉴가 일렬 목록에 섞임 | 대전 / 덱과 컬렉션 / 보상과 상점 그룹과 기존 진입 콜백 유지 | 비활성 모드는 기존 서버 응답대로 미표시. 새 모드 없음 |
| P1 | 컬렉션→덱→상점 이동에 메인 경유 필요 | 명시적으로 허용한 비전투 경로에 공통 5개 링크, 현재 위치 표시 | 전투·타워·드래프트 픽·관리자에 미삽입. 별도 API 호출 없음 |
| P1 | 모바일 편집 패널이 카드 목록을 덮고, 태블릿 3열 최소폭이 부족 | 현재 덱/카드 찾기/내 덱 앵커, 모바일 자연스러운 문서 흐름, 태블릿 2열+덱 목록 별도 행 | 기존 추가/제거/저장/가져오기 유지. 모든 내용을 한 화면에 축소하지 않음 |
| P1 | 필터 적용 상태를 보려면 선택 상자들을 다시 읽어야 함 | 개별 해제 가능한 적용 필터 목록. 기존 필터 함수 재사용 | 실제 목록 결과와 개별 해제 검사 |
| P1 | 온라인에서 큰 제목과 공백 때문에 준비 동작이 아래로 밀림 | 제목 크기/헤더 구조, 모드 진입 문구, 선택 상태 명시. AI 준비 화면 액션 고정 | 30초 매칭 정책, 덱 검증, 보상 정책 그대로 |
| P1 | 기본 오류/404가 영어 개발자 문구·밝은 웹 템플릿 | 한국어 문제 설명·기존 재시도, 게임 표면과 일치하는 404 복귀 | 저장/복구 완료를 거짓 약속하지 않음. 오류 상세 DEV만 |
| P2 | 화면 코드 로딩까지 로그인 로딩처럼 표시 | 화면 이름 기반 공통 GameLoading, 가짜 퍼센트 없음, 모션 감소 대응 | 인증 복원 로직 그대로 |
| P2 | 퀘스트 탭에 해당 항목이 없어도 빈 화면 | 탭별 빈 상태 및 수령가능/수령완료 요약 | 목표/보상/서버 계산 변경 없음 |
| P2 | 작은 모달 닫기/제목 겹침 | 공통 닫기 44px, 제목 우측 여백, 모바일 바깥 여백 | Radix 포커스/닫기 계약 유지 |

## 공통 시스템

`game-experience.css`: 표면 #121317, 보조 표면 #1c1d21, 구분선 #66563a, 강조 #d9bb7b, 본문 #f0e8d8. 기본 입력 반응120ms, 화면준비180ms 토큰. 레트로 폰트와 원본 카드 렌더러 유지. 역할에 맞는 각진 내비게이션/명시적 선택 상태. 전투 스타일은 battle-board.css에서만 관리.

새 UI 네트워크 요청/DB 쿼리/SDK/이미지 리소스 없음. 로딩 표현 외 반복 애니메이션을 추가하지 않음. 전투 판정 및 공격/소환 연출 시간 변경 없음.

## 화면별 처리

- 메인: 메뉴 분류와 배치 재구성. 기존 일러스트 로딩 정책 유지.
- 온라인/드래프트 로비: 공통 OnlineShell과 ModeCard 재배치. 드래프트 픽 규칙은 그대로.
- AI: 선택 상태 접근성, 준비 설명, 시작/뒤로 액션 접근성.
- 전투/HUD: 중앙 안내 행, 공격/손패 선택 취소, 종료 확인, 체력·골드 라벨 대비, 능력명/비용 구분. 초상화/카드 크기와 contain 유지.
- 덱: 작업 이동과 모바일/태블릿 레이아웃 재구성.
- 컬렉션/챔피언: 공통 이동, 필터 개별 해제, 자원 헤더 줄바꿈, 즐겨찾기 터치 영역. 원본 상세/제작 조건 유지.
- 상점/팩/보상/출석: 공통 이동·버튼 상태와 터치 영역. 기존 구매 확인/보상 연출 그대로.
- 퀘스트: 상태 요약과 탭별 빈 상태.
- 꾸미기: 검색 빈 결과 복귀, 기존 미보유 상태와 장착 유지.
- 타워: 비전투 정보 영역 분리. 공격 선수 재선택 해제를 AI/PvP와 일치시킴(로컬 선택 상태만).
- 설정/팝업/관리자: 공유 Dialog 접근성 개선 및 관리자 실제 회귀 검사. 관리자 전체 정보구조 개편은 하지 않음.
- 프로필/통계: 독립 유저 프로필/통계 라우트가 없음. 메인 계정표시와 기존 결과 기록을 유지. 새 시스템을 만들지 않음.

## 한계와 후속 검토

이것은 여러 주요 화면의 구조와 공통 상호작용을 실제로 바꾼 검토용 구현이며, 모든 화면을 새로 디자인한 결과는 아니다. 결과 화면의 상세 기록 구성, 드래프트 개별 픽 패널, 관리자 전체 정보구조는 기존 화면을 재사용한다. 사용성 실험/물리 스마트폰/스크린리더 전체 검증은 수행하지 않았다. 전문 상용 수준에 도달했다거나 작업시간이 단축됐다고 입증한 결과로 주장하지 않는다.

63개 비전투 캡처는 로컬 HTTP/PGlite 계정 기반이다. 운영 이미지 호스트 접근을 막으므로 일부 카드·챔피언 이미지가 대체 표시된다. 전투 동작 캡처도 테스트 카드다. 실제 운영 아트 전체가 들어간 시각 검토는 남아 있다. 전후 동일 조건 비교는 덱/컬렉션 필터와 기본 전투 fixture만 제공하며, 다른 화면은 기능 검토 캡처다.

전투 안내 행으로 약48px 높이가 늘어난다. 360×740에서는 한 화면에 보드를 억지로 축소하지 않고 스크롤을 허용한다. 카드 자체 크기는 유지하며, 실제 터치 드래그 검사를 수행한다.

## 실제 검증 결과

| 검사 | 결과 |
|---|---|
| pnpm 전체 typecheck + frontend/API build | PASS |
| 비전투 9개 경로 × 7뷰포트(360×740,375×812,390×844,412×915,768×1024,1024×768,1440×900) | 최종 결과 layout.json 참조. 로딩 종료 및 실제 제목 확인 후 캡처 |
| 전투 안내행/공격 선택 해제/턴 종료 확인 취소/설정/카드 크기/필드 겹침 | 6뷰포트 PASS, battle.json |
| 키보드 포커스/설정/기존 버튼 기하 안정성 | 6뷰포트 PASS (가로844×390 포함) |
| 실제 CDP 터치 주문 드래그 | 모바일4종+PC PASS, spell-drag.json |
| 실제 CDP 터치 선수 공격 드래그 | 모바일3종+PC PASS, attack-drag.json |
| PC 손패 1/6/10장, 선택/스크롤/주문 | 1920/1440/1366/1280/1024 폭, 15조합 PASS |
| 실제 로컬 HTTP/PGlite 덱/컬렉션 필터·팩 개별 개봉·퀘스트·관리자 지급 | 7그룹 PASS, inventory.json |
| 상점 등록/미리보기/실제 구매/잔액·소유/재로그인/덱 편집/AI·PvP 진입 | PASS, shop.json |
| 접속표시 자신 제외/중복탭/재접속/회색, 실제 서버30초AI전환→결과 | PASS, online.json |
| PvP 두 계정 스킨·불투명 뒷면·상호 이모티콘·재접속, 실제 AI 준비/진입 | PASS, pvp-ai.json |
| 드래프트 양쪽 외형·이모티콘·재접속 | PASS, draft.json |
| 타워 실제 KO→결과→카드보상→25장 교체 | PASS |

초기 실패/보정: PC손패 첫 실행은 Playwright 모듈 경로 누락으로 실행 실패, 설치된 Chromium adapter를 명시한 재실행 통과. 초기 캡처 중 일부는 로딩 화면이라 최종 자료에서 제외, 준비 완료 조건을 강화했다. 태블릿 폭 검사만으로 놓친 3열 CSS 충돌과 검색영역 압축을 실제 이미지에서 발견해 수정하고 해당 영역 실측을 추가했다. 초기 공격 취소 검사는 클릭만 검사했는데 QA와 타워 콜백이 같은 카드 토글을 지원하지 않아 수정 후 실제 선택 해제까지 검증했다.

카드 효과 전수 엔진 테스트는 이번 UI 변경에서 새로 실행하지 않았다. 실행한 게임 경로 회귀만 PASS로 표기한다. 실제 사용자 테스트와 물리기기 테스트는 NOT RUN.

## 변경 파일
- `artifacts/ko-game/qa/champion-features.tsx`
- `artifacts/ko-game/src/App.tsx`
- `artifacts/ko-game/src/components/ai-match-setup.tsx`
- `artifacts/ko-game/src/components/battle-board.css`
- `artifacts/ko-game/src/components/card-catalog-filters.tsx`
- `artifacts/ko-game/src/components/error-boundary.tsx`
- `artifacts/ko-game/src/components/game-state-preview.tsx`
- `artifacts/ko-game/src/components/main-menu.tsx`
- `artifacts/ko-game/src/components/online-lobby-ui.tsx`
- `artifacts/ko-game/src/components/ui/dialog.tsx`
- `artifacts/ko-game/src/main.tsx`
- `artifacts/ko-game/src/pages/attendance.tsx`
- `artifacts/ko-game/src/pages/collection.tsx`
- `artifacts/ko-game/src/pages/cosmetics.tsx`
- `artifacts/ko-game/src/pages/daily-quests.tsx`
- `artifacts/ko-game/src/pages/decks.tsx`
- `artifacts/ko-game/src/pages/not-found.tsx`
- `artifacts/ko-game/src/pages/online.tsx`
- `artifacts/ko-game/src/pages/packs.tsx`
- `artifacts/ko-game/src/pages/shop.tsx`
- `artifacts/ko-game/src/pages/tower.tsx`
- `artifacts/ko-game/src/premium-presentation.css`
- `docs/qa/quest-completion-features-browser.mjs`
- `artifacts/ko-game/src/game-experience.css`
- `artifacts/ko-game/src/components/game-navigation.tsx`
- `artifacts/ko-game/src/components/game-loading.tsx`
- `docs/qa/game-experience-overhaul/`: 로컬 실제 렌더 캡처, 검증 스크립트/결과/리뷰 페이지. 계정 쿠키나 fixture 원자료 포함하지 않음.

추가 이미지 리소스 0B. 공통 presentation CSS 약8KB(압축 전), 신규 navigation/loading TSX 합계 약1.8KB. 전투 CSS 추가는 약2KB.

# 아치형 챔피언 프레임 — 2026-10-28

브랜치: `feat/arched-champion-hud`. 운영 배포·main 병합·Production DB 변경 없음.

## 실제 대전 적용

기존 `GameStatePreview`의 양측 챔피언 대상 요소 안에 `ChampionPortraitFrame`을 추가했다. 참고한 아치형 초상화 + 하단 체력 중심 구조를 KO의 무광 블랙/골드로 구현했다. 외부 게임의 이미지 파일은 사용하지 않았다.

- 아치형 안쪽 받침과 얇은 이중 금색 테두리, 하단 이름판/체력 받침.
- 투명 스프라이트는 아치 위로 올라올 수 있고, 기존의 불투명 일러스트 대체는 아치 안쪽으로 잘린다.
- 체력을 초상화 하단 중앙으로 이동하고 기존 옆 패널의 중복 체력 표시는 제거했다. 해당 공간은 골드가 사용한다. 기존 대상 버튼의 접근성 설명에도 챔피언과 현재/최대 체력을 연결했다. 기존 값/최대 체력 및 MotionNumber를 재사용한다.
- 챔피언 이름은 받침, 플레이어 닉네임은 기존 헤더에 표시한다. 퀘스트·고유능력·덱/묘지·감정표현은 기존 이벤트와 입력을 유지한다.
- 모바일 초상화 영역은 260px, HUD는 307px로 확보했다. PC는448px, 작은 가로 화면은328px이다. 프레임 하단 영역을 확보하기 위한 변경이며 중앙 카드/손패 크기 규칙은 변경하지 않았다. 작은 화면은 기존처럼 세로 스크롤을 사용한다.
- 장식 레이어는 모두 pointer-events:none이며 기존 챔피언 target/ref를 유지한다. 보호/공격 대상 안내는 체력판 위로 옮겨 중첩을 막았다.
- 피격/각성 때 테두리 색이 짧게 반응한다. 모션 감소 설정에서는 해당 움직임을 끈다. 기존 공격/소환/각성 판정과 소리는 변경하지 않았다.
- CLASSIC 테마는 기존 체력 패널을 유지하고 새 프레임을 표시하지 않는다.

## 함께 수정한 실제 표시 문제

### 정상 이미지가 있는데도 이미지 없음으로 남는 경로

강화한 브라우저 검사에서 상대 actor는 등록된 스프라이트를 선택하고 있었고, 같은 URL의 독립 decode도 성공했지만 안쪽 CardArtwork는 `이미지 없음` 상태로 남는 경우를 재현했다. 기존 actor는 첫 decode 전에 기존 일러스트를 먼저 렌더링하고, 바깥 decode/candidate 대체와 안쪽 CardArtwork fallback을 동시에 사용했다. URL 교체와 이전 이미지의 실패 상태가 엇갈릴 수 있는 구조였다.

현재는 등록된 선택 URL을 먼저 렌더링하고, 같은 세트의 이전 decode 완료 이미지만 다음 이미지가 준비될 때까지 유지한다. 실패 후보 이동은 actor 한 곳에서 처리한다. CardArtwork 인스턴스는 경기/플레이어/스킨/세트/실제 표시 URL에 묶어 이전 소스의 실패 상태를 상속하지 않게 했다. 이미지가 바뀔 때 배치값도 실제 표시 중인 프레임의 값을 사용한다.

8개의 새 대전에서 양측 decode, 실패한 피격 이미지의 같은 세트 기본 대체, 정상 스프라이트보다 먼저 실패한 기존 일러스트를 요청하지 않는 것을 별도로 검증했다. 같은 이미지 파일을 두 표정이 공유하더라도 표정별 배율(1.5배 시험)이 유지되는 것도 확인했다.

### 새 프레임 안의 KO 좌표

프레임이 추가되면 바깥 target에는 체력/이름판까지 포함된다. 기존처럼 target 전체 크기로 파편을 만들면 실제 그림보다 확대될 수 있다. 새 프레임이 있는 경우 실제 actor 창의 좌표/크기로 파편을 생성하고, 상대 이미지의 좌우 반전도 반영한다. 그림만 숨기고 받침과 체력은 남는다. 기존 파편 수/연출 시간/승패 처리/콜백은 그대로다. CLASSIC은 기존 target 기준을 유지한다.

## 실제 검증

- 프론트엔드 타입 검사 및 빌드 통과.
- 스프라이트/스킨/반응 정책 테스트29개 통과.
- 기존 실제 대전 컴포넌트 + 로컬 엔진 브라우저 회귀: 360×740, 375×812, 390×844, 412×915, 844×390, 1024×768, 1440×900 모두 통과. 양측 스킨, 이미지 decode, 가로 넘침 없음, 장식 입력 차단 없음, 카드 필드/손패와 챔피언의 비중첩 확인.
- 390×844와1440×900에서 실제 포인터로 챔피언 공격·손패 선택 후 슬롯 소환 확인. 실제 피해0/1/4/5, 회복, 고유능력, 각성 세트 전환, 결과/새 대전 초기화도 기존 반응 회귀 스크립트로 실행했다.
- 별도 프레임 브라우저 검증에서도 7해상도 체력판 중앙 정렬/대상 영역 안 배치, 중복 체력 표시 없음, 장식 pointer-events 확인.
- 모바일/PC에서 실제 엔진의 피해6→5 및 고유능력 사용, 실제 치명적 피해 후 KO 확인. 파편의 폭/높이가 실제 actor 창과 1px 미만 차이이며 바깥 target보다 작고, 상대 방향 반전 및 체력판 유지 확인.
- CLASSIC 전환 후 프레임 제거와 기존 체력 패널 복구 확인.
- 이미지 소스 회귀: 8회 새 대전 × 양측, 지연되는 정상 PNG + 실패하는 기존 일러스트/피격 이미지 조건에서 통과.

위 검증은 정적 목업이 아니라 제품의 공유 대전 컴포넌트와 실제 로컬 판정 엔진을 실행한 것이다. 서버에 접속한 두 계정의 전체 PvP 경기나 AI/드래프트/타워 전체 흐름을 새로 검증한 것으로 주장하지 않는다.

## 화면·영상

전용 챔피언 스프라이트 원화는 아직 등록되지 않았다. 새 화면의 보라색 이미지는 **QA TEMPORARY / NOT FINAL ART**라고 쓴 진단 PNG다. 원화의 얼굴·실루엣 품질을 보여 주는 이미지가 아니다. 오래된 로컬 카드 이미지 주소 일부도 사용할 수 없어 카드에는 기존 `이미지 없음` 대체가 보인다. 실제 카드/챔피언 원본 파일이나 데이터는 바꾸지 않았다.

동일한 카드/손패/임시 스프라이트 상태로 캡처한 프레임 변경 비교:

- 모바일: [변경 전](screenshots/20261028-arched-champions/before-mobile.png) / [변경 후](screenshots/20261028-arched-champions/after-mobile.png)
- PC: [변경 전](screenshots/20261028-arched-champions/before-desktop.png) / [변경 후](screenshots/20261028-arched-champions/after-desktop.png)
- [퀘스트와 손패를 채운 모바일](screenshots/20261028-arched-champions/populated-mobile.png) / [가로 화면](screenshots/20261028-arched-champions/landscape.png): 위 비교와는 다른, 기존 boardFixture의 구성이다.
- [실제 로컬 엔진 조작 영상 — 무음](screenshots/20261028-arched-champions/actions-mobile.mp4)
- [KO 파편과 남아 있는 체력판](screenshots/20261028-arched-champions/ko-mobile.png)
- [프레임 검사 결과](screenshots/20261028-arched-champions/frame-results.json) / [이미지 소스 검사 결과](screenshots/20261028-arched-champions/image-source-results.txt)

## 변경 파일

- `artifacts/ko-game/src/components/champion-portrait-frame.tsx` / `.css`: 공통 프레임과 체력판.
- `artifacts/ko-game/src/components/game-state-preview.tsx`: 실제 대상 안의 프레임 연결, 체력/이름 배치, 보호·대상 안내 클래스.
- `artifacts/ko-game/src/components/champion-battle-actor.css`: 기존 HUD의 공간 배정 및 프레임 안 기존 일러스트 처리.
- `artifacts/ko-game/src/components/champion-battle-actor.tsx`: 이미지 소스/실패 상태 격리와 표시 프레임의 배치값 연결.
- `artifacts/ko-game/src/components/champion-defeat-burst.tsx`: 새 프레임에서 실제 그림 창 기준 파편/반전/그림 숨김.
- `docs/qa/arched-champions-browser.mjs`, `champion-image-source-browser.mjs`: 실제 브라우저 회귀.
- 이 보고서와 `docs/qa/screenshots/20261028-arched-champions/`: 검증 산출물. 인증 fixture나 쿠키를 포함하지 않는다.

## 남은 검증

최종 투명 원화를 등록한 얼굴·어깨 돌출/정렬, 실제 이미지의 메모리 비용, 실기기 터치·프레임 처리 시간은 미검증이다. 관리자 화면의 기존 이미지 배치 편집은 유지하며 이 작업은 실제 대전 프레임을 추가한 것이다. 별도의 프레임 선택/꾸미기 상품이나 관리자 프레임 편집 기능은 추가하지 않았다.

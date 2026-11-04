# 챔피언 토큰 보호: 초상화 무적 표시

작업 브랜치 `feat/finisher-foundation`. 게임 규칙·카드 효과·대상 판정·원본 이미지는 변경하지 않았다. 운영 DB 변경, main 병합, 운영 배포 없음.

## 실제 변경

- 작은 `PROTECTED` 라벨을 없애고 양측 초상화에 청금색 보호막 테두리·유리 표면·방패 문양·큰 **무적** 표식을 연결했다. 세로/PC에는 **챔피언 토큰 보호** 설명도 함께 보인다. 높이가 낮은 가로 화면은 얼굴을 보존하도록 한 줄 표식을 사용한다.
- 액자와 체력판도 같은 색으로 강조한다. 색만으로 상태를 구분하지 않고 방패 형태와 한글을 함께 사용한다. 반복 번쩍임은 없고 첫 등장 시 300ms 투명도 전환만 사용한다. OS 및 게임 내 움직임 감소 설정에서는 이를 끈다.
- 이전 UI의 `isChampionToken && !questExclusive` 검사를 실제 엔진의 `isChampionProtectedByToken()`으로 교체했다. 직접 출전·챔피언 등급 등 실제로 본체를 보호하는 상태와 표시를 일치시킨다. 판정 함수 자체는 바꾸지 않았다.
- 보호 카드가 여러 장이면 마지막 카드가 필드를 떠날 때까지 유지한다. 종료 화면과 KO를 가리지 않게 대전 종료 시 보호 장식을 제거한다.
- 장식은 초상화 창 안에만 그리며 `pointer-events: none`으로 기존 대상·터치 입력을 유지한다. 스프라이트 움직임과 독립된 레이어라 보호막·체력·클릭 영역이 함께 흔들리지 않는다. 대상의 접근성 설명에도 무적과 이유를 포함했다.
- 도움말의 보호 설명에 새로운 시각 표시를 반영하고 오래된 라벨 위치 CSS는 제거했다.

## 실행 검증

- 전투 보호·챔피언 토큰 침묵 면역·챔피언 표정 이벤트 회귀 **88개 통과**. 실제 피해를 막은 챔피언이 피격 표정으로 바뀌지 않는 기존 검사 포함.
- 프론트엔드 타입 검사 통과. 프론트엔드 빌드 통과.
- 브라우저 **390×844 / 844×390 / 1440×900**, 추가로 **390×844 움직임 감소**를 실행했다. 실제 공통 대전 컴포넌트에 엔진 `SUMMON` 및 `destroyCard` 결과를 전달해 양측 보호 표시, 보호 카드 두 장 중 한 장 제거 시 유지, 마지막 제거 시 해제, 손패 선택 터치, 표시의 화면 내 배치, 움직임 감소 시 애니메이션 제거를 확인했다. 페이지 오류 없음.
- 이 브라우저 검사는 로컬 공통 대전 하네스이며 별도 정적 목업이 아니다. 임시 보호 토큰과 기존 공개 일러스트를 사용했다. 양측 네트워크 PvP 및 실물 휴대폰 검증으로 대신 보고하지 않는다. 해당 경로의 통신·판정 코드는 변경하지 않았다.

## 화면과 재현

- [모바일 변경 전](20261104-champion-protection/before-390.png) / [보호막 적용 후](20261104-champion-protection/protected-390.png)
- [모바일 가로](20261104-champion-protection/protected-844.png) / [PC](20261104-champion-protection/protected-1440.png)
- [브라우저 결과](20261104-champion-protection/results.json)
- 실행: Vite를 `127.0.0.1:5186`에서 시작한 뒤 `node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs docs/qa/champion-protection-browser.mjs`. 선택적으로 `KO_FINISHER_ART_DATA`로 공개 일러스트 스냅샷 JSON을 지정한다. 네트워크는 일러스트 읽기에만 사용한다.

변경 파일: `champion-protection.tsx`, `champion-protection.css`, `game-state-preview.tsx`, `champion-portrait-frame.css`, `battle-viewport.css`, `game-guide/guide-content.ts`, 브라우저 검사 및 이 보고서·화면 증거.

# 아치 안 이미지 맞춤 — 2026-10-28

사용자의 새 지시에 따라 이전의 머리·어깨 돌출 허용을 **비율 유지 자동 맞춤 + 고정 아치 마스크**로 교체했다. 운영 배포·main 병합·Production DB 변경 없음.

- 기존 챔피언 대상 안에 고정된 `ko-portrait-window`를 두고 이미지/반동/확대는 그 안에서만 움직인다. 창 자체는 이미지의 피격 애니메이션과 함께 움직이지 않는다.
- 등록 스프라이트와 기존 일러스트 대체 모두 새 프레임에서는 contain으로 표시한다. 원본 파일이나 종횡비는 변경하지 않는다. 기존 배율/위치 보정은 유지하며, 확대 시에는 아치 안쪽 부분만 보인다.
- 관리자 표정 미리보기도 contain으로 통일하고 혼동을 주는 cover 전환 대신 자동 맞춤 안내를 표시한다. 배율·기준점 보정은 유지한다. 과거 crop 데이터는 삭제하지 않으며 CLASSIC 전투는 기존 표시 방식을 유지한다.
- 이름·체력·프레임 장식·대상 입력은 마스크 밖에 있어 잘리지 않는다. 카드/손패와 전투 판정은 변경하지 않았다.
- KO는 새 고정 창의 위치를 사용한다. 각 파편과 균열에도 같은 아치 모양을 적용하며 파편의 바깥쪽 비행은 유지한다. 전체 KO 컨테이너를 잘라 폭발을 막는 방식이 아니다.

## 실제 검증

- 프론트엔드 타입 검사/빌드 통과.
- 모바일390×844와PC1440×900에서 양측 contain, 고정 마스크, 확대, 실제 피해/HIT 확인.
- 공용 이미지 렌더러의 실제 최대 확대는 기존대로200%다. 예전300% 설정은200%로 정규화되는 상태까지 시험했으며 확대 한도를 변경하지 않았다.
- 확대 이미지와 HIT 중 이미지의 브라우저 스크린샷6개를 픽셀 검사: 실제 그림이 중앙에 표시되고 양쪽 아치 윗모서리에는 나오지 않음을 확인했다. 마스크를 임시로 끈 비교용 화면에서는 같은 위치에 그림이 나와 검사가 실제 넘침을 검출하는 것도 확인했다. 자홍색 이미지는 이 검사를 위한 임시 단색 PNG다.
- 별도 실제 대전 컴포넌트 브라우저 검사7해상도 통과: 360×740,375×812,390×844,412×915,844×390,1024×768,1440×900. 모바일/PC 실제 피해·능력·KO, 파편/창 위치 및 동일 마스크, 체력판 유지, CLASSIC 복구 확인.
- 기존 실제 로컬 엔진/입력 회귀7해상도 통과. 390px/1440px에서 챔피언 클릭 공격·카드 선택 후 슬롯 소환, 반응/각성/새 대전 초기화 실행. 공유 대전 컴포넌트의 로컬 검증이며, 온라인 전체 경기나 실기기 성능 검증으로 주장하지 않는다.

[이전 돌출 허용 상태](screenshots/20261028-arched-champions/populated-mobile.png) / [현재 모바일](screenshots/20261028-portrait-fit/mobile.png) / [현재 PC](screenshots/20261028-portrait-fit/desktop.png).

[확대 마스크 검사 이미지](screenshots/20261028-portrait-fit/zoom-mask-proof.png) / [피격 중 마스크](screenshots/20261028-portrait-fit/hit-mask-proof.png) / [픽셀 검사 결과](screenshots/20261028-portrait-fit/pixel-check.txt).

일반 화면의 보라색은 기존 QA TEMPORARY 진단 이미지다. 전용 원화를 등록한 얼굴/머리카락 정렬과 실제 기기의 렌더링 성능은 아직 확인하지 않았다. 프레임 밖 표시를 막는 것과 아치 안에서 원화의 모든 모서리를 보여 주는 것은 다르며, 확대하거나 아치 곡선에 걸리는 부분은 잘린다.

## 재현

기존 Vite QA 호스트(127.0.0.1:5186)를 실행한 상태에서:

```
python docs/qa/verify-portrait-aperture-pixels.py --fixture
node docs/qa/portrait-aperture-browser.mjs
python docs/qa/verify-portrait-aperture-pixels.py
node docs/qa/arched-champions-browser.mjs
node docs/qa/final-ten-sprites-browser.mjs
```

변경: `champion-portrait-frame.css`, `champion-battle-actor.tsx`, `game-state-preview.tsx`, `champion-defeat-burst.tsx`, `battle-sprite-editor.tsx` 및 위 QA 스크립트/보고서. 새 테이블·게임 규칙·소유권 변경 없음.

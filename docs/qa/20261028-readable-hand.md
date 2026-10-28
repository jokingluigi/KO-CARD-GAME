# 손패 가독성 재조정

- 390×844 기본 손패: 약101×141 →131×183px, 선택144×201px.
- 360×740 기본 손패: 약86×120 →120×168px, 선택132×185px.
- 1440×900 기본 손패: 약134×188 →160×224px, 선택173×242px.
- 모바일 세로의 상대 HUD의 빈 능력 영역을 안내·취소에 활용해 손패 높이를 확보했다. 전체 화면 변환/배율로 축소하지 않는다. 상대 자동 반전·스프라이트 동작·게임 규칙은 변경하지 않았다.
- 선택 시 예전 wrapper top14px 및 Tailwind 개별 translate/scale이 새 transform과 중복돼 그림이 잘리는 문제를 수정했다. 손패 아래 정렬 및 확대 여유를 확보했다.
- 짧은 화면은 기존 적응형 크기를 유지한다. 360×640은79×110px(선택86×121),740×360은66×92px(선택71×99). 필드 최소 터치 크기와 스크롤 없는 전체 배치를 지키기 위한 제한이다. 모든 화면에서 동일한 큰 크기를 보장한다고 주장하지 않는다.

검증: 프런트 타입 검사/빌드 통과. 12해상도 기본/카드 선택 상태에서 대전 영역·주요 버튼 화면 안 배치와 페이지 세로 초과 없음 검사 통과. 별도7해상도 실제 손패 DOM 측정에서 선택 확대 및 부모 영역 안에 위·아래가 전부 보이는 것 확인.390×844/740×360/1440×900 실제 공용 UI·로컬 엔진에서 터치 소환·주문 드래그·취소·대상 지정·회전 후 상태 유지 통과.

실물 기기 성능/실제 인터넷 두 브라우저의 전체 경기는 이번 검사 대상이 아니다. QA 화면은 오래된 카드 원화 URL을 사용할 수 없어 대체 그림/이름 영역이 포함된다. 운영에 테스트 이미지나 manifest는 저장하지 않는다.

[모바일](screenshots/20261028-readable-hand/mobile.png) / [선택](screenshots/20261028-readable-hand/mobile-selected.png), [PC](screenshots/20261028-readable-hand/desktop.png) / [선택](screenshots/20261028-readable-hand/desktop-selected.png).

제품 변경: `artifacts/ko-game/src/components/battle-viewport.css`.
검증: `docs/qa/readable-hand-browser.mjs`, 기존 `battle-viewport-browser.mjs`, `battle-viewport-input-browser.mjs`.

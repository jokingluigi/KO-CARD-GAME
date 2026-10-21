# 공개 · 미공개 · 비활성화

기준 main `a104aa5`. 기능 브랜치 `feat/card-unpublished-status`.

기존 DB 상태 `PUBLISHED / DRAFT / DISABLED`를 그대로 사용한다. 새 enum·테이블·마이그레이션은 없다. 카드 관리의 관리 작업에 **미공개** 전환 버튼을 추가하고, 카드·챔피언 상태 배지와 필터·생성 안내를 공개/미공개/비활성화로 통일했다. 이미 공개된 항목을 편집 저장할 때에는 상태가 유지되므로 생성/수정 안내도 구분했다.

미공개는 일반 배포에서 제외하는 기존 DRAFT 상태다. 기존에 보유한 미공개 카드·챔피언의 사용 권한과 완전 무작위 생성 정책은 변경하지 않았다. 비활성화와 구별되며 임의로 카드의 실제 운영 상태를 바꾸지 않는다. 기존 공개 참조 보호 검사도 유지한다.

## 검증

- `pnpm run build`: 전체 타입 검사, Vite 프런트엔드 및 API 빌드 통과.
- `lib/db/qa/card-publication-http.test.ts`: 격리된 PGlite와 실제 Express/인증/DB 저장 경로 **4개 통과**. 공개→미공개→공개→비활성화→미공개→공개, 권한·비정상 상태 거부, 공개 참조 보호, 챔피언 상태 전환을 검사한다. 원본 수치·효과·ID와 소유 기록이 그대로임을 확인했다.
- 기존 `lib/db/qa/random-scope-http.test.ts`: **4개 통과**. 미공개 공개 목록 제외와 일반/완전 무작위의 기존 범위를 검증했다.
- `docs/qa/card-publication-browser.mjs`: 실제 production build 관리자 UI를 로컬 HTTP/PGlite에 연결해 **8개 검사 통과**. 미공개·공개·비활성화 변경 후 DB 재조회 및 새로고침, 상태 필터, 참조 오류 안내, 챔피언 상태 표시를 확인했다. API 응답을 목업으로 만들지 않았다.
- 360, 375, 390, 412px 모바일 및 1440px 데스크톱에서 가로 넘침 없음. 실제 스마트폰 검증은 수행하지 않았다.
- 운영 계정·카드에 테스트 변경을 저장하지 않았다. 게임 엔진과 효과·규칙 수정 없음. 전체 엔진 테스트를 이번 UI 변경 때문에 다시 실행하지는 않았다.

[모바일 화면](admin-mobile-390.png) · [PC 화면](admin-desktop-1440.png) · [브라우저 검증 기록](browser-results.json)

브라우저 재현: `KO_PUBLICATION_BROWSER=1`로 HTTP 테스트를 시작해 `PUBLICATION_BROWSER_READY`가 나온 뒤 브라우저 스크립트를 실행한다. `KO_PUBLICATION_ORIGIN`은 로컬 프런트엔드 URL을 지정한다. fixture는 180초 이내 또는 SIGTERM 시 정상 정리한다. fixture JSON의 로컬 인증 쿠키는 저장소에 추가하지 않는다.

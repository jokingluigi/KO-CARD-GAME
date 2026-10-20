# 로그인 지연 복구와 스킨 메뉴 통합 — 2026-10-20

## 관측과 수정 범위

운영 health/auth/status의 첫 병렬 측정은 약 0.4초였다. 이후 첫 `/api/healthz`가 **22.563초** 걸린 뒤 같은 실행의 관리자 카드/챔피언 조회는 0.378/0.332초로 돌아오는 현상을 관측했다. [운영 확인](production-before.json). 프런트 인증 확인 제한은 8초이므로 이런 지연은 제한을 넘는다. API Free 플랜·1인스턴스를 확인했으나, 해당 지연이 플랫폼 절전 하나 때문이라고 단정하지 않는다. 장애 당시 CPU·풀러 상태·로그를 확보한 것은 아니다.

이 패치는 서버가 실제 응답할 수 없을 때 즉시 로그인에 성공한다고 가장하지 않는다. 무료 플랜과 서버 설정을 유지하며, 인증 확인 실패가 전체 진입을 막거나 입력·세션을 지우는 문제를 해결한다.

- 기존 세션이 빠르게 확인되면 원래대로 바로 복원한다. 오래 걸리면 약 **1.2초** 후 입력 폼을 사용할 수 있고, 배경 세션 확인은 계속한다. 재확인 중에도 입력 폼을 재생성하지 않아 작성한 이메일/비밀번호를 유지한다.
- 로그인/가입 버튼은 먼저 서버의 읽기 전용 `/api/healthz`를 확인한다. 준비 전에는 ‘서버 연결 중…’을 표시하며, 연결 후 인증 POST를 **한 번만** 전송한다. 비밀번호 POST의 자동 재시도는 없다.
- 준비 확인은 최대 60초, 최대 8회 GET과 지수형 대기로 제한한다. 실제 인증 제출의 기존 20초 제한은 유지한다. 408/429/5xx/네트워크 오류만 일시적인 준비 지연으로 취급하며 잘못된 4xx는 중단한다. health GET은 쿠키/비밀번호 없이 보내며 해당 핸들러에는 DB 조회가 없다.
- 폼을 떠나거나 기존 세션이 복원되면 대기 중인 인증 제출을 취소해 이후 비밀번호 전송을 막는다. 중복 클릭도 차단한다. 이미 전송한 POST가 실패하면 오류를 알리고 다시 자동 전송하지 않는다.
- 관리자/덱의 복구 화면을 ‘로그인 연결이 지연되고 있어’로 바꾸고 로그인 화면으로 갈 수 있게 했다. 실패를 로그아웃/게스트로 확정하지 않는다. 재확인 때 전체 화면을 로딩으로 교체하지 않으며, 보이는 동안 5초 간격의 세션 GET을 공유해 복구한다. 숨겨지면 멈추고 돌아오면 재확인한다. 성공/이동 시 정리한다.

쿠키 수명·서버 인증·계정/보상·전투 규칙·운영 카드/챔피언·DB 스키마는 변경하지 않았다. 새로운 DB 마이그레이션도 없다.

## 스킨 메뉴 하나로 통합

기존 ‘카드 스킨’은 `card_skin_definitions`와 카드팩에 연결된 기능이고, 새 꾸미기는 계정별 장착/지급과 이모티콘을 관리한다. 데이터를 같은 것으로 간주해 덮어쓰거나 소유권을 임의 이전하지 않았다.

- 관리자 내비게이션의 스킨 관리 입구는 **꾸미기 관리 하나**다.
- 내부에 ‘스킨·이모티콘 · 지급·장착’ / ‘기존 카드팩 스킨’ 두 탭을 제공한다.
- 기존 `/admin/skins` 주소는 같은 관리 화면의 기존 팩 스킨 탭으로 계속 열린다. 과거 즐겨찾기/최근 항목 `skins`는 `cosmetics`로 합쳐 중복을 제거한다.
- 기존 팩 스킨 편집기·API·보유/등록 데이터는 그대로 사용한다. 새 탭 이동도 기존 관리자 저장 전 이탈 확인을 통과한다. 새 꾸미기 폼의 저장하지 않은 변경도 보호한다.

## 실제 실행한 검사

전체 타입 검사/API·Vite 빌드 통과. [자동 검사](verification.json): **30 통과 / 실패 0 / 스킵 0**. 브라우저는 고정된 실제 배포용 빌드와 루프백 fixture에서 **26개 시나리오 통과**했다.

- [신규 4개](cold-login-and-menu-browser.json): 모바일/데스크톱 로그인 입력 보존·준비 전 POST 0·준비 후 POST 1·늦은 guest 응답 무시. 모바일은 8초 확인 제한을 넘는 **9초 지연**으로 확인했다. 같은 화면 크기에서 단일 메뉴·기존 URL 재접속·기존 팩 스킨 조회·탭 이탈 취소 시 입력 보존도 확인했다.
- [자동/online 복구 4개](automatic-recovery-browser.json): 같은 세션으로 관리자 화면 자동 복귀. 로그인/쓰기 POST 없음.
- 기존 세션 복원·페이지 이동/새로고침 검사 1개 통과.
- [기존 첫 진입 14개](entry-browser.json): 지연/서버 상태 실패/점검/관리자/기존 세션/로그인 경합/POST 시간 초과 후 사용자 재시도. 실패 0. GET health 응답을 새 경로에 맞게 fixture에 추가했고, 연결 진행 안내가 있는 폼과 폼 없는 전체 차단 화면을 구분한다. 상태·입력 보존·실제 로그인·횟수 검사는 유지했다.
- 기존 실제 로컬 관리자 메뉴·편집·이탈 보호 러너 3개 통과. [23개 메뉴 및 저장](admin-menus.json), [390/320px 편집·저장 실패 보존](admin-editors.json), [이탈 확인](admin-guards.json). 권한 있는 로컬 fixture에서 실행했고 운영에 테스트 카드를 만들지 않았다.

모바일은 Chromium 에뮬레이션이며 실제 스마트폰 검사는 미실행이다. 처음 개발 서버의 코드 갱신 중 실행했던 모바일 POST timeout 검사는 최종 결과에서 제외하고, 갱신이 없는 배포용 빌드에서 동일한 검사를 다시 실행해 통과했다.

## 데이터베이스 사용 범위

AI 100회 시뮬레이션은 저장소 fixture와 로컬 엔진을 사용하므로 운영 Supabase를 조회/저장하지 않는다. HTTP/관리자 테스트의 DB도 별도 로컬 PGlite/PostgreSQL이다. 이 패치의 자동 검증은 로그인·메뉴 중심이며 운영 유저로 100경기를 돌리지 않았다.

운영 상태 GET 측정과 실제 배포 후 승인된 기존 관리자 로그인 검증은 자동 fixture와 별도다. 후속 운영 검증 결과는 배포 이후 기록한다. 기존 세션 GET이 실패해도 인증을 우회하거나 계정/재화를 임의 변경하지 않는다.

## 재현 및 배포

```sh
pnpm run build
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none artifacts/ko-game/src/lib/auth-client.test.ts artifacts/ko-game/src/lib/startup-client.test.ts artifacts/ko-game/src/lib/admin-navigation.test.ts artifacts/ko-game/src/lib/entry-state.test.ts artifacts/api-server/src/lib/auth-timeout.test.ts
KO_QA_PLAYWRIGHT=/path/to/playwright/index.mjs node docs/qa/auth-startup-browser-runner.mjs
```

로컬 preview 기본 포트 5181이며 `KO_AUTH_QA_PORT`로 바꿀 수 있다. 러너는 자신의 preview/fixture만 정리한다. 운영 DB URL을 사용하지 않는다. `.github/workflows/auth-startup-validation.yml`에서도 같은 검사/빌드/compiled 브라우저 러너를 실행한다.

변경 파일: auth-client(준비 확인/제출 취소), home-entry(비차단 입력), auth-page(진행/복구 표시), admin/decks(복구 화면 유지), admin-navigation(단일 입구/이전 ID 호환), admin-cosmetics-hub(두 기존 기능 연결), admin-layout와 admin-cosmetics(이탈 보호), 테스트/CI/본 기록. 기능 변경은 별도 `fix/auth-startup-recovery` 브랜치에 분리했다.

배포는 사용자 승인 범위 안에서 PR을 수동 병합하고 Render 웹/API의 같은 커밋을 확인한다. 문제 시 기존 `853c76a` 코드로 돌아갈 수 있고 DB 롤백이나 콘텐츠 복구는 필요 없다. 운영 적용 후 확인 결과는 별도 덧붙인다.

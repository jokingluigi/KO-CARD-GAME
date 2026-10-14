# 인증 서버 응답 장애 — 2026-10-14 (한국 시간)

후속 측정에서 운영 API 응답이 복구되었다. 복구를 직접 확인했으나 장애 원인을 완전히 확정하거나 재발 방지가 끝났다고 판정하지 않는다. 정적 프런트엔드는 약 0.4초에 HTTP 200으로 응답했지만, API 서비스의 `/api/healthz`, 쿠키 없는 `/api/auth/me`, 프런트엔드 프록시의 동일 API와 `/api/server-status`는 반복 측정에서 25초/55초 제한까지 응답 헤더를 주지 않았다. 별도 curl 측정은 TLS 연결 약 0.035초, 첫 응답 바이트 없음이었다. API 루트 및 cache-bust query에서도 같은 읽기 타임아웃을 확인했다.

쿠키가 없는 `/auth/me`는 정상 코드에서 DB를 조회하지 않고 guest JSON을 반환하고, `/healthz`도 DB를 조회하지 않는다. 따라서 운영 데이터의 특정 사용자를 확인하거나 로그인·재화 처리를 재실행해 원인을 찾을 필요는 없다. 현재 측정으로 특정 계정, 인증서 오류, DB 쿼리 하나 또는 Render 무료 플랜을 장애 원인이라고 확정할 수 없다.

서버 시작 코드는 DB 설치, 관리자 초기화, 각성 콘텐츠 확인을 끝낸 뒤에야 HTTP 포트를 연다. 이 과정의 실패/대기, 플랫폼 상태, CPU/메모리 및 라우팅은 Render 서비스 상태·로그를 확인해야 구분된다. 초기 환경에는 Render 키와 통신 허용 주소가 없었다. 이후 사용자 제공 키와 네트워크 설정이 적용되어 공식 Render API의 서비스·배포·이벤트 메타데이터를 읽었다. 정적 사이트와 API 두 서비스 모두 not_suspended, API는 Singapore의 Free 플랜, 현재 main 빌드는 live, 서비스 자체 maintenanceMode=false다. Render의 공개 상태 API도 All Systems Operational/incident 0이었다. 로그 및 CPU 지표 API는 Cloudflare HTML 403으로 거절되어 내용은 읽지 못했다. 인증·접근 통제를 우회하지 않았다.

## 독립적으로 수정한 복구 동작

관리자/덱 화면의 공통 `AuthRecovery`가 일시적인 인증 읽기 실패 후 수동 재시도 버튼에만 머무르는 문제를 수정했다. 실패 화면이 보이는 동안 5초 뒤 기존 세션을 다시 읽고, `online` 이벤트에서 즉시 재확인한다. 숨겨진 탭에서는 자동 읽기를 시작하지 않고 다시 보이면 재확인한다. 성공해 컴포넌트가 사라지거나 다른 화면으로 이동하면 timer/listener를 정리한다.

비밀번호 재전송, 자동 로그인 POST, 세션 만료 연장, 사용자 권한 부여, 실패를 guest/logout으로 캐시하는 처리는 추가하지 않았다. 원래 서버가 응답하지 않는 문제를 이 클라이언트 변경으로 해결했다고 주장하지 않는다.

- 변경: `artifacts/ko-game/src/components/auth-page.tsx`.
- 실제 Chromium 브라우저 검증: 모바일 390px/데스크톱 1440px 각각 자동 재시도·online 복구, 총 4개 PASS. 첫 세션 읽기들에 503을 반환한 뒤 같은 세션 GET으로 실제 관리자 화면에 복귀했고, 재로그인/쓰기 요청 없이 새 읽기 1회만 발생했다.
- 기존 인증·시작·서버 인증 timeout 회귀: 18개 PASS / 0 FAIL.
- 전체 workspace 타입 검사 및 빌드: PASS.
- 브라우저의 모든 API는 localhost 테스트 인터셉트로 격리했다. 가상 사용자만 사용했다.

재현:

```sh
# Node 24 + 저장소 pnpm 환경. 실제 DB에 연결하지 않는 테스트 주소.
DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none artifacts/ko-game/src/lib/auth-client.test.ts artifacts/ko-game/src/lib/startup-client.test.ts artifacts/api-server/src/lib/auth-timeout.test.ts
pnpm run build
# 로컬 Vite 5173 필요. Playwright/Chromium은 환경 설치 경로 사용.
KO_QA_PLAYWRIGHT=/workspace/cloud-setup/browser-tools/node_modules/playwright/index.mjs node docs/qa/auth-recovery-browser-20261014.mjs
```

## 운영 복구에 필요한 접근

Render API 키는 클라우드 시크릿의 `RENDER_API_KEY`로 등록되어 공식 API 읽기 접근을 확인했다. 비밀값을 채팅·코드·GitHub에 저장하지 않는다. 서비스·배포·이벤트·플랜 상태는 확인했다. 로그·CPU API는 위 403 제한 때문에 미확인이다. 유료 플랜이나 운영 설정 변경은 원인과 비용을 확인하지 않은 상태에서 임의로 수행하지 않는다.

후속 상태 측정: API healthz 200/0.32초, 프런트 프록시의 guest auth/me 200/0.38초. 기존 비공개 관리자 쿠키로 정상 세션 authenticated=true/ADMIN을 3회 확인했고 응답은 0.334/0.347/0.417초였다. 별도 로그인 POST는 수행하지 않았다. 계정 식별자·쿠키·재화·키·원본 로그를 보고서나 Git에 저장하지 않았다.

Free 서비스의 유휴 자동 정지는 빠른 상시 접속과 맞지 않으므로, API 서비스 한 개를 상시 가동 Starter로 변경하는 안을 사용자에게 제안했다. 이 과금 변경 및 인증 복구 PR #51 배포는 승인 대기다. 카드 효과 PR #50은 해당 배포에 포함하지 않는다. 현재 장애가 Free 유휴 정지 하나만으로 발생했다고 확정하지 않는다.

이번 조사에서 운영 요청은 GET만 수행했다. 운영 DB·계정·카드 데이터나 서버 설정을 변경하지 않았다. 이전 카드 효과 PR #50과 분리해 정상 main 기준 브랜치 `fix/auth-server-latency-20261014`에 수정했다. main 푸시/운영 배포는 수행하지 않았다.

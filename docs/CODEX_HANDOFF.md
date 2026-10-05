# KO CARD GAME — Codex 이어받기

저장소: `jokingluigi/KO-CARD-GAME`. 시작 branch는 최신 `main`이다. 작업을 재구현하거나 기존 변경을 reset/revert하지 않는다. 먼저 branch/status/recent commits/diff를 확인한다.

## 현재 구현

Draft 2.0은 기존 Draft를 확장했다. 시너지/특수 pick, 전체 공유 reroll 2회, 후보 잠금, 개체별 일반/대변이, 저장된 deterministic 후보, admin 설정, deck summary를 포함한다. baseline metadata가 stat/cost/keyword reset과 silence를 통과한다. 원본 catalog/Collection/일반 Deck/Tower에 변이를 저장하지 않는다. `6061369`에서 main 병합 및 운영 JS/health 응답 확인.

후속 AI/어디에 있든 수정: cosmetic stat feedback은 AI 진행을 기다리게 하지 않는다. 덱/상대 hidden card의 stat 팝업은 화면에 표시하지 않는다. 소환/공격/퇴장과 중요한 변신/퀘스트 완료 연출의 순서는 유지한다. ALL-card selector의 “어디에 있든”은 HAND/DECK/BOARD를 포함한다. draw는 덱에서 받은 강화/비용 변경을 보존한다. 필드에서 손/덱/묘지로 이동하는 reset은 그대로 유지한다. Technique에 선수 스탯을 추가하지 않는다.

## 검증

- Draft 기존 회귀: 90개 파일 781개 PASS. 관련 최종 변경 mutation/keyword/sanitizer 44개, 격리 HTTP 9개 PASS.
- 후속 engine/effects/AI + presentation + Draft mutation: 547개 PASS. TypeScript engine/frontend/server와 Vite build PASS.
- 기존 draw-buff 소실을 기대하던 테스트 두 개는 사용자가 요청한 새로운 규칙에 맞춰 기대값을 변경했다.
- 모바일 실제 조작, 전체 원격 PvP 경기/체감 지연, 모든 영향을 받은 화면은 UNVERIFIED. 자동 테스트만으로 실제 화면 PASS라 하지 않는다.
- 상세 Draft QA: `docs/qa/draft-v2-resume-20261005.md`.
- 후속 QA: `docs/qa/ai-input-anywhere-20261005.md`.

## 이어서 할 일

실제 AI Match에서 intro/mulligan 이후 전체 버프 시 입력과 AI 턴 전환을 확인한다. “어디에 있든” 카드로 손/필드/덱 강화 → draw → summon을 검증한다. 모바일 세로 Draft 25 pick/mutation/summary와 재접속, 양쪽 PvP full-match 및 체감 지연을 확인한다. 남은 UNVERIFIED를 명시하고 확인 전 완료 선언하지 않는다.

상점 구매, 카드/덱/계정 삭제, 원본 카드/Champion 및 Production DB 직접 수정 금지. 테스트 계정의 테스트 게임을 우선한다. 운영 배포 권한은 이번 작업에 대해 받았으며 향후 작업까지 무제한 승인으로 해석하지 않는다.

## 환경 및 명령

pnpm workspace이다. 의존성을 새 환경에 설치하고 workspace package가 현재 checkout을 참조하는지 확인한다. Node의 tsx loader로 테스트를 실행할 수 있다. 이 작업 환경의 loader 위치는 아래와 같았으며 새 환경에서는 실제 설치 버전을 확인한다.

```sh
pnpm install --frozen-lockfile
node node_modules/typescript/bin/tsc --build lib/effect-registry lib/api-client-react lib/db lib/api-zod lib/game-engine
node node_modules/typescript/bin/tsc -p artifacts/ko-game/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p artifacts/api-server/tsconfig.json --noEmit
node --import ./node_modules/.pnpm/tsx@4.23.4/node_modules/tsx/dist/loader.mjs --test lib/db/qa/draft-http.test.ts
```

frontend build는 `artifacts/ko-game`에서 `node node_modules/vite/bin/vite.js build --config vite.config.ts`. HTTP 테스트는 synthetic card/auth와 PGlite로 격리하며 운영 DB가 필요 없다. 전수 catalog QA나 실제 서비스 플레이를 격리 fixture 테스트와 혼동하지 않는다. 비밀값은 GitHub나 이 문서/채팅에 저장하지 않는다.

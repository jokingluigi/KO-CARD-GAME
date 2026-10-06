[CHECKPOINT]

Branch:
checkpoint/card-effects-mechanics-20261006

Commit:
이 메모를 포함하는 `checkpoint: preserve card-effect fixes and mechanics inventory` 커밋.
정확한 해시는 이 브랜치에서 `git log -1 --format=%H`로 확인한다.
저장 완료 후 정확한 해시·Push 결과를 기록한 사용자 전달용 메모도 제공한다.

Push:
커밋 작성 시점에는 미실행. 최종 결과는 사용자 전달용 CHECKPOINT 메모 또는
`git ls-remote origin refs/heads/checkpoint/card-effects-mechanics-20261006`으로 확인한다.
원격 해시와 로컬 HEAD가 같아야 복구 가능한 저장 완료 상태다.

Completed:
- A: PR #12의 빠른 대전 덱 생성 공통화. contentRule, 아머, 회피 횟수, 사용 조건, 기본 수치를 보존한다.
- A: 뱀파이어 왕자 MPG·힐빌의 실제 덱→드로우→직렬화→손패 플레이 재현 검사를 통과했다.
- A: 오젠은 비용 1 이하 일반 토큰도 파괴하며 챔피언 제외 조건은 유지한다. DB 보정 0045는 백업 후 1회만 적용된다.
- A: 방어는 등장 후 상대 턴 내내 유지되고 다음 자기 턴 시작에 해제된다. 피해·공격 대상 지정 차단 및 상대 턴 소환 경계를 검사했다.
- A: 위 수정은 15562acbcd475748b44a68d9129f948b8d9e677e / PR #12로 이미 main에 병합·배포됐다. 이번 체크포인트는 main을 변경하지 않는다.
- A: 키워드 11개, 등록 발동 시점 21개+위치 발동, 실행 동작 47개, 이벤트 감시 5개와 주요 규칙·재정비 항목을 문서화했다.
- A: 이번 체크포인트 최소 검사 88개, 공유/클라이언트/서버 TypeScript 검사, 검사 도구 syntax/import 검증.

Partially Completed:
- B: 수정의 엔진·상태 직렬화·공개 배포 검증은 완료했지만 인증된 사용자 2명의 실제 빠른 대전 UI 검증은 아직 하지 않았다.
- B: 키워드·매커니즘 목록은 작성 완료. 치유·기절·등장/소환·생명의 교환 등의 규칙 재정비 방향은 사용자가 결정하기 전이며 실행 규칙을 새로 바꾸지 않았다.

Remaining:
- C: 구현 중인 미저장 코드 변경은 없음.
- 실제 두 사용자 대전에서 세 카드와 방어를 한 번 더 확인.
- 사용자가 목록을 검토한 뒤 요청하는 규칙만 재정비. 임의로 규칙·설명·기본 수치를 변경하지 말 것.
- 사용자 요청에 따라 작업은 여기서 중단. 재개 지시 전 추가 개발·배포하지 말 것.

Important Files:
- docs/qa/checkpoints/20261006/RECOVERY.md
- docs/qa/checkpoints/20261006/keywords-mechanics.md
- docs/qa/checkpoints/20261006/qa-loader.mjs
- docs/qa/checkpoints/20261006/minimal-tests.log
- docs/qa/checkpoints/20261006/ai-100-report.md
- docs/qa/checkpoints/20261006/deployment-result.json
- artifacts/ko-game/src/game/cards/test-cards.ts
- artifacts/ko-game/src/game/cards/published-cards.ts
- artifacts/ko-game/src/game/engine/keyword-rules.ts
- artifacts/ko-game/src/game/engine/enter-field.ts
- artifacts/ko-game/src/game/engine/turn-system.ts
- artifacts/ko-game/src/game/cards/zone-state.ts
- artifacts/ko-game/src/game/engine/quick-match-reported-cards.test.ts
- artifacts/ko-game/src/game/qa/fixtures/quick-match-reported-cards.json
- lib/db/migrations/0045_ozen_ordinary_token_targets.sql
- lib/db/qa/ozen-token-targets.test.ts
- .agents/memory/card-effect-fix-policy.md

Tests:
- PASS: `node node_modules/typescript/bin/tsc --build`
- PASS: `node node_modules/typescript/bin/tsc -p artifacts/ko-game/tsconfig.json --noEmit`
- PASS: `node node_modules/typescript/bin/tsc -p artifacts/api-server/tsconfig.json --noEmit`
- PASS: 아래 Node 24+ 검사 명령의 88개 검사(quick-match 6개, DB 1개, draft mutation 및 combat/turn/champion/retire-destroy).
- PASS: `node --check docs/qa/checkpoints/20261006/qa-loader.mjs` 및 `git diff --cached --check`.
- PASS(이전 작업): AI 100경기, 6,504행동, 23,074이벤트, 실패·시간초과·중단 0. 이번 문서 저장에서는 재실행하지 않음.
- FAIL: 이번 최소 검증의 미해결 실패 없음.
- Historical: 이전 전체 검사 1,474개는 옛 방어 기대값 1개만 실패. 기대값 수정 후 관련 33개와 이번 88개가 통과. 전체 1,474개를 재실행했다고 보고하지 말 것.
- UNVERIFIED: 인증된 실서비스 2인 대전 UI, 이번 로컬 production build, 별도 lint. TypeScript 검사와 실행 테스트는 통과.

Known Issues:
- 치유는 현재 양쪽 턴 종료에 모두 발동한다. 자기 턴에만 발동하도록 바꾸는 작업은 승인된 재정비 요청이 나오기 전에는 하지 않는다.
- 기절은 현재 턴 시작에 자동 해제되지 않는다.
- 일반 소환·부활은 등장 능력을 자동 발동시키지 않는다. 등록 라이브러리의 일반 설명과 실제 진입 경로의 범위가 다르다.
- 생명의 교환은 사용자 지정에 따라 현재·최대 체력을 교환하지만 저장된 설명은 현재 체력만 교환하고 기존 상한을 적용한다고 되어 있다. 설명은 변경하지 않았다.
- 무작위 기본 범위는 일반 토큰도 제외하므로 챔피언만 제외하는 설명의 카드는 범위 설정을 확인해야 한다.
- 배포 비교의 changed 배열 2건은 이번 배포 전 수정된 챔피언 토큰 비용이다. 2026-10-05 15:52 UTC에 이미 변경된 레코드이며 이번 패치는 기본 수치·설명을 변경하지 않는다.
- API/UI 검증은 기존 경기 스냅샷과 새 경기의 메타데이터 차이에 주의할 것. 새 경기로 실제 UI 재현을 확인한다.

Next Step:
1. 현재 브랜치, 체크포인트 커밋, git status와 원격 해시를 확인한다.
2. `git show --stat HEAD`와 이 메모·목록 문서를 읽는다. 처음부터 다시 구현하지 않는다.
3. 새 경기에서 인증된 두 사용자로 MPG·오젠·힐빌·방어의 UI 동작을 확인한다.
4. 이후 사용자의 규칙 재정비 지시에 따른다. main 직접 변경·force push·reset/revert/discard 금지.

Recovery Commands:
```powershell
git branch --show-current
git log -1 --format=%H
git status --short
git branch -vv
git show --stat HEAD
git ls-remote origin refs/heads/checkpoint/card-effects-mechanics-20261006
```

Minimal Test Command (repository root; Node 24+):
```powershell
$env:DATABASE_URL='postgres://qa:qa@127.0.0.1:1/qa'
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none lib/game-engine/src/draft/mutations.test.ts artifacts/ko-game/src/game/engine/quick-match-reported-cards.test.ts lib/db/qa/ozen-token-targets.test.ts artifacts/ko-game/src/game/engine/combat.test.ts artifacts/ko-game/src/game/engine/turn-system.test.ts artifacts/ko-game/src/game/engine/champion-system.test.ts artifacts/ko-game/src/game/engine/retire-destroy-semantics.test.ts
```

Windows runtime used:
`C:/Users/com/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`

Initial State:
- Branch: main
- HEAD: 15562acbcd475748b44a68d9129f948b8d9e677e
- Tracking: origin/main, 차이 0
- Staged: 0 / Unstaged: 0 / Untracked in repository: 0
- 최근 5개: 15562ac / 13a503a / 60d057a / cd515bb / a229a02
- 현재 변경: 위 체크포인트 문서·QA 증거·검사 로더만 추가. 제품 코드 변경 없음.

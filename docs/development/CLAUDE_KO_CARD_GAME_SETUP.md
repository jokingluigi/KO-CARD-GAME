# Claude용 KO CARD GAME 개발 환경 안내

작성: 2026-11-18. 이 문서를 Claude Code 또는 저장소에 접근할 수 있는 Claude 개발 환경에 전달한다. 일반 채팅만으로는 로컬 파일을 직접 수정할 수 없다.

현재 환경에서 프런트 타입 검사 통과, 준비된 시작 스크립트 실행 성공, 프록시 경유 API 건강 상태·DB 카드 조회·프런트 응답 확인. 별도 Claude 컴퓨터의 신규 설치까지 실행한 것은 아니다.

## 1. 가장 먼저 작업본 맞추기

- 저장소: https://github.com/jokingluigi/KO-CARD-GAME
- 현재 Codex 폴더: `/workspace/KO-CARD-GAME`
- 원래 기준 브랜치: `fix/multiplayer-action-latency`. 공동 작업 시작 시 실제 전달받은 인계 브랜치와 커밋을 확인한다.
- 이 안내를 처음 작성할 때 미커밋 변경이 다수 있었다. 이후 인계 브랜치에 커밋된 변경과 아직 로컬에만 남은 파일을 `git status`와 전달 SHA로 구분한다. GitHub의 기본 브랜치가 인계 브랜치와 같다고 가정하지 않는다.
- 별도 컴퓨터에서 개발하려면 현재 변경을 검토해 인계용 브랜치에 커밋·공유하거나, 현재 작업본을 안전하게 전달받아야 한다. 비밀키, 환경변수 파일, DB 덤프, node_modules는 공유하지 않는다. 단순 git diff만으로는 신규 파일까지 전달되지 않는다.
- 이 문서는 변경을 커밋하거나 원격에 올리지 않는다. GitHub clone만 했으면 현재 Codex의 미커밋 작업은 포함되지 않는다.

## 2. 프로젝트 구조

| 경로 | 역할 |
| --- | --- |
| `artifacts/ko-game` | React 19·Vite 7·TypeScript 프런트 |
| `artifacts/api-server` | Express API·온라인 경기 WebSocket 서버 |
| `lib/game-engine` | 전투 규칙·AI·공유 게임 로직 |
| `lib/effect-registry` | 카드 능력 정의. 시각 효과 폐기와 혼동해 삭제하지 않기 |
| `lib/db` | PostgreSQL·Drizzle 스키마 |
| `lib/api-client-react`, `lib/api-zod`, `lib/api-spec` | API 클라이언트·계약 |
| `docs/qa` | 기존 검증 스크립트·기록 |

## 3. 이미 준비된 현재 Codex 환경을 쓰는 경우

이 경로들이 실제 존재할 때만 사용한다. 별도 Claude 컴퓨터에 자동으로 생기는 파일이 아니다.

```bash
cd /workspace/KO-CARD-GAME
source /workspace/cloud-setup/env.sh
bash /workspace/cloud-setup/start.sh
```

준비된 환경은 Node 24.19.0, pnpm 10.34.0, 로컬 PostgreSQL 17을 사용한다. API 8080, 프런트 5173이며, 로컬 프록시 설정은 `.local/cloud-vite.config.mts`에 있다. 시작 스크립트는 API 건강 상태·DB 기반 카드 조회·프런트 응답을 확인한다.

API 소스를 수정했다면 서버는 자동 재컴파일되지 않는다. `pnpm --filter @workspace/api-server build` 후 자신이 관리하는 개발 API 프로세스만 재시작한다. 다른 작업자의 서버나 PostgreSQL을 종료하지 않는다. 공유 서버의 재시작은 담당자를 정해 수행한다.

`/workspace/cloud-setup/install.sh`는 과거 Tower 테스트 경로가 남은 이전 설정 스크립트이므로 그대로 재실행하지 않는다.

## 4. 별도 Claude 환경에 새로 설치하는 경우

권장 OS는 Linux x64 glibc, Windows라면 WSL2 Ubuntu x64. `pnpm-workspace.yaml`이 여러 타 OS·ARM 네이티브 패키지를 제외하므로 macOS/Windows 네이티브나 ARM에서 동일 설치가 된다고 보장할 수 없다. 기존 제외 설정을 임의로 지우지 않는다.

Node.js 24 LTS, PostgreSQL 17을 설치한 뒤 pnpm을 준비한다.

```bash
npm install --global pnpm@10.34.0
git clone https://github.com/jokingluigi/KO-CARD-GAME.git
cd KO-CARD-GAME
```

이 시점에 1절에 따라 인계받은 최신 작업본을 적용하고, Claude 담당 브랜치에서 시작한다. 현재 수정분이 이미 들어 있는 폴더에서는 clone을 반복하지 않는다.

```bash
pnpm install --frozen-lockfile
```

의존성은 pnpm만 사용한다. 설치 오류를 숨기려고 lockfile을 재생성하거나 패키지 검증·최소 배포 기간 설정을 끄지 않는다.

### 로컬 DB

운영 Supabase/Render DB 대신 새 로컬 PostgreSQL DB와 해당 로컬 사용자 계정을 준비한다. 아래 명령은 현재 OS 사용자가 로컬 PostgreSQL에 접속 가능한 경우의 예다. PostgreSQL 사용자 인증 준비는 설치 방식에 따라 달라진다.

```bash
createdb ko_game_claude
export DATABASE_URL="postgresql://$(whoami)@127.0.0.1:5432/ko_game_claude"
pnpm --filter @workspace/db push
pnpm --filter @workspace/api-server build
```

`push`는 스키마를 변경하므로 DATABASE_URL이 새 로컬 개발 DB를 가리키는지 확인한다. `push-force`나 운영 DB 마이그레이션은 실행하지 않는다. 새 로컬 DB는 운영 카드·사용자·이미지·계정을 복제하지 않는다. 실제 카드 카탈로그와 로그인까지 재현하려면 프로젝트의 개발용 데이터·계정 설정을 별도로 준비해야 한다.

### API 실행: 터미널 A

```bash
export DATABASE_URL="postgresql://$(whoami)@127.0.0.1:5432/ko_game_claude"
NODE_ENV=development ENABLE_TEST_AUTH=false PORT=8080 pnpm --filter @workspace/api-server start
```

개발 API 시작에도 스키마 생성·초기화·백그라운드 작업이 실행될 수 있으므로 운영 DB URL을 넣지 않는다. API의 `dev` 스크립트는 ENABLE_TEST_AUTH 기본값을 true로 설정하므로 여기서는 명시적으로 false를 사용한다. `.env`를 만들기만 하면 자동 로드된다고 가정하지 말고 실행 프로세스에 변수를 제공한다.

### 프런트 프록시 준비: 저장소 루트

기본 Vite 설정에는 API 프록시가 없다. `.local`은 gitignore 대상이며 아래 파일은 개인 개발용이다. 이미 있으면 덮어쓰지 말고 내용을 확인한다.

```bash
mkdir -p .local
cat > .local/claude-vite.config.mts <<'EOF'
import { mergeConfig } from '../artifacts/ko-game/node_modules/vite/dist/node/index.js';
import base from '../artifacts/ko-game/vite.config';
export default mergeConfig(base, {
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', ws: true }
    }
  }
});
EOF
```

### 프런트 실행: 터미널 B

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/ko-game exec vite --config ../../.local/claude-vite.config.mts --host 127.0.0.1
```

별도 환경의 웹 미리보기를 사용한다면 그 환경의 포트 공개 기능을 사용한다. 로그인·온라인 경기는 API와 쿠키·WebSocket이 필요하다. 외부 인증·저장소 연동이 필요한 작업에만 개발용 설정을 추가하고, 비밀값은 채팅이나 Git에 넣지 않는다.

## 5. 확인 명령

저장소 루트에서:

```bash
curl --fail http://127.0.0.1:5173/api/healthz
curl --fail http://127.0.0.1:5173/api/cards
pnpm --filter @workspace/ko-game typecheck
pnpm --filter @workspace/ko-game build
```

카드 API가 빈 배열이면 로컬 DB에 카드 데이터가 없는지 확인한다. 상태 200만으로 로그인·실시간 경기까지 검증했다고 하지 않는다.

기존 프런트 전투 관련 단위 테스트 예:

```bash
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test \
  artifacts/ko-game/src/components/attack-animation-utils.test.ts \
  artifacts/ko-game/src/components/presentation-event-feedback.test.ts
```

엔진/API 변경은 해당 경로의 실제 테스트를 추가 실행한다. QA loader는 Node 24 이상이 필요하다. 모든 테스트를 무조건 한 번에 실행하기보다 수정 범위에 맞게 고른다.

## 6. Codex·Claude 공동 작업 및 패치 동기화 절차

### 자동 동기화에 대한 전제

이 안내문은 두 AI 사이에 자동 통신·파일 동기화 기능을 설치하지 않는다. 두 AI는 상대의 대화·수정 의도를 자동으로 알지 못한다. 같은 폴더에서는 파일 변경이 보이지만, 이미 읽은 내용이 자동으로 최신화되지는 않는다. 별도 환경에서는 커밋을 공유하고 가져오기 전까지 상대 변경이 보이지 않는다.

따라서 상대 패치는 **전달 → 가져오기 → diff 읽기 → 테스트**까지 끝났을 때만 반영 완료로 취급한다. 파일 공유·Git fetch만 했다고 통합 완료라고 하지 않는다. 두 AI가 직접 메시지를 주고받을 수 없는 환경에서는 사용자가 아래 인계 내용을 상대 대화에 전달한다.

### 권장 구성과 역할

- 각자 별도 작업 폴더와 브랜치를 사용한다. 예: Codex `codex/<작업명>`, Claude `claude/<작업명>`. 이미 격리된 클라우드 환경에서는 추가 worktree가 필요 없다.
- 시작 기준 커밋을 하나로 맞춘다. 현재 Codex의 미커밋 변경도 먼저 검토해 인계 기준에 포함해야 한다. 최신 GitHub clone에 현재 변경이 자동 포함된다고 가정하지 않는다.
- 매 작업마다 담당 파일을 먼저 정한다. 예시: Codex는 프런트, Claude는 엔진. 이는 자동 배정이 아니며 실제 작업 전에 확정한다.
- 공유 타입, API 요청·응답, package.json, lockfile, 공통 CSS처럼 양쪽에 영향을 주는 파일은 한 명만 담당한다. 담당 밖 수정이 필요하면 해당 수정부터 조율하고 겹치지 않는 작업을 계속한다.
- 통합 담당은 기본 Codex로 두되 사용자가 변경할 수 있다. 상대 작업자가 동일 패치를 별도로 중복 병합하지 않는다.
- 개발 DB를 분리하고, 같은 머신이면 포트도 분리한다. 예: Codex API 8080/프런트 5173, Claude API 8081/프런트 5174. 각 프록시가 자기 API를 가리키게 한다.

### 작업을 시작하거나 이어갈 때

각자의 저장소 루트에서 아래를 확인한다.

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

1. 현재 HEAD, 담당 경로, 인계받은 기준 커밋이 일치하는지 확인한다.
2. 미커밋 변경이 있으면 관련 diff와 신규 파일을 읽어 소유자를 구분한다. 상대 변경을 덮어쓰거나 전체 reset/stash하지 않는다.
3. 상대가 새 커밋을 전달했다면 이를 통합할지 먼저 판단한다. 현재 작업에 필요한 API·타입 변경이면 통합 후 진행한다.
4. 편집 직전에 대상 파일과 관련 diff를 다시 읽는다. 이전 대화의 코드 기억만으로 파일 전체를 덮어쓰지 않는다.
5. 같은 파일을 동시에 수정해야 하면 한쪽이 먼저 마치고 인계한다.

### 완료 후 상대에게 전달할 내용

별도 환경에서 전달할 작업은 변경 파일을 검토해 자기 작업만 커밋하고 공유 가능한 브랜치에 올린다. `git add .`로 다른 작업까지 묶지 않는다. 네트워크·쓰기 권한이 없다면 업로드했다고 하지 말고, 신규 파일까지 포함한 전달 방법을 마련한다. 비밀값·환경변수 파일·DB 덤프는 포함하지 않는다.

아래 양식을 매번 상대에게 전달한다.

```text
[공동 작업 인계]
담당: Codex 또는 Claude
작업: 무엇을 바꿨는지
기준 커밋: 작업 시작 HEAD 전체 SHA
전달 브랜치: origin/실제-브랜치명
완료 커밋: 실제 전체 SHA (여러 개면 순서대로)
변경 파일: 실제 경로 목록
공유 계약 변경: API·타입·DB·의존성 변경 유무와 내용
검증: 실행한 명령과 결과, 실행하지 못한 항목
미커밋/미전달 작업: 있음/없음과 내용
상대에게 필요한 후속 작업: 구체적인 내용
배포: 하지 않음 또는 명시적으로 승인받아 수행한 내용
```

### 상대 패치를 받아 통합할 때

아래 대문자 값은 설명용이다. 실제 전달받은 브랜치·SHA로 대체한다. 명령을 그대로 무조건 실행하지 않는다.

```bash
git status --short
git fetch origin
# fetch는 로컬 작업 파일에 패치를 적용하지 않는다.
git show --stat COMMIT_SHA
git diff BASE_SHA COMMIT_SHA -- PATH_TO_REVIEW
```

- 자신의 미커밋 작업이 있으면 먼저 자기 작업만 보존하고 통합 가능한 상태를 만든다. 다른 사람의 작업을 임의로 stash/reset하지 않는다.
- 선택한 통합 브랜치에서 diff를 검토한 뒤 `git cherry-pick COMMIT_SHA`로 해당 패치를 적용할 수 있다. 여러 커밋이면 의존 순서대로 적용한다. 이미 포함된 커밋은 중복 적용하지 않는다.
- 충돌이 나면 양쪽 의도와 기존 기능을 확인해 해결한다. 한쪽 파일을 통째로 선택해서 충돌만 숨기지 않는다.
- package/lockfile이 바뀌었다면 `pnpm install --frozen-lockfile`을 실행한다.
- 관련 타입 검사·테스트를 실행하고, 화면이나 온라인 경기 변경이면 해당 동작을 확인한다. API는 수정 후 다시 빌드하고 자신이 관리하는 개발 서버를 재시작한다. 프런트는 필요하면 새로고침해 실제 새 코드를 확인한다.
- 통합 후 HEAD와 반영한 상대 SHA, 테스트 결과를 상대에게 전달한다. 상대는 다음 작업 전 그 통합 커밋을 가져오고 파일을 다시 읽는다.
- 확인 실패 시 반영 완료라고 보고하지 않는다. 어떤 단계에서 막혔는지 기록하고 영향을 받지 않는 작업은 진행한다.

### 같은 폴더를 공유해야 하는 경우

같은 폴더에서는 브랜치 변경도 양쪽에 영향을 준다. 상대가 작업 중일 때 checkout, 전체 stash/reset, clean, 의존성 재설치, 공용 서버 종료를 하지 않는다. 담당 파일을 엄격히 나누고 파일을 다시 읽은 뒤 편집한다. 의존성 설치·공용 빌드·서버 재시작은 담당자를 한 명 정한다. 서로 다른 폴더를 쓸 수 있으면 위 권장 구성을 따른다.

운영 배포, 유료 전환, 인프라 생성, 운영 DB 변경은 별도 명시적 요청 없이 수행하지 않는다.

## 7. 현재 제품 결정: 반드시 유지

- 사용자는 현재 제작한 모든 VFX의 폐기를 요청했다. PixelFX·오리지널 VFX·대체 입자 효과·생성 산출물·게임 연결을 삭제한 상태다. 이전 VFX masterplan을 재개하거나 효과를 복원하지 않는다.
- 카드 능력의 게임 판정, 피해 숫자, 키워드 UI, 기본 카드 이동은 시각 효과 폐기와 별개다.
- Tower 모드도 제거 작업이 진행된 상태다. 과거 문서·테스트만 보고 되살리지 않는다.
- AI·카드·관리자 등 다른 미커밋 작업은 보존한다.
- 현재 로컬 변경이 원격 저장소나 운영 사이트에 배포되었다고 가정하지 않는다.

## Claude에게 붙여넣을 시작 지시

> 첨부한 KO CARD GAME 개발 환경 안내를 읽고, 특히 6절의 공동 작업·패치 동기화 절차를 따라 줘. 두 AI의 자동 동기화를 가정하지 마. 시작할 때 현재 HEAD·브랜치·미커밋 변경을 확인하고 담당 경로를 확정해. 상대 패치는 전달된 커밋을 가져와 diff를 읽고 통합·테스트한 뒤에만 반영 완료라고 해. 완료할 때 공동 작업 인계 양식을 작성해 줘. 우선 현재 작업본의 브랜치·미커밋 변경과 기존 지침을 확인해 줘. Codex와 담당 파일이 겹치지 않게 작업해. Node 24와 pnpm 10.34.0, PostgreSQL 개발 DB를 사용하고 프런트의 /api 프록시 및 WebSocket 연결을 구성해. 현재 Codex 환경에 이미 준비된 설정이 있으면 재사용하고, 다른 환경이면 안내의 별도 설치 절차를 따라 줘. 운영 DB·배포·결제 설정은 건드리지 마. 폐기된 VFX와 Tower를 복원하지 마. 실제 실행·타입 검사·담당 범위 테스트 결과를 확인한 뒤 변경 파일과 결과를 알려줘.

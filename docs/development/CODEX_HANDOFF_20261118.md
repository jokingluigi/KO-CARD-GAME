# Codex → Claude 인계: Tower 제거 및 VFX 폐기

- 기준 커밋: `37c3394487372708f70c9be66852b46db40d6b91`
- 인계 브랜치: `handoff/claude-vfx-tower-retirement-20261118`
- 이 문서를 포함하는 커밋이 전달 대상이다. 실제 전체 SHA는 `git rev-parse HEAD`로 확인한다.
- 개발 환경·공동 작업 규칙: [CLAUDE_KO_CARD_GAME_SETUP.md](./CLAUDE_KO_CARD_GAME_SETUP.md)
- 코드 및 기존 문서 변경 경로: [파일 목록](./CODEX_HANDOFF_FILES_20261118.json). 이 인계 기록과 파일 목록 자체는 목록에서 제외했다.

## 반영 내용

1. 사용자가 폐기를 요청한 PixelFX·전투 VFX 렌더러, 에셋, 프리뷰, 생성 스크립트와 호출 연결을 제거했다. 피해 숫자, 키워드 UI, 카드 이동 및 공격 판정은 유지한다. 이전 VFX 제작 계획을 재개하지 않는다.
2. Tower 플레이·관리자 화면, API 라우트, 서버 실행 모듈, 전투 엔진의 유물·모드 연동을 제거했다. 퀘스트 지원 모드에서 Tower를 제외하고 일반 4칸 필드 용량을 공용 함수로 분리했다.
3. 피니셔 등에서 여전히 사용하는 음악 첨부·편집 기능을 `MusicTrack` 공용 모듈로 옮겼다. 이 신규 파일도 빠짐없이 받아야 한다.
4. 서버 시작 함수 이름을 `ensureTowerStorage`에서 `ensureApplicationStorage`로 변경했다. 시작 시 폐기된 모드 테이블을 요구하거나 새로 만들지 않는다.
5. 과거 DB 스키마 정의·마이그레이션·기존 기록은 삭제하지 않았다. 과거 업로드의 참조 여부를 확인하는 읽기 경로도 보존했다. 운영 DB에는 이 작업을 적용하지 않았다.

## 이번 인계에서 실행한 검증

- `pnpm run typecheck`: 공유 라이브러리·프런트·API·기타 워크스페이스 검사 통과.
- `pnpm --filter @workspace/ko-game build`: 통과. 기존 튜토리얼 청크 순환 참조 등의 빌드 경고는 남아 있다.
- `pnpm --filter @workspace/api-server build`: 통과.
- 전투 움직임·피드백·음원 출처·관리자 탐색·음악 첨부·모드별 음악·카드 사용 정책·DB 시작 스키마 테스트: 46개 통과.
- `artifacts/ko-game/src/game/actions/ai-evaluator.test.ts`: 15개 통과.
- `docs/qa/vfx-discard-smoke.mjs`: 데스크톱 및 터치 화면에서 실제 엔진 공격 판정, 피해 이벤트, 입력 복귀 확인. 폐기 VFX DOM·에셋 요청·스크립트 오류 0건.
- `docs/qa/retire-tower-and-distinct-fx.mjs`: 데스크톱 및 터치 화면에서 Tower 페이지 없음, 관리자 메뉴 제거, Tower API 미호출 확인. 파일명은 과거 이름이며 현재 VFX 제작 검증은 하지 않는다.
- `git diff --cached --check`: 통과.

브라우저 검증은 로컬 fixture와 mock API를 사용했다. 운영 로그인·실제 사용자 간 온라인 경기·물리 휴대폰까지 검증했다고 해석하지 않는다. 신규 Claude 환경에서의 의존성 설치 성공도 이 결과로 보장하지 않는다.

과거 광범위 회귀 검사에서는 기준 커밋에도 있던 각성 AI 선택 관련 4건 및 손패 재실행 관련 1건의 실패가 기록됐다. `docs/qa/20261116-retire-tower/README.md`를 참고한다. 이번 인계에서는 전체 회귀 검사를 다시 실행하거나 그 실패를 고쳤다고 주장하지 않는다.

## Claude가 받는 순서

현재 `claude/env-setup`이 기준 커밋에 있고 추적 파일 수정이 없다는 인계를 전제로 한다. 우선 `git status --short`로 다시 확인한다.

```bash
git fetch origin
git log --oneline 37c3394487372708f70c9be66852b46db40d6b91..origin/handoff/claude-vfx-tower-retirement-20261118
git diff --stat HEAD origin/handoff/claude-vfx-tower-retirement-20261118
```

관련 diff와 인계 파일 목록을 읽은 뒤, 자신의 브랜치에서 다음처럼 fast-forward로 받는다. 분기됐거나 추적 파일 수정이 있으면 강제 reset하지 말고 변경 내용을 확인해 통합한다.

```bash
git merge --ff-only origin/handoff/claude-vfx-tower-retirement-20261118
git rev-parse HEAD
git status --short
```

Git에서 무시되는 `.local/claude-vite.config.mts`는 이 브랜치에 포함되지 않으며 Claude의 로컬 설정을 유지한다. package manifest와 lockfile 변경은 없다. Claude 환경은 앞선 인계 기준으로 레지스트리 차단 때문에 설치·타입 검사·테스트가 미완료이므로 그 환경의 레지스트리 접근을 해결한 뒤 실제로 확인해야 한다.

동기화 후에는 위 SHA와 검증 결과를 Codex에게 전달하고, 다음 작업의 담당 파일을 정한다. 운영 배포·인프라 생성·유료 전환은 하지 않는다.

## 의도적으로 전달하지 않은 로컬 파일

`qa-results/`의 대용량 과거 결과물, 과거 QA 영상, 폐기 VFX의 과거 JSON 결과물 및 `/workspace/outputs` 다운로드 산출물은 커밋에 넣지 않았다. 게임 코드나 필수 모듈이 아니다. 로컬 원본은 일괄 삭제하지 않았다. 이 소스 인계는 운영 배포가 아니다.

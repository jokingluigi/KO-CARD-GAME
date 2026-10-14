# 최신 관리자 효과 구현·검증 보고서 — 2026-10-13

**현재 작업은 전수 완료 판정이 아니다.** 관리자 전용 콘텐츠를 모두 확보하고 140개 ID를 목록화했다. 최신 변경 카드 5장의 실제 효과, 무작위 생성 풀, 중첩 효과 재개 오류를 수정했다. 모든 129개 카드의 실제 사용/챔피언 보상 배치 후 턴 진행을 실행했다. 묘지 적용 명세가 확정되지 않은 3개 항목은 `UNVERIFIED`로 남겼다. A 137개도 기록된 엔진 시나리오 범위의 판정이며 PvP·타워의 전 카드 교차 검증 완료를 의미하지 않는다.

## A. 데이터 조사 결과

- 관리자 UI: https://ko-card-game-vr69.onrender.com/admin
- 실제 공식 데이터: 인증된 `https://ko-card-game.onrender.com/api/admin/cards`, `/api/admin/champions`, `/api/admin/tags/`, `/api/admin/tower/` GET.
- 카드 **129장** = 선수 106장 + 주문 23장. 공개 85장, 비공개 DRAFT 44장.
- 챔피언 **11명** = 공개 7명, DRAFT 3명, DISABLED 1명.
- 토큰 **23장**(위 카드 수에 포함), 그중 챔피언 토큰 7장. 별도 23장을 더하는 집계가 아니다.
- 태그 18개. 타워 설정 1개 시즌, 16층, 보스 5개, 스타터 3개, 유물 24개, 캐릭터 7개, 장면 8개. 최종 스냅샷에는 효과 라이브러리와 유물 정의도 포함했다.
- 타워 전체 진입은 운영 설정에서 `enabled=false`. 이 값을 변경하지 않았다.
- 저장소 2026-10-12 전체 fixture와 게임 정의 차이: 카드 5장(아비터, 조킹루이지, 좀비 데헌, 카스토, 판도라), 챔피언 1명(판도라). 신규 ID 추가는 없었다. 비용·능력치·희귀도 변경은 관리자 원본 그대로 로드했으며 코드가 운영 값을 덮어쓰지 않았다.
- 초기 공개 API는 85장/7명만 제공한다. 공개 응답에는 정규화도 있어 원본 관리자 데이터와 같다고 가정할 수 없다.
- 격리된 테스트는 content-only [스냅샷](../snapshots/20261013-admin/manifest.json)을 사용했다. 계정, 구매, 컬렉션, 덱, 재화, 플레이 기록, 세션, 비밀키는 스냅샷에 없다.
- 최초 확보 시각: `2026-10-13T17:17:01.780539+00:00`. 최종 읽기 전용 재조회는 [별도 결과](final-source-recheck.json). 카드·챔피언·태그·타워 콘텐츠 변경 없음.
- 카드 SHA256: `1a6d2f98704adb83c08895e07f2c091980ae3a1245b01a0ed7205b00ba31b273`.
- 챔피언 SHA256: `b967e64ed9e920af41ade741a10bf06b40d949d7fd210d651b706a42c0459ff3`.

사용자가 허용한 해당 계정의 일반 로그인 1회만 수행했다. 이 로그인에는 기존 서버의 세션 생성·초기 컬렉션 처리 부수 효과가 있다. 그 외 운영 요청은 GET만 사용했다. 운영 카드·챔피언·타워·보상·재화 데이터를 수정하거나 관리 기능을 호출하지 않았다. 인증정보는 환경 시크릿과 저장소 밖의 비공개 임시 쿠키 파일에서만 사용했다.

## B. 구현 결과

| 대상 | 이전 문제 | 수정 후 실제 동작 | 근거 |
|---|---|---|---|
| 아비터 | 과거 기계/여러 영역 침묵 효과를 상속 | 상대 필드의 비용≤3 선수 1장을 기존 seeded RNG로 침묵 | 실제 카드 사용, 비용 필터, 대상 없음, RNG 직렬화, 아머 보존 |
| 카스토 | 최신 액티브 미연결 및 과거 회복 반응 잔존 | 선택한 아군 선수의 현재 HP만큼 자신의 ATK 증가 | 실제 액티브/대상 선택, 사용 횟수 제한, 과거 패시브 비발동, HTTP 동기화 |
| 판도라 | 과거 HP=1 조건으로 보너스 처리 | 등장 피해 1, 실제 정확히 0 HP가 되는 피해 이벤트에서 +2/+2 | HP=1 유지/정확히 0/초과 피해를 구분한 실제 엔진 결과 |
| 좀비 데헌 | 과거 다른 리타이어에 반응하는 HP 증가 | 본인이 상대 선수를 리타이어시키면 아군 필드에 실제 좀비 생성 | 사용자가 생성 영역 확인; 직접 공격/리타이어·기존 좀비 병합·가득 찬 필드 |
| 룬스달라이트 군주 루나 | 합체 후 현재 최대 HP만큼 ATK 증가가 누락되고 문구에 없는 Rush 추가 | 합체 완료 후 실제 MAX_HP를 ATK에 추가, Taunt 우회 유지 | 실제 최대 HP 19, 합체 ATK 5에 보너스 적용 후 ATK 24, Rush 미부여, 챔피언 공격 |
| 챔피언 미니언 A | 운영 좀비와 fallback 좀비가 서로 다른 ID로 풀에 중복 | 관리자 실제 129개 ID로 생성 풀 구성; 원본 좀비가 없을 때만 fallback | 전체 풀 ID/개수, 실제 생성·비용 감소, RNG 직렬화 |
| 디 오리진 | 로드 중 관리자 텍스트를 다시 작성 | 원본 문구 보존. 기존 선수 2장당 계산 유지 | 원본 레코드 불변성, 무덤 0/2/3/6장 수치 검사 |
| SCRIPT_V1 반복/중첩 | 반복 도중 대상 선택 시 예외, 중첩 보상 선택 후 남은 스크립트 소실 | 반복 프로그램 위치·레지스터·후속 단계 직렬화; 선택 후 재개, 종료 시 중단 | 두 차례 선택, 게임 종료, 상대 가득 찬 필드 각성 보상 후 남은 반복/드로우 재개 |

아비터·카스토·판도라·좀비 데헌·룬스달라이트 군주 루나는 관리자 ID와 확인한 문구 버전에 대응하는 명시적 효과 바인딩을 추가했다. `effectId`로 작성된 구조화 효과가 우선한다. 새로운 런타임 자연어 해석기를 추가하지 않았다. 다른 문구 버전에는 이번 바인딩을 적용하지 않는다.

챔피언 판도라의 기본 문구는 “선택한 모든 선수”지만 구조화 데이터는 선수 1장이다. 사용자가 **선택한 선수 1장**으로 확인해 기존 구조화 설정을 따랐다. 관리자 텍스트를 수정하지 않았다. 퀘스트는 고유 능력으로 실제 선수 7장을 리타이어시켜 완료하고, 강화 능력·연결 토큰·중복 완료 방지를 검사했다.

신규 카드/챔피언/토큰 ID를 운영에 만들지 않았다. 다른 챔피언을 임의로 재설계하지 않았다. 확인한 미구현/오작동은 위 수정으로 해결했으나, `UNVERIFIED` 항목에 추가 문제가 없다고 주장할 수 없다.

## C. 효과별 전수표

[140개 전체 ID 표](coverage.md), [기계 판독용 결과](coverage.json). 모든 DRAFT, DISABLED, 토큰, 변신 결과를 원본 데이터에서 포함한다. 토큰의 일반 덱 사용 제한과 효과 생성/챔피언 배치를 구분했다.

A 137개, UNVERIFIED 3개. B/C/D로 남은 문제를 확정하지 않은 것은 미검증을 정상 판정했다는 뜻이 아니다. 해당 표의 A도 공통 엔진에서 확인한 효과 결과에 대한 판정이다. 특정 카드가 AI 100전에 포함되었다는 이유로 모든 조건을 정상 판정하지 않았다.

## D. 테스트 결과

| 검사 | 수행 | 통과 | 실패 | 범위·한계 |
|---|---:|---:|---:|---|
| 공통 게임 엔진 | 2,226 | 2,226 | 0 | 최신 관리자 override를 사용하는 변환/129장 실사용·턴 진행 포함. 기존 회귀 테스트의 모든 입력이 운영 데이터라는 뜻은 아님 |
| 최신 관리자 AI test runner | 2 | 2 | 0 | 아래 100전과 숨김 정보 변경 안정성 검사 |
| 최신 관리자 PvP/타워 HTTP | 2 | 2 | 0 | PGlite, 실제 앱 HTTP, 합성 로컬 사용자·덱, 실제 최신 콘텐츠 |
| 기존 타워 V2 HTTP 회귀 | 10 | 10 | 0 | 격리 PGlite 기존 fixture; 운영 타워 전 층 실전 검증과 구분 |
| **Node 테스트 합계** | **2,240** | **2,240** | **0** | 재실행·중복 집계 없음. 이 중 반복 재개 전용 3개는 공통 엔진 수에 포함 |
| 최신 데이터 AI 전투 | 100전 | 100전 | 0 | 테스트 2개에 포함; 별도 테스트 수에 더하지 않음 |
| 실제 브라우저 시나리오 | 55 | 55 | 0 | Chromium; 터치 360/375/390/412 및 데스크톱 1440. 이미지 cache 사용 |
| 리소스 HTTP GET | 151 | 151 | 0 | 익명 읽기만; HTTP 200/바이트/MIME 검사 |
| 브라우저 리소스 디코딩 | 151 | 151 | 0 | 이미지 132개 자연 크기, 오디오 19개 재생 길이 |
| 타입 검사 및 전체 빌드 | 수행 | PASS | 0 | 서버·클라이언트 공유 엔진 빌드 |

AI 100전: 실제 전체 카드 129장을 효과 풀에 사용하고, 비토큰 PUBLISHED/DRAFT 덱 카드와 사용 가능한 챔피언 10종으로 90개 챔피언 조합·6개 덱 템플릿을 실행했다. 행동 6,420회/이벤트 22,206개, 종료 100/실패·타임아웃·중단 0. 실제 `getLegalActions → executeAction`을 통과했다. 모든 카드가 모든 조합에서 사용되었다고 주장하지 않는다. [AI 상세](ai-100.md).

최신 관리자 카드 129개 각각은 실사용 또는 챔피언 보상 배치 이후 직렬화하고 실제 AI 선택으로 턴을 계속 진행했다. 이 검사는 멈춤·비정상 수치·선택 불가를 잡지만 효과별 독립 기대값 검사를 대신하지 않는다. 새 의미 검증 254개, 주문 41개, 지속 효과 13개, 특수/합체 29개, 챔피언 22개, 최신 수정 카드 9개, 반복 재개 3개는 위 공통 수에 포함한다.

PvP는 실제 HTTP 로그인(로컬 합성 계정), 대상 선택 시작/확정, 카스토 ATK 결과, 양쪽 view 동기화, 상대 손패 숨김, 잘못된 참여자/버전 거절을 확인했다. 운영 매치나 계정을 만들지 않았다. WebSocket 장시간 2인 실전 및 전 카드·챔피언 PvP는 **미실행**.

타워는 최신 전체 설정/카드 카탈로그를 오프라인 로드했고 별도 기존 V2 HTTP 회귀 10개가 통과했다. 운영의 동결된 published V2 스냅샷은 해당 관리자 설정 API가 노출하지 않아 **미확보**. 운영 버전의 실제 전 층·보스·유물 조합과 전투 후 저장은 **미실행**. 운영 타워를 켜지 않았다.

브라우저 55개는 주문 5종, 최신 아비터/판도라/카스토, 챔피언 판도라의 선수 1장 선택, 네브라 부여, 크루세이더즈 능력이다. 카스토는 실제 턴을 진행해 소환 턴 사용 불가 규칙을 지킨 뒤 액티브를 눌렀다. 대상 선택 도중 필드 폭과 `visualViewport.scale=1`을 검사했다. 물리적 Android/iOS Safari 기기 테스트는 **미실행**. [결과](browser-results.json).

4개 기존 live-only 역사 테스트 파일(`published-catalog-qa`, `published-champion-abilities-smoke`, `published-effects-qa2`, `targeted-card-fixes`)은 이 격리 스냅샷 러너에서 **미실행**했다. 운영에 쓰는 테스트로 바꾸거나 실패를 감추기 위해 assert를 제거하지 않았다. Node runner의 skipped=0과 별도 미실행 범위는 다르다.

## E. 변경 파일과 재현 방법

- `artifacts/ko-game/src/game/cards/reviewed-admin-content-20261013.ts`: 최신 5개 ID의 명시적 효과.
- `cards/published-cards.ts`: 위 바인딩 연결, 과거 중복 패시브 차단, 오리진 원문 보존.
- `champions/minion-a.ts`: 실제 토큰과 fallback 중복 제거.
- `effects/effect-engine.ts`, `types/game-state.ts`: 직렬화 가능한 반복/중첩 재개.
- `lib/game-engine/tsconfig.json`: 서버 공유 엔진 새 바인딩 포함.
- `qa/current-content-20261012.test.ts`, `qa/current-content-ai-20261012.test.ts`: 실제 관리자 스냅샷 경로 override.
- `qa/latest-admin-{revisions,card-semantics,champions,ai,spells,passives,specials}-20261013.test.ts`, `effects/script-repeat-continuation.test.ts`: 최신 콘텐츠 실사용, 의미·퀘스트·랜덤·회귀 검증.
- `lib/db/qa/latest-admin-effects-http.test.ts`: 최신 콘텐츠의 격리 HTTP 서버 검증.
- `docs/qa/current-content-browser-20261012.mjs`: 최신 스냅샷/시스템 Chromium/cache 선택과 새 브라우저 시나리오.
- `docs/qa/current-admin-resources.browser.mjs`: 실제 콘텐츠 캐시의 브라우저 디코딩.
- `scripts/qa/read-admin-content.py`: 기존 관리자 세션으로 내용 GET만 수행, 이중 읽기/해시/변경 검사. 로그인·DB 쓰기 코드 없음.
- `scripts/qa/check-content-resources.py`: 익명 GET 리소스 검사, 무인증 cache는 `.local/qa`에 저장.
- `docs/qa/export-admin-content.browser.js`: 필요 시 인증된 관리자 브라우저에서 content-only 내보내기. 쿠키/시크릿을 내보내지 않음.
- `docs/qa/snapshots/20261013-admin/*`, 이 보고서 폴더: 자격증명·개인정보가 없는 데이터와 실행 근거.

저장소 루트, Node 24, pinned pnpm 환경에서:

```sh
export KO_QA_ADMIN_SNAPSHOT_DIR=docs/qa/snapshots/20261013-admin
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none artifacts/ko-game/src/game/qa/latest-admin-revisions-20261013.test.ts artifacts/ko-game/src/game/qa/latest-admin-card-semantics-20261013.test.ts artifacts/ko-game/src/game/qa/latest-admin-champions-20261013.test.ts artifacts/ko-game/src/game/effects/script-repeat-continuation.test.ts artifacts/ko-game/src/game/qa/latest-admin-spells-20261013.test.ts artifacts/ko-game/src/game/qa/latest-admin-passives-20261013.test.ts artifacts/ko-game/src/game/qa/latest-admin-specials-20261013.test.ts
KO_QA_ADMIN_AI_REPORT=/tmp/ko-admin-ai.md node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none artifacts/ko-game/src/game/qa/latest-admin-ai-20261013.test.ts
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none lib/db/qa/latest-admin-effects-http.test.ts
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none lib/db/qa/tower-v2-http.test.ts
pnpm run build
python3 scripts/qa/check-content-resources.py --snapshot "$KO_QA_ADMIN_SNAPSHOT_DIR"
KO_QA_RESOURCE_CACHE=.local/qa/current-admin-resources node docs/qa/current-content-browser-20261012.mjs
node docs/qa/current-admin-resources.browser.mjs
```

브라우저 명령은 로컬 Vite 서버와 Playwright/Chromium이 필요하다. 클라우드에서는 `KO_QA_PLAYWRIGHT=/workspace/cloud-setup/browser-tools/node_modules/playwright/index.mjs`, `KO_QA_CHROME_EXECUTABLE=/usr/bin/chromium`을 사용했다. 운영 계정은 격리 테스트에 필요하지 않다. HTTP 테스트는 DATABASE_URL을 사용하지 않는 로컬 주소로 설정하고 in-memory PGlite ORM으로 교체한 다음 앱을 로드한다.

## F. 남은 문제와 권장 해결

1. `coverage.json`의 3개 UNVERIFIED는 독세아·아포스틸·퀘스쳔다. 손패·필드·덱 및 대상 필터의 실제 결과는 통과했다. “어디에 있든”에 묘지가 포함되는지 사용자에게 질문했다. 기존 엔진은 묘지 강화 금지·원래 수치 초기화 규칙을 적용한다. 답변 없이 이 규칙을 변경하거나 세 카드를 완전 정상 판정하지 않는다.
2. 타워 동결 운영 버전, 전 층 저장, 모든 보스·유물 상호작용, 전체 PvP/WebSocket, 실제 모바일 기기 검증은 위 미실행 범위로 남는다. 운영에 테스트 데이터를 넣어 해결하지 않는다.
3. 효과 문구와 구현 연결은 `관리자 레코드 ID/구조화 효과 → cardRecordToDefinition/championRecordToDefinition → 공유 엔진 이벤트 → 서버 executeAction/직렬화 → 클라이언트 state view`다. 텍스트만 바뀌어도 코드가 자동으로 모든 새 규칙을 만드는 구조가 아니다. 기존 코드에는 예전 텍스트 호환 규칙도 남아 있다. 이번 작업에서 새 자연어 분석기를 도입하거나 관리자 편집 저장 방식을 변경하지 않았다.
4. 향후 최신 버전 확보는 기존 시크릿/읽기 전용 세션으로 content-only GET → 이중 읽기/해시 → 격리 PostgreSQL/PGlite 또는 파일 fixture → 카드별 기대값 검사 → 최종 재조회 순서가 안전하다. 세션이 만료되면 이미 허용한 해당 계정의 로그인 범위만 사용하고 권한을 우회하지 않는다. 운영 service-role 키는 필요 없다.
5. 운영 리소스는 `/api/storage/objects/...` 경로로 외부 저장소에서 프록시된다. 실제 151개 GET과 브라우저 디코딩은 성공했다. 테스트 환경에서는 읽기 전용 다운로드/cache 또는 같은 공개 프록시의 mock route를 쓰면 운영 bucket 쓰기·삭제 없이 일러스트를 확인할 수 있다. URL 존재만으로 이미지 정상 표시를 판정하지 않는다. [HTTP 근거](resources-http.json), [디코딩 근거](resources-browser.json).
6. 테스트 전용 DB는 synthetic 사용자/덱/매치만 만든다. 운영 계정·구매·보상·재화를 복제하지 않는다. 스냅샷과 인증 쿠키는 별개로 관리하고, 쿠키·암호·DB 키를 Git에 저장하지 않는다.

## G. GitHub 작업

기준 저장소는 `jokingluigi/KO-CARD-GAME`, main의 정상 게임 커밋 `271434f4e59cabda7b5e3b5c9cdaedc3d6ff7729`. 실패한 리마스터 브랜치를 기준으로 하지 않았다. 작업 브랜치 `audit/latest-admin-effects-20261013`에 저장하고 [Draft PR #50](https://github.com/jokingluigi/KO-CARD-GAME/pull/50)으로 제출했다. main 푸시·머지·Render 배포는 수행하지 않는다. 남은 검증 때문에 전수 완료로 표시하지 않는다.

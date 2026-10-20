# 스킨 · 이미지 이모티콘 구현 및 검증 (2026-10-19)

별도 브랜치 `feat/cosmetics-and-image-emotes`의 검토용 구현이다. main 병합, Render 배포, 운영 DB 마이그레이션과 운영 Storage 업로드는 수행하지 않았다.

## 구현

- 관리자 `/admin/cosmetics`: 챔피언 스킨, 일반 선수 스킨, 카드 뒷면, 이미지 이모티콘 등록·수정·비활성화. 기존 DB 대상 검색·선택, PNG/WebP/JPEG 직접 업로드·검증·미리보기. 닉네임/계정 ID 검색, 지급·회수 및 보유 확인.
- 플레이어 `/cosmetics`: 보유 아이템 검색, 네 가지 탭, 실제 카드 프레임 미리보기, 대상별 장착·기본 외형 복원, 중복 없는 이모티콘 네 슬롯 이동·해제. 메인 메뉴에 ‘꾸미기’ 추가.
- PvP: 서버가 경기 시작 시 두 계정의 소유·활성 장착을 조회하여 별도 `serializedSnapshot.cosmetics`에 고정한다. 양쪽 클라이언트와 재접속에 같은 값이 전달된다. 전투 액션마다 이미지를 다시 보내거나 DB를 조회하지 않는다.
- 드래프트 PvP/AI도 같은 외형과 이모티콘을 사용한다. 이 모드는 기존 HTTP 폴링을 유지하고, 생성/참가 시점부터 한 매치로 보아 그때 장착을 스냅샷에 고정한다. 이미지 전송은 별도 API이고 AI 진행·턴 타이머·heartbeat를 실행하지 않는다. 변경되지 않은 전투 버전에서도 이미지 이벤트를 전달하며 재전송/역순 응답은 중복 표시하지 않는다.
- 선수 스킨은 **최종 definitionId + 현재 조종 플레이어의 실제 상태 ID**로 선택한다. 소유권 이전 시 새 조종자의 스킨을 사용한다. 화면 좌우나 원래 소환자를 추측하지 않는다. 토큰/챔피언 토큰/주문에는 스킨 등록을 허용하지 않는다.
- 챔피언 일러스트·전투 초상화·VS·각성은 각각 선택 이미지 슬롯이다. 등록하지 않은 슬롯은 해당 원본 이미지로 돌아간다. 원본 카드/챔피언과 전투 상태를 수정하지 않는다.
- 이미지 이모티콘은 별도 WebSocket 메시지다. 참가자·주 연결·고정 장착 슬롯을 서버에서 검사하고 두 화면으로 전송한다. 800ms 전송 간격, 최근 128개 요청 ID 중복 제거, 플레이어당 한 이미지, 약 2초 후 제거. 턴당 제한은 없고 기존 챔피언 감정표현 정책을 변경하지 않는다. 상대 이미지 숨기기는 로컬 설정이다.
- AI는 인증 API에서 읽은 장착을 경기 시작 전에 고정하고 같은 렌더러를 사용한다. 테스트/타워의 공통 뷰는 경기 ID별로 자신의 장착을 한 번 읽고 기본 외형으로 실패 복구한다. 타워 판정·진행·보상 저장은 변경하지 않았다.
- 카드·초상화·뒷면·인트로·상세 일러스트에 이미지 실패 복구를 연결했다. 꾸미기 조회가 실패하거나 1.5초를 넘으면 PvP 시작은 기본 외형으로 계속된다. 이미지 다운로드는 게임 준비 조건이 아니다.

## DB와 보안

추가 마이그레이션: `lib/db/migrations/0053_cosmetics.sql`.

| 테이블 | 역할 |
|---|---|
| `cosmetic_items` | 네 유형, 대상 ID, 선택 이미지 슬롯 JSON, 활성·정렬·변경 시각 |
| `user_cosmetics` | `(user_id, cosmetic_id)` 유일 소유권, 획득 시각·출처 |
| `user_equipped_cosmetics` | `(user_id, slot)` 장착. `champion:<id>`, `card:<id>`, `back`, `emote:1..4` |
| `cosmetic_audit` | 관리자 지급·회수 작업 기록 |

장착은 소유권 복합 FK를 참조하므로 미보유 장착을 DB에서도 차단한다. 회수 시 장착은 FK로 함께 제거된다. 사용자/아이템 조합 유니크 제약이 중복 이모티콘 장착을 막는다. 장착·회수·대상 변경은 같은 트랜잭션 잠금 아래 처리한다. 대상/유형 변경 시 기존 장착을 해제하고 소유권은 보존한다. 비활성은 신규 지급·장착을 차단하고 다음 경기에서 기본 외형을 사용한다.

기존 인증은 Supabase Auth의 `auth.uid()`가 아닌 서버 세션이다. 네 테이블에 RLS를 켜고 anon/authenticated 직접 정책을 열지 않았다. Express의 대소문자 구분 없는 라우팅에도 인증·관리자 검사가 동일하게 적용되도록 확인했다. 사용자 소유/장착은 인증 서버의 자기 계정 API로만 처리하고, 지급·회수·업로드는 서버 ADMIN 검사 후 처리한다. 상대에게는 경기 좌석별 외형만 보내며 이메일, 계정 소유 목록, 상대 손패/덱 정의는 보내지 않는다.

새 업로드는 기존 Storage 제공자의 **별도 `uploads/cosmetics/` 경로**를 사용한다. 최대 5MB, 확장자·MIME·실제 디코딩·픽셀 제한을 기존 검증기로 확인한다. GIF/SVG는 업로드 대상에서 제외했다. 등록·수정 저장에서도 전용 Storage 경로의 실제 파일을 다시 검사하므로 업로드 완료 단계를 생략해 위장 파일을 등록할 수 없다. 외부 URL 직접 등록은 지원하지 않는다. 이미지 교체 시 원본과 과거 이미지 파일을 삭제하지 않아 진행 중 경기의 고정 URL을 보존한다. 미저장 업로드와 과거 버전의 자동 삭제는 이번에 추가하지 않았다.

기존 팩용 `card_skin_definitions` / `user_card_skin_collections`와 기존 상점·팩 지급은 그대로 보존한다. 신규 테이블로 임의 복사·자동 지급하지 않는다. 새 꾸미기는 이번 관리자 메뉴에서 명시적으로 등록·지급한다.

### 조회·쓰기 비용

- PvP 시작: 꾸미기 장착 조인 SELECT **참가자당 한 번**. 이후 외형/이모티콘 표시에는 DB 접근 없음.
- 관리자 카탈로그: 세 SELECT(아이템/선수 대상/챔피언 대상). 사용자 인벤토리: 2~4 SELECT(보유/장착/해당 대상).
- 장착은 소유·대상 검사와 삭제/upsert를 묶는 트랜잭션이다. 슬롯 이동 시 동일 아이템을 두 곳에 남기지 않는다.
- 지급/회수당 소유 변경 한 번과 감사 로그 한 번. 재지급은 유니크 제약으로 소유 행이 늘지 않는다.
- 드래프트 이미지 전송은 참가자 ID와 최대 네 이모티콘만 읽는 SELECT 한 번을 사용한다. 최근 정상 전송의 중복/빈도 제한은 이 조회 전에도 검사한다. 기존 폴링에 이벤트를 싣고 추가 주기나 이미지 DB 쓰기를 만들지 않는다.
- 새 전투 이벤트 로그·매 공격 INSERT·매 프레임 조회는 없다. 기존 매치 스냅샷에 외형 메타데이터만 추가된다.
- 위 수치는 구현 경로의 쿼리 수이며 운영 규모의 부하 테스트 결과가 아니다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| 전체 워크스페이스 타입 검사 및 프런트/API 빌드 | 통과 |
| 새 격리 DB·실제 HTTP·WebSocket 통합 테스트 | **14 통과 / 0 실패 / 0 건너뜀** |
| 기존 게임 엔진 | **2,685 통과 / 0 실패 / 0 건너뜀** |
| 기존 사용 통계 DB/API 회귀 | **35 통과** |
| 기존 타워 v2 HTTP 회귀 | **11 통과** |
| 기존 인증·startup migration·온라인 액션/비공개 상태 회귀 | **28 통과** |
| 관리자 내비게이션·기존 대시보드 경로 | **4 통과** |
| 일반 사용자 드래프트 접근·권한 회귀 | **10 통과** |
| 드래프트 HTTP 및 꾸미기 통합 | **12 통과**, 기존 선택·보상 회귀 포함, 이미지 전송 후 전투 상태·버전 동일 |
| 드래프트 실제 두 브라우저 | **4개 시나리오 통과**, 스킨·서로 다른 뒷면·양방향 이미지·새로고침 고정 외형 |
| 실제 두 브라우저·AI·관리자·장착 검증 | **8개 시나리오 통과**, page error 0 |
| 공격·리타이어·렌더링 오류 회귀 | 모바일/데스크톱 × 정상/WAAPI 실패, **4 통과** |
| 모바일 공통 전투 조작 회귀 | 360/375/390/412px, 소환·드로우·공격·고유/액티브·퀘스트·이전 감정표현·로그·묘지·턴 종료·회전 통과 |
| 덱 편집 터치 회귀 | 320/390/430px 모바일 및 1440px 데스크톱 **4 통과**, 제거 버튼이 정보창을 열지 않음 |
| 타워 실제 모바일 브라우저 회귀 | 390×844에서 선택→소환→공격→KO 연출→결과→카드 보상→25장 덱 교체 통과, 페이지 오류 0 / 가로 넘침 없음 |
| 별도 PostgreSQL 17 | SQL 적용·재적용, 회수 cascade, 실패 트랜잭션 롤백 후 테이블 0, COMMIT 후 다른 연결에서 장착 유지 확인 |

모바일은 **Chromium 터치 에뮬레이션**이다. 메뉴·관리자는 360×740 / 375×812 / 390×844 / 412×915, 실제 PvP·AI 외형은 390×844, 관리자 데스크톱은 1440×1000에서 확인했다. 물리 스마트폰 검사는 미실행이다.

통합 검사는 실제 API 인증, 네 유형 등록, 실제 Supabase Storage 어댑터와 로컬 HTTP 저장소의 서명 PUT/PNG 검증, 재지급, 회수, 장착 슬롯 이동, 로그아웃/로그인, 실제 서버 `startOnlineMatch`와 `applyMatchAction`, 두 실제 WebSocket 연결, 런타임 캐시 제거/DB 복구를 통과한다. DB는 PGlite의 PostgreSQL 엔진 및 별도 네이티브 PostgreSQL이며 **운영 Supabase가 아니다**.

메인 메뉴의 온라인/AI 주 버튼과 기존 관리자 대시보드 경로도 보존했다. 브라우저 검사는 실제 관리자 화면의 파일 선택→업로드→저장→지급→회수까지 실행한다. A는 스킨, B는 기본 외형을 쓰고 서로 다른 뒷면·이모티콘을 사용한다. A 선수 스킨을 B 화면에서 확인하고, 각 상대 손패 뒷면이 해당 소유자의 뒷면과 일치하는지 검사한다. 이미지 다운로드 강제 실패, 재접속 후 보드 보존과 상대 숨기기도 검사한다. 테스트 이미지의 단색은 로컬 검증 리소스이며 신규 판매 콘텐츠가 아니다.

360px 회귀에서 새 헤더가 과거 `div:first-child` 모바일 규칙을 타고 카드 터치 공간을 줄이는 문제를 발견했다. 헤더 구조와 간격을 고쳐 기존 88px 초상화 안에 44px 버튼을 배치했다. 모바일 회귀의 CSS 로딩도 새 shared renderer CSS 청크를 포함해 실제 빌드 스타일을 검사하도록 보완했다. 검증 assertion을 제거하거나 기준을 완화하지 않았다.

### 미실행 및 운영 전 확인

- 운영 Supabase에 실제 업로드/지급/마이그레이션은 하지 않았다. 기존 `STORAGE_PROVIDER=supabase`, Storage URL·서버 전용 키·버킷 설정을 그대로 재사용한다. 새 비밀키를 코드에 넣지 않는다. 승인 후 스테이징/운영의 버킷 정책과 서명 업로드 CORS를 확인해야 한다.
- 엔진 수치는 기존 `current-card-engine.mjs` 러너의 지원 대상이다. 그 러너가 원래 제외하는 과거 운영 카탈로그 전용 4개 suite는 이번에도 미실행이며, 최신 운영 카드 효과 전수 검증을 뜻하지 않는다.
- 대규모 이용자 부하, 물리 스마트폰, 모든 카드 효과 조합에 대한 새 스킨별 수동 플레이는 미실행이다. 효과는 변경하지 않았으며 기존 2,685개 엔진 회귀를 실행했다.
- 타워의 기존 서버 및 모바일 전투·보상 브라우저 회귀는 통과했다. **타워에서 꾸미기를 장착한 별도 브라우저 전투 및 타워 재개 시 외형 고정 검사는 미실행**이다. PvP 재접속과 서버 복구는 확인했다.
- 별도 관전/전체 리플레이 UI는 새로 만들지 않았다. 저장된 PvP 외형 스냅샷은 복구에 재사용한다.

## API 계약

모든 경로는 `/api` 아래에 있고 기존 세션 인증을 사용한다.

| 경로 | 용도 |
|---|---|
| `GET /cosmetics` | 자신의 보유·활성 장착 및 미리보기 대상 정보 |
| `PUT /cosmetics/equipment` | `{slot, cosmeticId}`. `cosmeticId: null`은 해당 슬롯 해제 |
| `GET /admin/cosmetics` | 관리자 아이템 목록과 선택 가능한 원본 카드/챔피언 |
| `POST /admin/cosmetics/items` | 등록 |
| `PATCH /admin/cosmetics/items/:id` | 전체 편집 폼 저장(활성 상태 포함) |
| `GET /admin/cosmetics/users?q=...` | 닉네임/ID 검색, 30개 제한 |
| `GET /admin/cosmetics/users/:id` | 선택 계정 보유·장착 조회 |
| `POST /admin/cosmetics/users/:id/grants` | `{cosmeticId, action: "GRANT" 또는 "REVOKE"}` |
| `POST /admin/cosmetics/uploads` | `{name,size,contentType}` → 서명 PUT 주소 |
| `POST /draft/sessions/:id/image-emotes` | `{requestId,slot}`. 참가자 검증 후 드래프트 전용 표시 이벤트만 전달 |
| `POST /admin/cosmetics/uploads/complete` | `{objectPath,contentType}` → 실제 검증 후 표시 URL |

## 재실행

저장소 루트, Node 24 및 `pnpm install --frozen-lockfile` 이후:

```sh
pnpm run build
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none lib/db/qa/cosmetics.test.ts
KO_QA_PLAYWRIGHT=/path/to/playwright/index.mjs node docs/qa/cosmetics-browser-runner.mjs
KO_COSMETICS_DRAFT=1 KO_QA_PLAYWRIGHT=/path/to/playwright/index.mjs node docs/qa/cosmetics-browser-runner.mjs
node docs/qa/current-card-engine.mjs
```

브라우저 러너는 로컬 임시 DB/API/WebSocket과 Vite를 띄운 뒤 종료한다. `KO_COSMETICS_DRAFT=1`은 별도 드래프트 HTTP fixture와 두 브라우저를 검사한다(Vite 5177, API는 임시 포트). 기본 포트 5187(API)/5176(Vite)는 `KO_COSMETICS_FIXTURE_PORT`, `KO_COSMETICS_FRONTEND_PORT`로 바꿀 수 있다. Playwright Chromium이 필요하며 시스템 Chromium 또는 설치된 Playwright 브라우저를 사용한다. QA는 루프백 호스트만 허용한다. 로컬 세션·테스트 비밀번호가 포함된 `qa-results/cosmetics/fixture.json`은 Git에 제출하지 않는다.

### 배포·복구

현재는 검토 단계다. 향후 승인된 배포에서 기존 startup installer가 0053을 트랜잭션으로 추가한다. 기존 테이블/행을 삭제하거나 카드 콘텐츠를 재생성하지 않는다. 실패하면 전체 DDL이 롤백된다. 배포 후 애플리케이션을 이전 버전으로 되돌려도 신규 테이블은 보존할 수 있고, 이전 코드는 선택 외형 필드 없이 계속 동작한다. 복구를 위해 운영 소유권 테이블을 삭제하지 않는다.

## 실제 렌더링 캡처

[관리자 데스크톱](admin-desktop.png) · [관리자 모바일](admin-mobile.png) · [플레이어 장착](player-emotes.png) · [PvP A](pvp-a.png) · [PvP B](pvp-b.png) · [상대 이모티콘](pvp-emote.png) · [AI](ai.png) · [카드 정보](card-info.png) · [드래프트 A](draft-a.png) · [드래프트 B](draft-b.png) · [드래프트 이모티콘](draft-emote.png)

## 변경 파일 역할

- `lib/cosmetics/`: 순수 외형 타입·이미지 선택·URL 검증. 게임 엔진과 독립적이다.
- `lib/db/src/schema/cosmetics.ts`, `migrations/0053_cosmetics.sql`: 추가 테이블·유니크/FK·RLS.
- API `lib/cosmetics.ts`, `routes/cosmetics.ts`: 장착 조회/검사, 관리자 카탈로그·지급·회수·업로드.
- API `object-storage.ts`, `routes/storage.ts`, `routes/index.ts`, `startup-schema.ts`: 기존 Storage·라우터·마이그레이션 연결.
- API `lib/cosmetic-emotes.ts`, `lib/draft-cosmetics.ts`, 기존 `draft-service.ts`/드래프트 라우터·클라이언트: 공통 빈도/중복 제어, 드래프트 외형 보존과 독립 표시 채널.
- API `online/{service,protocol,client-message-parser,websocket}.ts`: 외형 스냅샷과 독립 이모티콘 통신.
- 프런트 `pages/cosmetics.tsx`, `admin-cosmetics.tsx`, `cosmetic-preview.tsx`, `cosmetics-client.ts`, `cosmetics.css`: 등록·보유·장착 UI/API.
- `cosmetic-battle.tsx`, `game-state-preview.tsx`, `card-renderer.tsx`, `card-artwork.tsx`, 카드 연출/상세 컴포넌트: 외형만 해석하고 실패 복구.
- 프런트 `online-match.tsx`, `online-lobby-client.ts`, `home.tsx`, `ai-match-opening.ts`, `online-match-intro.tsx`: PvP/AI와 인트로 연결.
- `App.tsx`, `main-menu.tsx`, `admin.tsx`, `admin-navigation.ts`: 메뉴·경로 추가.
- workspace manifests/tsconfig/lock: 내부 공유 패키지 연결. 외부 런타임 SDK를 새로 추가하지 않았다.
- `lib/db/qa/cosmetics.test.ts`, `docs/qa/cosmetics-browser*.mjs`, 두 모바일 회귀 러너, GitHub workflow: 자동 검증과 재현.

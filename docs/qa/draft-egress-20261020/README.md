# Supabase Shared Pooler Egress — 조사와 수정 (2026-10-20 UTC)

**변화가 없는 드래프트도 서버와 플레이어가 매초 큰 세션 JSON을 다시 읽던 구조가 핵심 원인이다.** 로컬에서 같은 스냅샷·상태로 재현하고 수정했다. 운영 DB/Storage 접속·데이터 삭제·초기화·스키마 변경·배포는 하지 않았다.

대상 저장소 `jokingluigi/KO-CARD-GAME`, 기준 main `5b3e547` (PR #58), 별도 브랜치 `fix/draft-pooler-egress`. 꾸미기 PR #59와 완성 덱 PR #60은 별도 브랜치에 그대로 보존했다. 이 긴급 수정은 현재 main에 독립적으로 검토할 수 있다.

## 쉽게 설명하면

카드게임의 화면이 바뀌었는지 확인할 때, 예전에는 작은 ‘변경 없음’ 답을 받는 대신 카드 도감과 전투 기록을 함께 다시 꺼내 읽었다. 방 하나에 플레이어 두 명이 있으면 두 화면의 1초 폴링에 서버의 1초 워커까지 겹친다. Supabase → API 서버의 이 반복 전송이 Shared Pooler Egress에 쌓인다. 브라우저에 새 일러스트를 보여주지 않아도 발생한다.

이제 실제 상태가 바뀔 때 전체 전투 상태를 전송하고, 같은 버전이면 작은 연결 확인만 돌려준다. 필수 잠금을 빼서 수치를 낮춘 방식이 아니다. 행동/시간 초과/버전 변경/종료/복구 때는 기존 처리로 돌아가며 heartbeat에도 방별 advisory lock과 DB 행 잠금을 유지한다.

## 확인한 호출 경로

| 쿼리 | 기존 호출 경로와 빈도 | 반환/전송 특성 |
|---|---|---|
| `draft_settings` | `draftSettings()` ← `enabled()` ← 거의 모든 `mutateDraft`; 워커도 tick마다 호출하고 각 방의 mutate에서 재호출. 시작 시 enabled + settings로 중복 조회. availability/관리자 설정/모드 진입도 호출 | 설정 한 행. 스냅샷보다 작지만 호출 수가 누적됨 |
| `draft_sessions` 전체 | `mutateDraft()`의 `.select().for('update')`; GET 세션·battle·resources·rewards 및 명령/행동이 같은 경로. 워커도 매초 모든 참가 방에 호출 | state + snapshot + 통계 메타데이터 전체. 큰 JSON의 반복 전송 |
| `pg_advisory_xact_lock` | 시작/자동 매칭의 전역 잠금, mutate의 방별 잠금 | 반환값은 작다. 호출량은 방 처리 반복의 흔적이며 대용량 전송의 직접 원인은 아님 |
| `draft_participants` 전체 | `tickDraftSessions()`가 매초 전체 조회하고 JS Set으로 sessionId 중복 제거 | 두 참가자가 있으면 같은 방 정보 두 행을 받아 한 번 처리 |
| 참가자별 조회 | `currentDraft`, 시작 시 기존 참가 여부, JOIN 시 확인 | 이미 userId 조건이 있음. currentDraft는 필요한 sessionId만 투영하도록 수정 |
| 타워 JSON 참조 검색 | 관리자 이미지 업로드 URL 생성 시 `cleanupAbandonedImages()` → 오래된 업로드 각각 `removeImageIfUnreferenced()` → `strpos(data/snapshot::text, assetId)` | DB 안에서 JSON을 검색하지만 네트워크 반환은 boolean 하나. CPU/IO 부담과 Egress를 구분해야 함 |

일반 `/api/draft`와 `/api/admin/draft`는 동일 라우터를 사용한다. `AdminDraftManager`는 선택/대기 화면에서 1초 폴링, `DraftBattleClient`는 전투에서 1초 폴링한다. 기존 두 클라이언트 모두 느린 요청의 중첩을 막는 guard가 있었다. 메인 메뉴 availability는 마운트 시 조회이며 1초 타이머는 아니다. stale 선택의 `draftCommand` 재시도는 조건 확인 후 1회이며 무한 루프가 아니다.

추가로 전투 클라이언트는 종료 결과를 받았어도 unmount/UNSUBSCRIBE 전까지 타이머가 남았다. 서버가 계속 실패할 때도 매초 재요청했다. 둘 다 수정했다. 워커는 기존 running guard가 있었으며, 추가로 프로세스당 중복 start를 방지했다. 실제 운영에 여러 워커가 중복 실행됐다는 증거를 확보한 것은 아니다.

다른 런타임 조회도 조사했다. 사용 통계 워커는 30초마다 **종료됐고 미집계인** draft_sessions의 state/usage_start를 최대 20개 읽는다. snapshot 전체 조회가 아니며 처리 후 기록하는 별도 경로다. 그 집계/보상 의미는 변경하지 않았다. 테이블 생성/전역 설정 초기 INSERT는 기존 시작 마이그레이션에 있지만 시작 시 실행이므로, 정상적인 단일 기동에서 초당 반복의 원인이 아니다.

## snapshot은 어디로 전송됐나

수정 전에는 DB에서 `.select()`로 `draft_sessions.snapshot`을 매번 통째로 API에 전송했다. 정적인 카드/챔피언/미디어/설정과 큰 전투 state가 같이 왔다. 테스트용 보관 카탈로그를 넣은 방에서 snapshot은 **269,643바이트**, 전투 state는 **307,096바이트**였다.

이것과 ‘브라우저에 snapshot이라는 필드가 그대로 노출되는가’는 다르다. 선택 화면은 viewer용 카드 목록/자기 선택을 만들고, battle은 숨겨진 손패/덱을 가린 전투 상태·이벤트를 만든다. raw snapshot 필드를 그대로 반환하는 형태는 아니지만, battle의 카드 풀과 전투 데이터도 크다. resources는 필요 시 전체 리소스를 읽는다. **DB→API 전송량과 API→브라우저 응답량을 같은 수치로 취급하지 않았다.**

10월 8일의 저장소 이력 `4ab37de`에서도 tick의 참가자 전체 조회, 같은 mutate 경로, snapshot 전체 읽기가 확인된다. 10월 9일의 고전송을 만들 수 있는 구조가 당시에도 존재했다는 근거다. 단, 그 커밋이 그날 어느 Render 인스턴스에 배포됐는지까지 확인한 것은 아니다.

## 수정 내용

1. **설정 캐시**: 프로세스 내 1초 TTL, 동시 요청 합치기. 필요한 enabled/config만 조회한다. 관리자 PUT 설정·카드 제외·챔피언 제외 저장 커밋 후 즉시 무효화한다. 저장 중 진행 중인 옛 읽기가 캐시를 덮지 못하도록 세대 검사를 한다. 다른 프로세스/직접 DB 편집은 최대 1초의 TTL 지연이 있다. 영구적으로 설정을 캐시하거나 변경을 놓치지 않는다.
2. **고정 스냅샷 캐시**: 5분 TTL, 최대 64개/16MiB LRU. 현재 main은 세션 생성 후 snapshot을 변경하지 않는다. 인증·참가자 검사 후 읽고 호출자에게 복제한다. mutable battle/state/버전/소유권/보상은 캐시하지 않는다. 캐시 소실/재시작/초과는 DB 재조회로 복구된다.
3. **변경 없는 전투 조회**: 클라이언트가 `?version=`을 보낸다. 같은 버전이고 처리할 만료/AI 이벤트가 없으면 SQL에서 필요한 메타데이터만 투영해 `DRAFT_HEARTBEAT`를 반환한다. 각 플레이어 자신의 lastSeen만 갱신한다. row를 기다리는 사이 기한이 지나는 경우도 잠금 획득 후 시간을 다시 확인해 만료를 덮어쓰지 않는다.
4. **안전한 전체 경로 복귀**: 첫 진입·재접속·버전 변경·시간 초과·AI 행동·종료는 기존 mutate/advance/settle/sanitizer를 사용한다. 기존 방별 advisory lock과 FOR UPDATE를 유지한다. 상태 변경은 기존 버전 검증과 requestId 멱등 처리를 그대로 통과한다. heartbeat가 화면 상태/공격 연출을 초기화하지 않는다.
5. **워커 조회 축소**: 참가자→세션을 DB에서 조인하고 처리할 일이 있는 방의 sessionId/actorId만 DISTINCT로 받는다. WAITING, 아직 기한이 오지 않은 선택, 사람 차례의 변화 없는 전투를 서버로 통째로 가져오지 않는다. 만료 선택·턴 기한·연결 종료·AI 멀리건/차례·종료 보상 정리는 계속 처리한다. 워커 1초 주기는 유지한다.
6. **불필요한 쓰기 축소**: 기존 조건에서는 heartbeat만 와도 전투 state를 매번 다시 쓰고, 작은 JSON 갱신의 else 분기는 도달하지 못했다. 이제 실제 게임 변경만 전체 state/버전을 쓰며, 연결 확인은 `jsonb_set`으로 자기 lastSeen만 갱신한다. WAITING은 매칭 신선도용 updatedAt만 갱신한다. 접속 만료 60초와 기존 기한은 바꾸지 않았다.
7. **매칭/초대 조회**: 자동 매칭은 DB에서 유효한 PVP·빈 상대 좌석·최근 대기방으로 필터하고 가장 오래된 한 방만 잠근다. 모든 대기방 snapshot을 받지 않는다. 초대 조회는 id/버전/phase만 읽는다.
8. **클라이언트 종료/재시도**: 정상 동기화 간격 1초 유지. 경기 종료 시 타이머 중지, 연속 실패 때 2/4/8…최대 30초 backoff, 명시적 재연결은 대기를 건너뛰고 전체 상태를 요청한다. 행동 중 새 GET을 시작하지 않으며 기존 revision guard를 유지한다.
9. **이미지 정리**: 업로드마다 정리하지 않고 진행 중 sweep을 공유하고 5분 간격으로 제한한다. 실패는 30초 후 다음 업로드에서 재시도 가능하다. 오래된 경로를 중복 제거하고 동시 검사를 4개로 제한한다. 카드/챔피언/상점/프레임이 참조하면 타워 JSON 검색 전에 중단한다. 타워-only 참조를 포함한 기존 안전 검사는 보존하고, ‘참조 없음’ 결과는 캐시하지 않았다. 2시간 이상 된 임시 파일을 대상으로 하던 기존 정책은 유지한다.

타워 JSON을 임의 키 몇 개로만 검사하도록 줄이지 않았다. 그렇게 하면 스냅샷 안의 참조를 놓쳐 실제 이미지를 지울 수 있다. 새 인덱스·참조 테이블·스키마 변경 없이 호출량을 줄이는 쪽을 선택했다.

## 전후 측정 (60초, 동일 입력)

`draft-egress-benchmark.ts`는 실제 Drizzle/PGlite SQL 실행의 반환 행과 트랜잭션 안의 조회까지 계측한다. 2026-10-14 보관 카드 165개/챔피언 11개에 기존 QA 정의를 더한 격리 데이터다. 최신 운영 콘텐츠라고 가정하지 않았다. before/after의 snapshot SHA256과 state 크기가 일치한다. 실제 생산 인증정보는 사용하지 않았다.

바이트는 **DB 반환 행을 UTF-8로 직렬화한 페이로드**다. PostgreSQL 메시지/TLS/풀러 프레이밍 및 네트워크 압축 차이는 포함하지 않는다. Supabase 청구값 자체가 아니며 아래 쿼리 합계는 드래프트 서비스 내부 경로로, HTTP 인증 조회는 제외한다.

| 60초 시나리오 | DB 반환량 전 | 후 | 감소 | 쿼리 전→후 |
|---|---:|---:|---:|---:|
| 변화 없는 PVP 대기방, 사용자 1명 + 서버 워커 | 32,520,826 B (32.52 MB) | 약 0.33 MB | 약 98.99% | 540→301 |
| 변화 없는 PVP 전투방, 사용자 2명 + 서버 워커 | 104,235,395 B (104.24 MB) | 약 0.93 MB | 약 99.1% | 780→481 |

MB는 1,000,000바이트다. 정확한 수정 후 값은 [after.json](after.json)에 있다. 캐시 첫 읽기를 포함한 결과이며 실제 카드 사용/공격이 매초 발생하는 부하 시험은 아니다.

| 호출 종류 | 대기방 전→후 | 전투방 전→후 |
|---|---:|---:|
| settings SELECT | 180→60 | 240→60 |
| 방 advisory lock | 120→60 | 180→120 |
| 독립 participants 전체 SELECT | 60→0 | 60→0 |
| sessions 관련 SQL (SELECT/UPDATE/작은 워커 JOIN 포함) | 180→181 | 300→301 |
| 큰 snapshot을 읽는 횟수 | 120→1 | 180→1 |

**세션 쿼리가 전부 사라진 것이 아니다. 작은 쿼리로 바뀐 것이 핵심이다.** 워커의 60개 작은 JOIN은 위 sessions 행에 포함된다. 잠금 감소는 유휴 방의 불필요한 워커 처리를 건너뛴 결과이며, 수행 중인 방 잠금을 삭제한 결과가 아니다.

이미지 정리는 동일한 20개 업로드 요청·4개 오래된 경로(서로 다른 경로 3개, 그중 카드/타워 참조 2개)로 비교했다.

| 이미지 정리 계측 | 전→후 |
|---|---:|
| 저장소 stale 목록 조회/sweep | 20→1 |
| tower JSON 참조 쿼리 | 80→2 |
| 이 쿼리 반환 페이로드 | 1,740 B→43 B |

원본/타워 참조 이미지의 보호를 실제 API 경로에서 확인했다. 삭제 함수는 테스트 spy로 바꿔 **실제 Storage 파일을 삭제하지 않았다**. 이 수치도 왜 타워 검사가 CPU/IO 문제와 달리 GB Egress의 주범은 아닌지 보여준다.

## 운영 예상 절감량의 한계

제공된 297.4GB/250GB와 10월 9일 43.381GB는 운영 청구 자료다. Query Performance의 호출 횟수가 정확히 어느 기간인지, stats_reset 시각, 인스턴스 수, 동시 방 수, 실제 방 크기, 시간별 SQL/바이트 내역은 직접 확보하지 않았다. 따라서 그날의 43.381GB 전부를 이 코드 탓이라고 확정하거나, 운영 전체가 99% 줄어든다고 주장하지 않는다.

가정 예시: 43.381GB 중 이 테스트와 유사한 유휴 반복 트래픽이 각각 25%/50%/75%였다면, 해당 부분을 약 99% 줄일 때 일일 절감은 약 **10.7/21.5/32.2GB**다. 이는 민감도 계산이지 관측된 절감량이 아니다. 자주 행동하는 경기에서는 전체 상태 전송이 필요하고, 다른 SQL/Storage/API Egress도 남는다. 이미 누적된 청구 사용량은 소급해서 감소하지 않는다.

운영 실측에는 [읽기 전용 감사 SQL](readonly-audit.sql)을 별도 제공한다. 실제 서버에 실행하지 않았다. 운영자가 pg_stat_statements의 실제 스키마와 조회 권한을 확인해야 한다. 통계 초기화 없이 조회 기간·쿼리 수·반환 행 수·최대 20개 활성 방의 평균 JSON 크기만 확인할 수 있다. 승인 배포 후 같은 기간/같은 부하와 Shared Pooler Egress를 비교해야 운영 절감량을 확정할 수 있다.

## 검증

- 전체 타입 검사 및 API/Vite 프런트 빌드 통과.
- 기존 드래프트 + 신규 전송/만료/복구/정리/AI/워커 통합: PGlite 17개, 네이티브 PostgreSQL17 17개 통과. PGlite의 추가 성능 계측 시나리오 포함 실행은 18개 통과.
- 캐시 TTL·동시 읽기·수정 중 무효화·LRU/용량 제한·실패 복구, cleanup gate, 클라이언트 heartbeat/연출 보존/버전 갱신/통신 복구/종료 중지 및 Storage 어댑터: 16개 통과.
- 기존 엔진 2,685개, 공개 드래프트 접근 10개, 타워 HTTP 11개, 사용 통계 35개 통과.
- 서로 다른 두 계정의 **실제 Chromium 모바일 화면**(390×844)에서 전체 초기 상태→작은 heartbeat→양쪽 멀리건 변화→전체 상태 갱신→기권 종료→폴링 중단을 확인했다. page error 0. [브라우저 결과](browser-results.json).
- 정상 드래프트 동시 선택 `[200,409]`, 동일 requestId 처리, 동결 snapshot 유지, 상대 손패/덱 비공개, OFF/ON 설정 무효화, 자동 선택, 연결 종료 판정, 보상 중복 방지, 캐시 초기화 후 복구, 서버 워커의 AI 멀리건/차례 복구를 실제 엔진/DB 경로에서 실행했다.
- DB 마이그레이션 파일/원본 카드·챔피언 효과/계정·재화·보상 규칙은 변경하지 않았다.

기존 엔진 러너는 역사적 라이브 카탈로그 의존 4개 스위트를 제외한다. 포함된 AI 100회 검사는 기존 공개 fixture 회귀이며 최신 운영 카드 전수 검증이 아니다. 물리 스마트폰, 실제 Supabase 풀러/TLS 비용, 운영 Query Performance 실측, 다중 Render 인스턴스 부하/메모리, 고빈도 실제 행동의 장시간 부하 시험은 미실행이다. 실제 운영과 똑같은 효과/세션 개수로 시험했다고 주장하지 않는다.

## 재현과 파일

```sh
source /workspace/cloud-setup/env.sh
pnpm run build
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none lib/db/qa/draft-http.test.ts
KO_DRAFT_EGRESS_REPORT=/tmp/draft-egress-after.json KO_DRAFT_ASSET_REPORT=/tmp/draft-assets-after.json node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none lib/db/qa/draft-http.test.ts
node docs/qa/draft-egress-browser-runner.mjs
```

네이티브 검사는 로컬 `127.0.0.1:55432`, 사용자 agent, 관리용 테스트 DB `ko_cosmetics_qa`에서 `KO_DRAFT_EGRESS_NATIVE=1`로 실행한다. 프로세스별 `draft_egress_qa_<pid>` DB를 새로 만들고 정리한다. 임의 운영 URL을 받지 않는다. 브라우저 러너도 loopback만 허용하고 자신의 API/Vite5179만 종료한다. 로컬 테스트 쿠키를 포함한 원시 fixture는 `qa-results`에만 두고 커밋하지 않았다.

비교 baseline은 동일 QA 측정기를 유지한 채 `5b3e547`의 draft-service/admin-draft를 사용했고, 이미지 baseline은 해당 커밋의 admin.ts를 사용했다. 결과 JSON에는 실제 카드 콘텐츠/계정/키가 없고 횟수·크기·해시만 담았다. `KO_DRAFT_EGRESS_INPUT`으로 같은 격리 snapshot/state를 두 실행에 고정해 해시와 크기를 검증했다. baseline은 신규 구현 전용 검증 케이스를 실행하지 않도록 `KO_DRAFT_EGRESS_BASELINE=1`을 사용한다.

주요 변경:

- `lib/draft-service.ts`: 투영/스냅샷 캐시, 안전한 heartbeat, due-only 워커, 쓰기 축소, 매칭 투영.
- `lib/draft-due.ts`: 워커/heartbeat의 동일 만료 조건.
- `lib/draft-read-cache.ts`: TTL·용량/LRU·동시 읽기·무효화 구현.
- `routes/admin-draft.ts`: 설정 저장 후 무효화, 초대 투영, 버전 조건부 battle 조회.
- `lib/asset-cleanup-gate.ts`, `routes/admin.ts`: 중복 정리 통합과 참조 중 이미지의 빠른 보호.
- 프런트 `lib/draft-client.ts`: heartbeat 처리, 정상 1초 동기화 유지, 종료/재시도 제어.
- 기존/신규 테스트, 성능 측정기, 브라우저 러너, 전용 CI: 재현/회귀 검증.

## 적용과 기존 작업 병합 시 주의

**운영 적용은 승인 대기다.** 스키마 변경이 없어 DB 마이그레이션은 필요하지 않다. API/프런트를 함께 배포하면 최대 효과를 얻는다. 기존 프런트는 새 API에서도 전체 응답을 계속 받을 수 있고, 새 프런트도 기존 API가 version 쿼리를 무시하고 전체 응답을 주면 처리할 수 있다. 문제 시 코드만 롤백할 수 있으며 데이터 삭제/복구 작업은 필요 없다.

현재 main에서 snapshot은 불변이다. 추후 snapshot을 수정하는 새 코드가 생기면 캐시를 커밋 후 무효화해야 한다. 별도 꾸미기 PR #59는 JOIN 시 snapshot에 상대 외형을 추가하므로 **이 긴급 수정과 병합할 때 JOIN 캐시 무효화 및 heartbeat를 통한 이미지 이모티콘 전달을 함께 통합 검증해야 한다.** 이를 검증하지 않고 두 브랜치를 자동 병합/배포하지 않는다. 상점 PR #60도 그대로 별도 보존했고 이 작업으로 운영에 적용하지 않았다.

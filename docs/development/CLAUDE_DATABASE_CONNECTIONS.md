# Claude의 개발 DB·운영 데이터 연결

2026-11-18 확인. 빈 새 DB를 만들었다고 원래 게임 정보가 자동으로 들어오는 것은 아니다. Git 동기화는 DB 동기화가 아니다.

## 현재 확인된 상태

- Codex의 준비된 개발 연결은 `/workspace/cloud-setup/env.sh`가 설정하는 로컬 PostgreSQL `127.0.0.1:5432/ko_game`이다.
- 이번 조회 결과는 cards 14행, champions 3행이다. 운영 전체 데이터의 복제본이라고 확인하지 않았다.
- 별도 환경의 Claude가 같은 주소를 입력해도 Codex DB에 연결되지 않는다. 그 환경의 자기 로컬 DB에 접속한다.
- 운영 API 주소는 코드에서 `https://ko-card-game.onrender.com`으로 사용한다. 이것은 PostgreSQL 접속 문자열이 아니다. 실제 배포 서비스의 설정과 대조한다.
- 실제 운영 DATABASE_URL·읽기 전용 계정·공유 개발 DB의 외부 주소를 이 문서에는 포함하지 않았다. 연결을 실제로 검증하기 전까지 연결 완료로 보고하지 않는다.

## 권장 연결 구성

| 목적 | 연결 변수 | 사용 방식 |
| --- | --- | --- |
| 개발 서버 실행·테스트 | `DATABASE_URL` | 쓰기 가능한 별도 개발 DB |
| 운영 정보 확인 | `PROD_READONLY_DATABASE_URL` | 운영의 SELECT 전용 계정. 별도 조회 도구에서만 사용 |
| 두 AI가 같은 개발 데이터를 사용 | 공통 개발 DB의 URL을 각 환경 `DATABASE_URL`에 설정 | 외부 접속 가능한 공유 개발 PostgreSQL이 이미 있으면 사용. 새 유료 DB를 자동 생성하지 않음 |

두 개발 서버를 같은 DB에 동시에 연결하면 백그라운드 작업·데이터 수정도 공유된다. 코드 검증은 각자 DB에서 수행하고, 공유 개발 DB의 실행 서버 담당자는 하나로 정하는 구성이 권장된다. 같은 정보를 보는 데 반드시 같은 쓰기 DB가 필요한 것은 아니다. 동일한 개발용 카탈로그를 각자 DB에 넣는 방법도 가능하다.

## 1. Codex 개발 DB를 이용하는 방법

**같은 실제 머신인 경우**: 기존 PostgreSQL 접속 권한과 프로세스가 있는지 확인한 뒤 준비된 환경 설정을 사용할 수 있다. 같은 `/workspace`라는 경로만으로 같은 머신이라고 판단하지 않는다.

**별도 머신·클라우드인 경우**: 지금의 Codex 로컬 DB는 localhost 전용이며 외부 연결 주소가 없다. 다음 중 하나가 먼저 필요하다.

- 이미 존재하는 공유 개발 DB의 외부 접속 URL을 양쪽에 설정한다.
- 승인된 VPN/SSH 터널 등 사설 연결 경로를 마련한다.
- 필요한 개발용 카탈로그를 내보내고 각자 로컬 DB에 넣는다. 운영 사용자·비밀번호 해시·세션·결제·개인정보까지 통째로 복제하지 않는다.

DB 포트를 인터넷 전체에 개방하거나 trust 인증 설정을 외부 인터페이스에 적용하지 않는다. 연결 주소가 없는데 host를 임의로 바꿔 접속됐다고 하지 않는다.

## 2. 실제 운영 DB 주소 확인 및 비밀값 전달

운영 API가 Render에 있다면 대시보드에서 실제 API 서비스 → Environment → `DATABASE_URL` 설정을 확인한다. 서비스를 수정하거나 재배포할 필요는 없다. 운영 DB 제공자가 Supabase라면 프로젝트 Connect 화면의 PostgreSQL 연결 정보와 대조한다. Supabase 프로젝트 URL이나 API 키는 PostgreSQL URL을 대신하지 않는다.

Render PostgreSQL의 Internal URL은 Render 외부 환경에서 보통 사용할 수 없으므로 외부 개발 환경에는 External URL이 필요하다. Supabase는 실행 환경의 IPv4/IPv6 지원 및 제공되는 pooler 연결 방식을 확인한다. TLS 인증을 끄는 우회는 하지 않는다.

운영 소유자 계정 URL을 그대로 두 개발 서버에 넣지 않는다. 운영 조회에는 DB 관리자에게 SELECT 전용 역할을 준비받고 그 연결 정보를 `PROD_READONLY_DATABASE_URL`로 저장한다. 이 역할은 필요한 테이블·뷰만 조회할 수 있어야 하며 스키마 변경·데이터 쓰기 권한을 갖지 않아야 한다.

접속 문자열은 Claude 실행 환경의 Secrets/환경변수 설정에서 입력한다. Codex도 조회가 필요하면 Codex 환경에 같은 이름으로 별도 설정한다. Git·안내문·채팅·스크린샷·로그에는 비밀값을 넣지 않는다. 두 플랫폼의 Secrets는 자동 공유되지 않는다.

준비할 값:

```text
DATABASE_URL                  = 개발 DB 접속 문자열
PROD_READONLY_DATABASE_URL    = 운영 읽기 전용 DB 접속 문자열
```

현재 앱은 `DATABASE_URL`만 읽는다. `PROD_READONLY_DATABASE_URL`은 이 안내의 별도 조회용 이름이며, 추가한다고 앱이 자동으로 두 DB를 사용하지 않는다.

주의: `/workspace/cloud-setup/env.sh`를 source하면 DATABASE_URL이 Codex 로컬 DB로 다시 지정된다. 외부 DB를 설정했다면 실행 직전 대상이 덮어써지지 않았는지 호스트·DB 이름만 확인한다. 전체 URL은 출력하지 않는다.

## 3. 운영 읽기 전용 연결 확인

읽기 전용 계정이 환경에 설정된 뒤 Claude가 실행한다. 서버는 실행하지 않는다.

```bash
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=10000' \
psql "$PROD_READONLY_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c 'SHOW transaction_read_only;' \
  -c 'SELECT count(*) AS cards FROM public.cards;' \
  -c 'SELECT count(*) AS champions FROM public.champions;'
```

비밀번호 입력이나 접근 오류가 발생하면 보안 설정·주소·허용 네트워크·TLS를 확인한다. 성공으로 간주하지 않는다. PGOPTIONS는 이 명령의 실수 방지용이며 DB의 SELECT 전용 권한 설정을 대신하지 않는다. 개인 사용자 레코드나 전체 덤프를 로그로 출력하지 않는다.

## 4. 원래 카드·챔피언·이미지가 필요한 경우

운영 카탈로그는 공개 API `/api/cards`, `/api/champions`, `/api/game-media` 등에서도 확인할 수 있다. 공개 API는 공개 가능한 데이터만 제공하며 관리자 초안·비공개 설정·사용자 정보까지 복제하지 않는다. 실제 응답 스키마를 읽고 개발용 import를 설계한다. 빈 DB에 API JSON을 받기만 해서는 DB에 저장되지 않는다.

개발 UI 전체를 운영 API에 프록시하면 로그인·관리자 저장·매치 생성도 운영 요청이 될 수 있다. 기본 개발 프록시를 운영에 통째로 돌려서 해결하지 않는다. 운영 데이터 조회는 별도로 하고 필요한 카탈로그를 개발 DB에 복사하는 절차를 사용한다.

카드 이미지가 저장소 외부에 있으면 DB 연결만으로 표시되지 않을 수 있다. 코드는 `STORAGE_PROVIDER=supabase`일 때 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`을 요구한다. 운영 저장소 쓰기 키를 개발에 복사하는 대신, 공개 이미지 URL 또는 별도 개발용 저장소·최소 권한 접근을 구성한다. 서명 URL의 만료·인증도 확인한다.

## 5. 현재 API를 운영 DB에 직접 붙이면 안 되는 이유

`artifacts/api-server/src/index.ts`는 시작할 때 다음을 실행한다.

- `ALTER TABLE decks ...`
- `ensureApplicationStorage()`의 스키마 적용
- 조건에 따른 관리자 초기화
- 드래프트·통계·퀘스트 백그라운드 작업

따라서 읽기 전용 DB로 정상 개발 서버를 실행할 수 있다고 보장할 수 없고, 쓰기 가능한 운영 URL로 실행하면 단순 조회를 넘어 운영 변경이 일어날 수 있다. 운영용 읽기 연결은 3절처럼 별도 조회에만 사용하고 API·DB push·마이그레이션·테스트에는 개발 DB를 사용한다.

## Claude에게 전달할 지시

> 새 로컬 DB와 운영 게임 데이터가 분리돼 있음을 전제로 작업해. Codex의 localhost 주소는 별도 Claude 머신에서 공유되지 않아. 이 문서대로 개발용 DATABASE_URL과 운영 조회용 PROD_READONLY_DATABASE_URL을 구분하고 Secrets에 설정된 연결을 재사용해. 실제 주소가 없으면 임의 생성하거나 연결됐다고 하지 마. 운영 읽기 전용 계정으로 카드·챔피언 개수만 확인하고, 현재 API 서버나 테스트를 운영 DB에 실행하지 마. 실제 카드 화면이 필요하면 공개/허용된 카탈로그를 개발 DB에 넣는 절차와 이미지 경로를 확인해. 접속 비밀값을 출력하지 말고, 연결 대상 종류·접속 성공 여부·카탈로그 개수·남은 누락만 인계해줘.

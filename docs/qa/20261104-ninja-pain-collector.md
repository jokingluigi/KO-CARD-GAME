# 닌자·고통 수집가 운영 재현 및 배포 검증

2026-11-04 사용자가 수정본 운영 배포를 명시적으로 요청했다. 이전 작업의 배포 금지를 이 요청으로 해제했으며, main 병합과 운영 데이터의 수동 변경은 하지 않았다.

## 확인한 원인

지난 치명적인 등장 피해 수정은 작업 브랜치에만 있었고 운영에는 반영되지 않았다. 새로운 임의의 카드 효과를 추가해서 해결하지 않았다. 이미 수정한 공통 `DAMAGE_TAKEN` 경로를 서버와 프론트엔드에 함께 배포했다.

운영에서 제공하던 JS 엔진을 브라우저의 격리 메모리로 불러와 실제 `enterField`와 후속 효과 해석을 실행했다. API 요청은 모두 가로채 운영 계정·대전·데이터를 변경하지 않았다.

| 같은 현재 카드 정의로 실행 | 운영 구버전 | 배포 후 수정본 |
|---|---|---|
| 닌자와 분신의 등장 횟수 | 2 | 2 |
| 각각 받은 실제 피해 | 1씩, 총 2회 | 1씩, 총 2회 |
| 닌자의 묘지 이동 | 각각 1회 | 각각 1회 |
| 고통 수집가 공격력 | **1 → 1 (누락)** | **1 → 3** |

헬뻑이 아군/상대인 경우 모두 같은 결과를 확인했다. 구버전 `effect-engine-CwiLKbEL.js`와 수정본 `effect-engine-C6eFS74a.js`의 SHA-256 및 실행 결과를 보관했다. 수정본은 로컬에서 검사한 엔진 파일과 해시가 같다.

## 위마리(각성) 문구 변경

변경 후 공개 API에서 `crisis-awakening-healer` 레코드를 다시 읽었다. 현재 문구의 ‘각성 리온’을 실제 `리온(각성)`으로 연결하는 기존 호환 처리가 있어 동작을 유지한다. 카드 원본이나 성능을 다시 작성하지 않았다.

- 현재 문구, `리온(각성)` 표기, 위마리 자신의 표시 이름 변경을 각각 검사했다.
- 턴 종료 시 본체·자신·다른 아군에게 각각 실제 회복 +2, 상대에게 회복 없음.
- 리타이어 후 정확히 한 장의 `crisis-awakening-dealer` 소환. 죽은 위마리의 묘지 이동도 한 번.
- 배포된 JS에서도 본체 10→12, 위마리 1→3, 아군 1→3, 리온 소환 1회를 확인했다.

## 배포 및 검사

- 서버·프론트엔드 모두 **`d707ad23e303a3d716f63a82839c8192446e8d1d` live**. 해당 커밋에 피니셔 기반 기능과 초상화 보호막 표시도 포함된다.
- API `/api/healthz` 200. 보호막 CSS도 운영에 존재하며 로컬 검사본과 일치한다.
- 닌자 상호작용 6개, 기존 치명적인 등장 피해 5개, 위마리 문구 3개: **14개 통과**. 고통 수집가 두 장, 연속 닌자 사용, JSON 복원, 무피해 및 상대 선수 피해 제외 포함.
- 프론트엔드 타입 검사 통과. 앞선 전체 엔진·서비스·화면 검사와 빌드 결과는 [피니셔 기반 보고서](20261103-finisher-foundation.md) 참고.
- 배포 후 검증은 실제 운영 배포 파일을 격리 메모리에서 실행한 것이다. 운영 계정으로 PvP 경기를 생성한 검사 또는 실물 휴대폰 검사라고 보고하지 않는다.

## 근거

- [배포 전 실패](20261104-ninja-pain-collector/before-public-build.json)
- [배포 후 실제 엔진 및 위마리 결과](20261104-ninja-pain-collector/deployed-fixed.json)
- [서버 배포](20261104-ninja-pain-collector/api-deployment.json) / [프론트엔드 배포](20261104-ninja-pain-collector/front-deployment.json)
- [공개 에셋 확인](20261104-ninja-pain-collector/deployed-assets.json) / [14개 검사](20261104-ninja-pain-collector/final-regression.txt)

실행 코드: `ninja-pain-collector.test.ts`, `wimari-awakened-text.test.ts`, `docs/qa/ninja-pain-collector-public-build.mjs`. 공개 배포본 재검사는 `KO_ENGINE_PATH=/assets/effect-engine-C6eFS74a.js KO_EXPECT_FIXED=1 node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs docs/qa/ninja-pain-collector-public-build.mjs`.

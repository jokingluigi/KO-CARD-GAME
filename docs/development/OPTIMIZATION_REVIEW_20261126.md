# Claude 최적화 검토 및 추가 메모리 절감 패치

검토 기준은 실제 API·프런트 운영 커밋 `36c68bdebcd44cc6bccc782ce30cd6366f490f0a`다. 원래 작업 폴더의 미커밋 작업을 보존하고, 별도 `codex/optimization-review-20261126` 브랜치에서 수정했다. 운영 배포·요금제·DB는 변경하지 않았다.

## 기존 최적화의 확인 결과

Claude의 패치는 이미 다음 개선을 포함한다.

- `926382e`: 이미지 원본 다운로드 4개 제한, 변환 1개, 변환 대기 최대 6개, RSS 360MiB 초과 시 변환 중단, `MALLOC_ARENA_MAX=2`.
- `ad145a8`: 화면 크기에 맞춘 이미지 폭·srcset. 첫 요청은 원본을 먼저 보내고 WebP를 뒤에서 준비하므로, 작은 변환본의 효과는 캐시 준비 이후에 나타난다.
- `a34e8e8`, `561cb60`, `b06bdb9`: 이미지·음악 디스크 캐시, 이미지 메모리 캐시 제한, WebP 변환과 장기 브라우저 캐시, 서버의 불필요한 반복 조회 감소.
- `e4cf92e`: 음악 전송의 늦은 timeout/error로 프로세스가 종료되던 문제 처리.
- `6053a23` 이후 관련 되돌림: 연출을 유지하면서 일부 그리기 비용을 낮췄고, 측정상 이득이 없던 투명도 층 변경은 되돌렸다. 이 검토에서 모바일 렌더링 성능을 새로 실측하지는 않았다.

기존 관련 테스트 18개는 변경 전 통과했다. Render 사건에 나타난 최근 OOM 5건은 최신 메모리 보호 패치가 배포되기 전 기록이며, 최신 패치의 실패를 증명하는 수치로 사용하지 않는다. 앞선 조사에서 낮은 수준의 storage provider만 보고 최신 이미지 전달 경로를 충분히 확인하지 않은 설명은 정정한다.

## 추가 패치 1: 음악 캐시를 메모리 대신 파일로 채우기

이미지에는 다운로드 제한이 있지만 음악 캐시의 첫 저장은 `download()` → Blob → ArrayBuffer → Buffer로 파일 전체를 보관한 뒤 디스크에 쓰고 있었다. 서로 다른 곡을 여러 개 미리 받으면 각 곡의 전체 데이터가 중첩된다.

추가한 `downloadToFile()` 경로는 원본 바이트를 스트림으로 임시 파일에 쓴다. 완료된 파일만 최종 캐시 이름으로 바꾸며, 실패·시간 초과·크기 초과·불완전한 데이터는 캐시에 남기지 않는다. 캐시 한도에 도달하면 기존 스트리밍 경로로 돌아간다.

- 기존 동일 파일 요청 중복 방지, 디스크 캐시, Range 재생, 장기 캐시를 유지한다.
- 파일별 크기 제한을 전송 중에도 검사하고 timeout 타이머를 완료 후 해제한다.
- Supabase 비공개 URL은 서버에서만 사용한다. 캐시를 처음 채울 때 작은 서명 요청 1회가 추가되며, 캐시 적중 시 외부 파일 다운로드는 없다.
- Replit도 스트림 저장을 지원한다. 구형 어댑터 호출에는 기존 Buffer 경로를 호환용으로 남겼다.
- 음질·재생 시작 지점·전투 규칙·프런트 연출은 변경하지 않았다. 첫 캐시 미스에서 파일 저장 완료를 기다리는 기존 동작은 유지되므로, 브라우저의 첫 음 재생이 빨라졌다고 주장하지 않는다.

## 추가 패치 2: 대기 중인 이미지 변환의 RSS 재확인

기존 코드는 변환 대기열에 넣을 때 메모리를 확인했다. 차례를 기다리는 사이 다른 요청으로 메모리가 늘어날 수 있어, 실제 변환 슬롯을 얻은 직후에도 다시 확인하도록 했다. 메모리가 높으면 추가 변환을 건너뛰며 이미 전달한 원본 이미지는 유지한다. Claude의 동시 처리 제한·캐시 정책을 유지하는 보완이다.

## 전후 측정

서로 다른 8MiB 음악 16개, 총 128MiB를 동시에 최초 캐시 저장하는 로컬 실험을 전후 각각 3번 수행했다. 모든 파일의 전달 크기와 SHA-256이 같았다.

| 측정값, 3회 중앙값 | 기존 운영 코드 | 추가 스트림 저장 |
|---|---:|---:|
| 최대 RSS | 488.1MiB | 200.5MiB |
| 작업 시작 이후 RSS 증가량 | 389.6MiB | 95.8MiB |
| 최대 ArrayBuffer 메모리 | 301.9MiB | 86.9MiB |
| 실험의 캐시 채우기·검증 완료 시간 | 1,435ms | 596ms |

이 조건에서 최대 RSS는 약59%, RSS 증가량은 약75% 줄었다. 전체 게임이나 실제 Render 서비스의 메모리가 같은 비율로 줄어든다는 뜻은 아니다. 로컬 HTTP 원본과 Node 자식 프로세스 실험이며, Render의 실제 동시 사용자 수·파일 크기 분포·서명 요청 지연은 재현하지 않았다. 192MiB V8 힙 옵션을 사용했으며, 512MiB 컨테이너 제한을 걸었다고 주장하지 않는다. 운영 서버에는 부하를 주지 않았다.

원자료와 재현 도구는 `docs/qa/20261126-audio-cache-memory/`에 있다.

## 검증과 남은 제한

- 관련 테스트 35개 통과. 스트림 저장, 실패 후 재시도, 크기 제한, 타이머 해제, 비공개 저장소의 실제 라우트 연결, 동일 요청 합치기, Range, 이미지 대기 중 RSS 상승을 포함한다.
- 변경 경로의 엄격한 TypeScript 검사와 API 빌드 통과.
- 전체 라이브러리 타입 검사는 기준 커밋의 깨끗한 복사본과 수정본에서 동일한 TS6307 오류 2건이 발생했다. `lib/game-engine/tsconfig.json`의 파일 목록에 `reviewed-admin-content-20261125.ts`와 `boss/boss-mode.ts`가 빠져 있다. 이 패치가 해당 파일이나 설정을 변경하지는 않는다. 전체 타입 검사가 통과했다고 보고하지 않는다.
- 기존 설치 의존성을 격리 작업 공간에 연결해 같은 Node·sharp·TypeScript 환경에서 전후 비교했다. 기존 작업 폴더의 소스·미커밋 수정은 변경하지 않았다.
- 이 추가 패치는 아직 운영에 배포하지 않았다. 배포 후 정상 사용량에서 메모리 추이·OOM 사건·음악 재생 오류를 확인해야 운영 효과를 확정할 수 있다.

## 재현 명령

```sh
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none artifacts/api-server/src/lib/asset-file-download.test.ts artifacts/api-server/src/lib/audio-cache-streaming.test.ts artifacts/api-server/src/lib/audio-cache.test.ts artifacts/api-server/src/lib/audio-stream.test.ts artifacts/api-server/src/lib/image-delivery.test.ts artifacts/api-server/src/lib/object-storage.test.ts
node node_modules/typescript/bin/tsc -p docs/qa/20261126-audio-cache-memory/tsconfig.json --noEmit
node artifacts/api-server/build.mjs
KO_AUDIO_BENCH_OUTPUT=/tmp/ko-audio-memory-results.json node docs/qa/20261126-audio-cache-memory/compare.mjs 36c68bdebcd44cc6bccc782ce30cd6366f490f0a
```

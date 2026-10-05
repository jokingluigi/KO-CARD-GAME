# AI 입력 지연 / 어디에 있든 후속 수정

기준 main `6061369`. Draft 병합 후 사용자 요청 두 건을 추가 수정했다.

| 검증 | 상태 | 내용 |
| --- | --- | --- |
| AI cosmetic feedback blocking | PASS | 전체 25장 stat cue가 busy를 만들지 않는 테스트. 소환/공격/퇴장 및 변신/quest complete blocking은 유지. |
| 숨겨진 카드 표시 | PASS | deck/상대 hidden hand stat popup 제외; authoritative 효과는 계속 적용. |
| 어디에 있든 | PASS | legacy HAND/BOARD ALL selector를 HAND/DECK/BOARD로 복구, 묘지 제외, owner/tag/type 필터 유지. 25장 전체 적용 확인. catalog 원본 불변. |
| draw 보존 | PASS | deck buff/cost modifier 유지, draw→play 후 실제 강화 스탯 유지. 필드 이탈 reset은 변경하지 않음. |
| 회귀 | PASS | engine/effects/AI + presentation + Draft mutation 총 547개. 격리 Draft HTTP 9개도 PASS. TypeScript engine/frontend/server 및 frontend production build. |
| 기존 기대값 | FAIL → FIXED → PASS | 덱 강화가 draw에서 사라지는 것을 기대하던 2개 테스트를 새 사용자 요구에 맞춰 변경. |
| 실제 AI 기본 입력 | PASS | 운영 최신 빌드에서 퍼플레인 덱 선택 → intro/mulligan → 리버덩크 손패 클릭 → 1구역 소환을 직접 확인. 검증 화면은 로컬 기록으로 보존하고 공개 저장소에는 업로드하지 않았다. 대량 버프 도중 동일 현상 재현/해소의 실제 화면 검증은 UNVERIFIED. |
| 모바일 / 실전 PvP 체감 | UNVERIFIED | 기존 Draft 잔여 검증. |

Draft 선행 배포: 운영 `index-BYzTJ3Ns.js` SHA256 `7468716e27bad61ddb3c65cde078d0b36dc5a638e8f8357717f2c664c67f80ee`가 로컬 빌드와 동일하며 `/api/healthz`는 `{"status":"ok"}` 응답. Render 자동 배포로 반영되어 Render 로그인은 필요하지 않았다.

변경 파일: game-state-preview/presentation-feedback-utils 및 테스트, published-cards runtime adapter, draw-card, saved-wrestler-effects/targeting/deck-system 테스트. 원본 DB는 변경하지 않았다. 엔진 규칙 변경은 draw에서만 이루어져 묘지/필드 reset을 유지한다.

후속 배포 main `151b156e3b40b6a324c4836dc473fc8f0146393a`: PASS. 운영 `index-Bz6D7G6M.js` SHA256 `8192b8804d1e55d5e9c2166ba044099e0bc09879d970b19f786ef3b0d97f3ba8`가 로컬 빌드와 일치. `/api/healthz` 정상 응답.

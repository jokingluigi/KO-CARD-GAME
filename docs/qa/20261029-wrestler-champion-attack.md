# 선수 공격 시 챔피언 공격 표정 — 2026-10-29

확정된 `ATTACK_DECLARED` 사건의 공격 선수 소유자에게 기존 ATTACK 표정을 연결했다. 공격자의 카드 타입은 확정 사건의 sourceSnapshot 또는 실제 필드/퇴장 카드로 확인한다. 선수/챔피언 대상 모두 적용한다. 선택·취소·실패·반격 피해 자체에는 공격 표정을 만들지 않는다.

현재 스킨·일반/각성 세트의 공격 표정을 사용하며 누락 이미지의 기존 같은 세트 대체 규칙을 유지한다. 기존 우선순위를 사용하므로 피격·각성·승패가 우선하고, 공격 반응 후 현재 기본/저체력으로 복귀한다. 표정 슬롯은 기존10개 그대로다.

선수를 지시하는 짧은 WRESTLER_ATTACK 몸짓을 별도로 구분하여 챔피언이 주문을 발사하는 효과를 중복 생성하지 않는다. 관리자 움직임 미리보기에도 ‘선수 공격 효과’ 버튼을 추가했다. 전투 엔진·판정·서버 사건·데이터는 변경하지 않았다.

검증: 자동 회귀 **267 통과/실패0**, 프런트 타입 검사·프로덕션 빌드 통과. 실제 공통 대전 UI와 로컬 엔진을 사용한390×844/1440×900 브라우저에서 선수/챔피언 클릭 공격, 선택·취소 미발동, 저체력 표정 복귀, 상대 선택 스킨·자동 반전, 중복 투사체 없음, pageerror0을 확인했다. 실제 인터넷 양측 전체 매치는 새로 수행하지 않았다.

[모바일 선수 공격 화면](screenshots/20261029-wrestler-champion-attack/attack-wrestler-390.png) · [브라우저 결과](screenshots/20261029-wrestler-champion-attack/results.json). 이미지는 QA 임시 스프라이트이며 최종 원화를 사용한 것처럼 보고하지 않는다.

변경 파일: `champion-sprite-events.ts`, `champion-sprite-motion.ts`, `battle-sprite-editor.tsx`, `champion-sprite-events.test.ts`, `docs/qa/wrestler-champion-attack-browser.mjs`. main 병합·스키마/운영 데이터 변경 없음.

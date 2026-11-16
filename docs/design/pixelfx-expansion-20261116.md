# PIXELFX 전체 적용 지도 · 2026-11-16

이 문서는 **적용 후보와 설계안**이다. 현재 배포된 PIXELFX는 커스텀 4종이고, 아래 140곳이 이미 구현됐다는 의미는 아니다. 이번 작업은 적용 지점 정리이며 게임 코드·운영 배포를 변경하지 않았다.

## 1. 확인한 현재 상태

- 게임 소스: `4a54033b4282d210a79c8b3a55e73798e93a9124`.
- 공개 API 확인: 카드 정의 182개(토큰·피니셔 포함), 챔피언 11종, 공개된 피니셔 태그 주문 12종.
- PIXELFX: [원본 저장소](https://github.com/patch-gg/pixelfx), [확인한 카탈로그](https://github.com/patch-gg/pixelfx/blob/5294518ce7c72e48b6100a744596e0acf57f2826/docs/CATALOG.md). 21계열·244종, MIT.
- 현재 4종은 PIXELFX로 직접 렌더링한 커스텀 타격·강타·방어·회복이다. 원본 244종 중 여러 프리셋을 게임별로 연결한 상태는 아니다.
- `pixelFxFor()`가 IMPACT/BLOCK/ARMOR/HEAL만 연결한다. MAGIC/GOLD/DESTROY/RETIRE, 버프·침묵·카드 이동·팩 개봉은 별도 기존 연출에 머문다.
- 챔피언 직접 피해·챔피언 회복은 `presentation-feedback.tsx`에서 별도 경로로 처리/제외되므로 선수용 이펙트만 바꿔서는 챔피언 표현까지 확장되지 않는다.
- PROTECTION_BREAK가 현재 ARMOR와 같은 방패 그림으로 연결된다. 보호막 획득/방어 성공/보호막 파괴를 각각 구분할 필요가 있다.

## 2. 작게 보이는 이유와 먼저 바꿀 크기 규칙

현재 프레임은 128×128이고 `scale=(canvasSize/128)×(0.62+min(strength,12)×0.022)`다. 투명 여백을 포함한 프레임을 기준으로 배율을 잡고, 대상 카드/챔피언의 실제 크기는 받지 않는다.

아래는 픽셀 알파 64 이상인 선명한 부분을 세어, 해당 픽셀이 가장 많은 프레임의 외접 사각형을 측정한 값이다. 희미한 광원·후행 입자 전체 경계와는 다르다.

| 현재 효과 | 선명한 원본 부분 | 터치 기기 240px 캔버스에서 예상 표시 |
|---|---|---|
| 일반 타격, strength 3 | 44×42px | **약 57×54px** |
| 강타, strength 12 | 55×60px | 약 91×99px |
| 방어, strength 3 | 46×53px | 약 59×68px |
| 회복, strength 3 | 56×54px | 약 72×69px |

`vfxBudget()`은 터치/coarse 입력에서 240px, 일반 데스크톱에서 360px다. 기존 390px 브라우저 검사는 좁은 화면 폭 검사였고 `isMobile/hasTouch`를 지정하지 않았다. 다음 검사에는 터치 입력·DPR 분기를 함께 넣어야 한다.

추가 원인: 일반 소환은 120ms 정도로 효과가 짧게 재생되는 경로가 있고, 0.9초짜리 회복도 320ms 큐에 맞춰 압축된다. 크기와 함께 핵심 프레임의 체류 시간을 확인해야 한다.

새 기준은 카드의 실제 가로폭 W, 높이 H와 **핵심 도형의 가시 영역**이다. 아래 비율은 구현·시각 검증할 설계 목표다.

| 용도 | 주요 가시 영역의 목표 크기 | 기준점 |
|---|---|---|
| 일반 타격 | 1.1–1.4W | 실제 피격점 |
| 강타·결정적 일격 | 1.7–2.2W | 피격점 + 바닥 파동 |
| 막기·아머 | 0.95–1.15W, 카드 몸체를 감싸는 높이 | 공격이 닿는 방향 |
| 회복·버프 | 0.9–1.2W | 발밑 링 + 숫자/본체로 상승 |
| 일반 소환 | 바닥 링 1.3–1.7W | 슬롯 바닥 |
| 대형·레전더리 등장 | 2.0–2.6W | 슬롯/캐릭터 발밑 |
| 리타이어·파괴·제외 | 1.2–1.6W | 떠나는 실제 카드 |
| 챔피언 효과 | 캐릭터 본체 가로폭의 1.2–1.8배 | 본체/초상화 실제 영역 |
| 광역 | 실제 필드 영역 전체 + 여유 10–15% | 필드 중심·대상별 보조 반응 |
| 피니셔·각성 | 전장 폭의 60–85% | 발동 주체와 확정 대상 |

예: 카드 폭이 90px이면 일반 타격의 핵심 형태를 약 100–125px로 잡는다. 현재 약 57px인 접촉을 대략 두 배로 키우는 출발점이다. 최종 크기는 카드 간격과 화면 가장자리에서 검증한다.

필요한 수정:

1. 128px 고정 가정을 없애고 프레임별 크기·피벗·핵심 영역을 메타데이터로 전달한다.
2. 애니메이션 전체의 합집합 영역으로 투명 여백을 정리한다. 프레임마다 제각각 잘라 흔들리게 만들지 않는다.
3. 목표 가시 폭 / 원본 핵심 폭으로 배율을 구하고, 큰 효과에는 캔버스·클리핑 영역도 함께 키운다.
4. 실제 피격점은 유지한다. 화면 가장자리의 희미한 꼬리는 잘라도 효과 중심을 엉뚱한 곳으로 옮기지 않는다.
5. 발밑/카드 앞/전장 배경/화면 연출 레이어를 분리한다. 큰 효과는 중요 숫자·선택 윤곽·조작부를 가리지 않도록 배치한다.
6. 강한 접촉 프레임은 약 50–90ms, 일반 잔상은 약 180–420ms를 시각 검증한다. 기존 공격 접촉 시계에 연결하고 별도 입력 대기를 늘리지 않는다.

## 3. 전체 적용 후보 140곳

공통 효과를 서로 다른 맥락에 재사용하는 지점을 포함한 **적용 상황 목록**이다. 140개 파일을 각각 새로 만든다는 뜻은 아니다. P0=크기/의미 수정 및 대전 핵심, P1=주요 확장, P2=전용·모드·보상 확장, P3=선택적 장식.

불꽃·얼음·독·물·총격 등의 테마는 기존 피해/상태 판정을 꾸미는 선택형 외형이다. 현재 규칙에 없는 화상·빙결·독 상태를 새로 부여하지 않는다. 무기형 효과 역시 카드별 설정이 있을 때 선택한다.

### 공격·타격 · 10곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-001 | 공격 대상 고정 | `arcane/rune-circle`<br>`ui/exclamation` | 대상 외곽 조준 링, 공격 방향 표시 / 대상 | P1 |
| FX-002 | 공격 준비·기 모으기 | `arcane/spell-charge`<br>`lightning/charge-up` | 공격자에게 짧게 모였다가 실제 접촉 때 방출 / 선수 | P1 |
| FX-003 | 돌진·공격 이동 궤적 | `moves/dash-strike`<br>`melee/thrust` | 카드/캐릭터의 실제 이동 경로를 따라 잔상 / 경로 | P1 |
| FX-004 | 일반 육탄 타격 | `impacts/blunt-hit`<br>`impacts/hit-spark` | 피격점 중심의 큰 금빛 섬광과 방향성 파편 / 선수 | P0 |
| FX-005 | 베기·할퀴기 등 무기형 타격 | `melee/sword-slash`<br>`melee/claw-swipe`<br>`melee/whip-crack` | 카드별 지정 모티프를 사용하고 타격 시점을 공유 / 선수 | P1 |
| FX-006 | 고피해 강타·대형 착탄 | `impacts/crit-hit`<br>`impacts/ground-slam` | 일반 공격보다 굵은 핵심 형태, 바닥 충격파 / 대형 | P0 |
| FX-007 | 연속 공격·다중 타격 | `melee/double-slash`<br>`melee/dagger-flurry` | 실제 확정된 타격 횟수대로 짧은 변주 재생 / 선수 | P1 |
| FX-008 | 프로그램·연계 단계 완료 | `ui/combo-counter`<br>`lightning/spark-arc` | 처리된 효과 단계를 연결하고 최종 단계만 큰 마무리 / 선수 | P1 |
| FX-009 | 챔피언 직접 피격 | `impacts/hit-flash`<br>`ui/health-bar-hit` | 챔피언 본체/초상화 피격점과 체력바를 함께 반응 / 챔피언 | P0 |
| FX-010 | 확정 핀폴·결정적 피니시 | `impacts/impact-frame`<br>`ui/crit-number` | 확정 핀폴 표식과 짧은 강한 접촉 연출 / 대형 | P0 |

### 방어·상태·능력치 · 14곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-011 | 회피 발동 | `arcane/blink-out`<br>`spawn/poof` | 타격 직전 잔상 분리, 피해가 없었다는 표시 / 선수 | P0 |
| FX-012 | 회피 후 복귀 | `arcane/blink-in`<br>`melee/spin-slash` | 잔상 회수와 본체 복귀를 기존 회피 동작에 맞춤 / 선수 | P1 |
| FX-013 | 아머·막기 성공 | `impacts/shield-block`<br>`impacts/parry` | 공격 방향 쪽 방패와 튕겨 나가는 스파크 / 선수 | P0 |
| FX-014 | 아머·보호막 파괴 | `spawn/shatter-death`<br>`scifi/emp-blast` | 새 방패가 생기는 대신 기존 방패가 깨져 흩어짐 / 선수 | P0 |
| FX-015 | 방어·보호 상태 부여 | `scifi/force-field`<br>`holy/divine-shield` | 보호를 얻는 순간 테두리가 닫히고 짧은 잔광 / 선수 | P1 |
| FX-016 | 면역으로 피해 무효 | `holy/divine-shield`<br>`impacts/parry` | 피격 섬광과 다른 금속성 반사·무효 표식 / 선수 | P0 |
| FX-017 | 도발 부여·공격 유도 | `ui/exclamation`<br>`arcane/rune-circle` | 선수 외곽에 눈에 띄는 경계와 짧은 도발 파동 / 선수 | P1 |
| FX-018 | 공격 불가 상태 부여 | `shadow/hex-sigil`<br>`arcane/rune-circle` | 공격 아이콘 쪽 봉인 문양, 상태 의미를 명확히 표시 / 선수 | P1 |
| FX-019 | 기절 부여·해제 | `status/stunned`<br>`ui/exclamation` | 머리 위 별/기절 표시, 해제 때 짧게 사라짐 / 선수 | P1 |
| FX-020 | 침묵·능력 비활성화 | `scifi/emp-blast`<br>`shadow/hex-sigil` | 룬이 꺼지고 효과 영역이 잠기는 파동 / 선수 | P0 |
| FX-021 | 공격력 증가 | `status/rage`<br>`holy/blessing` | 공격력 숫자로 에너지가 모이며 상승 / 선수 | P1 |
| FX-022 | 최대 체력 증가 | `holy/blessing`<br>`nature/healing-bloom` | 회복과 다른 외곽 확장, 최대 체력 숫자 강조 / 선수 | P1 |
| FX-023 | 공격·체력 감소 | `shadow/curse`<br>`shadow/hex-sigil` | 감소한 수치 위치로 수축하는 어두운 파편 / 선수 | P1 |
| FX-024 | 키워드 신규 획득 | `pickups/power-star`<br>`arcane/rune-circle` | 획득한 키워드 아이콘에만 짧은 승인 효과 / 선수 | P1 |

### 소환·퇴장·카드 이동 · 16곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-025 | 일반 선수 소환 | `spawn/summon-rise`<br>`impacts/heavy-landing` | 빈 슬롯의 착지 링과 카드 등장 분리 / 선수 | P0 |
| FX-026 | 레전더리·대형 선수 등장 | `holy/holy-pillar`<br>`impacts/ground-slam` | 더 큰 바닥 문양, 등장 대사·일러스트와 합성 / 대형 | P0 |
| FX-027 | 토큰·분신·추가 소환 | `spawn/spawn-portal`<br>`spawn/poof` | 소환된 실제 슬롯마다 짧은 포털, 동시 소환은 묶음 처리 / 선수 | P1 |
| FX-028 | 묘지에서 부활 | `holy/resurrection`<br>`spawn/respawn-beam` | 묘지에서 이어지는 빛과 필드 재구성 / 경로 | P0 |
| FX-029 | 소버린 등 자기 부활 | `spawn/soul-rise`<br>`spawn/respawn-beam` | 퇴장 흔적에서 다시 모이고 감소한 수치를 구분 / 선수 | P1 |
| FX-030 | 리타이어 | `spawn/soul-rise`<br>`spawn/poof` | 영혼·먼지가 묘지 방향으로 빠져나감 / 경로 | P0 |
| FX-031 | 파괴 | `spawn/shatter-death`<br>`spawn/dissolve-burn` | 카드 파편/연소로 리타이어와 명확히 구별 / 선수 | P0 |
| FX-032 | 제외·소멸 | `spawn/disintegrate`<br>`shadow/black-hole` | 재로 지워지거나 공허에 흡수, 묘지 이동과 구별 / 선수 | P0 |
| FX-033 | 손패로 되돌림 | `arcane/blink-out`<br>`arcane/blink-in` | 필드 출발→손패 도착의 잔상 연결 / 경로 | P1 |
| FX-034 | 덱으로 되돌림·섞기 | `scifi/warp-out`<br>`arcane/portal` | 카드 뒷면으로 닫히는 소용돌이와 덱 도착점 / 경로 | P1 |
| FX-035 | 정상 드로우 | `arcane/arcane-orb`<br>`pickups/collect-burst` | 덱 출발점과 손패 도착점의 짧은 연결 / 경로 | P1 |
| FX-036 | 손패 카드 생성 | `scifi/hologram`<br>`pickups/collect-burst` | 드로우와 다른 재구성·실체화 연출 / 선수 | P1 |
| FX-037 | 손패 초과로 카드 소실 | `spawn/dissolve-burn`<br>`transitions/burn-away` | 실제 공개·제거된 경우에만 타는 카드 연출 / 선수 | P1 |
| FX-038 | 카드 탈취·소유권 변경 | `scifi/tractor-beam`<br>`shadow/shadow-tendrils` | 기존 위치에서 새 소유자 위치로 이어지는 흐름 / 경로 | P1 |
| FX-039 | 변신·카드 교체 | `transitions/pixel-dissolve`<br>`spawn/spawn-portal` | 이전 일러스트 해체→새 모습 재구성 / 선수 | P0 |
| FX-040 | 융합·합체 | `arcane/arcane-orb`<br>`explosions/plasma-explosion` | 실제 재료 카드에서 결과 카드로 집결 / 대형 | P1 |

### 주문·회복·자원 · 20곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-041 | 대상 지정 주문 발사 | `arcane/spell-charge`<br>`arcane/arcane-missiles` | 시전자→선택된 대상의 발사체와 착탄 분리 / 경로 | P0 |
| FX-042 | 불꽃 테마 피해 | `fire/fireball`<br>`fire/flame-pillar` | 지정된 카드의 불꽃 모티프, 피해 판정은 기존 이벤트 사용 / 선수 | P1 |
| FX-043 | 전격·연쇄 테마 피해 | `lightning/lightning-strike`<br>`lightning/chain-lightning` | 실제 피해 대상 순서대로 번개가 연결됨 / 경로 | P1 |
| FX-044 | 암흑·악마 테마 피해 | `shadow/void-orb`<br>`shadow/shadow-flames` | 검보라 중심핵과 상대 위치의 어두운 착탄 / 선수 | P1 |
| FX-045 | 얼음·물·구슬 테마 변형 | `ice/frost-nova`<br>`water/water-orb`<br>`water/splash` | 지정된 구슬/주문 테마로만 사용, 새 빙결 판정은 만들지 않음 / 선수 | P2 |
| FX-046 | 필드 전체 광역 효과 | `fire/fire-ring`<br>`ice/frost-nova`<br>`lightning/thunderclap` | 필드 바닥 파동 1개와 대상별 짧은 반응으로 구성 / 필드 | P0 |
| FX-047 | 무작위·분산 다중 대상 | `arcane/arcane-missiles`<br>`projectiles/magic-missile` | 서버/엔진이 확정한 실제 대상 목록만 순차 표시 / 경로 | P1 |
| FX-048 | 선수 체력 회복 | `holy/heal`<br>`nature/healing-bloom` | 발밑 링·상승 입자와 체력 증가 숫자 동기화 / 선수 | P0 |
| FX-049 | 챔피언 체력 회복 | `holy/heal`<br>`holy/blessing` | 스프라이트 본체·초상화와 체력바까지 전용 연결 / 챔피언 | P0 |
| FX-050 | 아군 전체 회복 | `holy/heal-aoe` | 실제 유효한 회복 대상들을 연결하는 하나의 바닥 링 / 필드 | P1 |
| FX-051 | 흡혈·생명력 흡수 | `shadow/life-steal`<br>`shadow/soul-drain` | 피해 지점→회복 주체로 생명 입자 이동 / 경로 | P0 |
| FX-052 | 치유·재생 주기 발동 | `nature/healing-bloom`<br>`holy/heal` | 실제 회복이 발생한 턴에만 작은 새싹/상승광 / 선수 | P1 |
| FX-053 | 비용 감소 | `ui/coin-collect`<br>`pickups/coin-spin` | 카드 비용 숫자에서 빠져나오는 금빛 알갱이 / 선수 | P1 |
| FX-054 | 비용 증가 | `shadow/curse`<br>`shadow/hex-sigil` | 비용 숫자로 수축하는 봉인·압박 표현 / 선수 | P1 |
| FX-055 | 골드 소모 | `ui/coin-collect`<br>`pickups/coin-spin` | 골드 표시→사용 카드 방향으로 짧은 소비 궤적 / 경로 | P1 |
| FX-056 | 골드 획득·회수 | `ui/coin-collect`<br>`spawn/coin-drop` | 발생 원인→골드 표시로 도착, 중복 합산 방지 / 경로 | P1 |
| FX-057 | 다음 턴 추가 골드 예약·지급 | `ui/countdown`<br>`pickups/coin-spin` | 예약 표식과 실제 지급 순간을 나눠 표시 / 선수 | P1 |
| FX-058 | 덱 전체 버프 | `arcane/rune-circle`<br>`holy/blessing` | 덱 뒷면에 문양, 숨은 카드의 정체는 표시하지 않음 / 선수 | P1 |
| FX-059 | 손패 버프·강화 | `holy/blessing`<br>`pickups/power-star` | 수정된 실제 손패 카드에만 순차 별빛 / 선수 | P1 |
| FX-060 | 피로 피해·빈 덱 경고 | `ui/heart-lost`<br>`ui/health-bar-hit` | 덱과 체력바에 피로 신호, 일반 공격과 구별 / 챔피언 | P1 |

### 챔피언·피니셔 · 12곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-061 | 고유 능력 준비 | `arcane/spell-charge`<br>`arcane/rune-circle` | 챔피언 본체/능력 버튼에서 시작되는 짧은 준비 / 챔피언 | P0 |
| FX-062 | 고유 능력별 전용 마무리 | `holy/smite`<br>`shadow/void-orb`<br>`projectiles/bullet-tracer` | 11종 챔피언의 실제 능력 결과에 맞춰 개별 레시피 / 경로 | P0 |
| FX-063 | 피니셔 준비 진행 | `arcane/rune-circle`<br>`ui/achievement` | 조건이 실제 증가한 경우 진행 UI로 모이는 입자 / 선수 | P1 |
| FX-064 | 피니셔 준비 완료 직전 | `lightning/charge-up`<br>`arcane/spell-charge` | 실제 준비 진행값 기반의 짧은 예고, 상시 점멸 금지 / 챔피언 | P2 |
| FX-065 | 준비 완료·퀘스트 클리어 | `ui/quest-complete`<br>`holy/sunburst` | 배너·챔피언·보상 획득을 하나의 연출로 연결 / 필드 | P0 |
| FX-066 | 피니셔를 손패에 획득 | `pickups/loot-beam`<br>`pickups/power-star` | 완료 지점→실제 추가된 피니셔 카드로 빛 이동 / 경로 | P0 |
| FX-067 | 고유 능력 업그레이드 | `ui/level-up`<br>`holy/blessing` | 강화된 능력 버튼·아이콘을 확실히 변화 / 챔피언 | P1 |
| FX-068 | 피니셔 카드 시전 | `moves/holy-smite`<br>`moves/sword-combo`<br>`shadow/dark-explosion` | 12종 피니셔 개별 구성, 자신의 캐릭터 동작과 연결 / 필드 | P0 |
| FX-069 | 각성·강림·챔피언 토큰 등장 | `holy/holy-pillar`<br>`spawn/spawn-portal`<br>`shadow/eclipse` | 발밑→본체→배경 순서의 큰 등장 / 대형 | P0 |
| FX-070 | 각성 보호·챔피언 보호 발동 | `holy/divine-shield`<br>`scifi/force-field` | 실제로 유지되는 보호 범위와 발동 순간 구별 / 챔피언 | P1 |
| FX-071 | 보스·숨은 보스 존재감 | `shadow/eclipse`<br>`weather/storm`<br>`arcane/rune-circle` | 저빈도 배경 레이어와 행동 순간의 강한 악센트 / 필드 | P2 |
| FX-072 | 챔피언 KO·결정타 | `spawn/shatter-death`<br>`spawn/soul-rise`<br>`impacts/impact-frame` | 현재 초상화 파편 연출에 동기화하고 결과 화면으로 연결 / 필드 | P0 |

### 대전 흐름·결과 · 8곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-073 | VS·매치 인트로 | `transitions/slash-wipe`<br>`lightning/spark-arc` | 양쪽 챔피언이 만나는 중앙 경계, 이름 가리지 않음 / 화면 | P2 |
| FX-074 | 대전 시작·준비 완료 | `ui/countdown`<br>`arcane/rune-circle` | 시작 신호를 한 번만 강조 / 필드 | P2 |
| FX-075 | 멀리건·교체 확정 | `arcane/blink-out`<br>`arcane/blink-in` | 반납·새 카드의 방향을 구분한 짧은 이동 / 경로 | P2 |
| FX-076 | 내 턴·골드 갱신 | `ui/exclamation`<br>`ui/coin-collect` | 턴 표시와 실제 골드 증가를 연결 / 선수 | P1 |
| FX-077 | 시간 부족·턴 종료 임박 | `ui/countdown`<br>`lightning/spark-arc` | 타이머 주변에만 절제된 경고, 카드 판독 유지 / 선수 | P2 |
| FX-078 | 승리 | `ui/confetti`<br>`explosions/firework-burst`<br>`weather/god-rays` | 결과 배경과 보상 영역에 축하, 계속 버튼은 즉시 사용 / 화면 | P2 |
| FX-079 | 패배 | `transitions/shatter-wipe`<br>`transitions/iris` | KO 후 잔광·결과 화면 전환 / 화면 | P2 |
| FX-080 | 재접속·대전 복귀 성공 | `scifi/glitch`<br>`transitions/pixel-dissolve` | 복귀가 확정된 순간 한 번의 조용한 정렬 효과 / 화면 | P3 |

### 팩·제작·컬렉션 · 10곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-081 | 팩 봉인 해제 | `pickups/chest-open`<br>`arcane/mana-burst` | 봉인 틈에서 빛이 새고 개봉 순간 방출 / 대형 | P1 |
| FX-082 | 일반 카드 공개 | `pickups/collect-burst`<br>`ui/achievement` | 카드 외곽의 짧은 공개 효과 / 선수 | P2 |
| FX-083 | 에픽 카드 공개 | `arcane/mana-burst`<br>`pickups/gem-spin` | 희귀도 색의 광원과 얇은 파편 / 대형 | P1 |
| FX-084 | 레전더리 카드 공개 | `holy/holy-pillar`<br>`weather/god-rays`<br>`ui/confetti` | 일반 공개와 구별되는 큰 기둥·배경 빛 / 대형 | P1 |
| FX-085 | 챔피언 획득·해금 | `holy/resurrection`<br>`ui/level-up` | 챔피언 일러스트와 이름이 드러나는 별도 공개 / 대형 | P1 |
| FX-086 | 스킨·챔피언 스킨 공개 | `scifi/hologram`<br>`pickups/key-glint` | 스킨 실루엣→실제 스킨의 재구성 / 대형 | P2 |
| FX-087 | 중복 카드·조각 환산 | `pickups/crystal-shard`<br>`pickups/collect-burst` | 실제 환산된 재화만 수치와 함께 모임 / 경로 | P2 |
| FX-088 | 카드 제작 완료 | `arcane/arcane-orb`<br>`arcane/rune-circle` | 재료가 모여 실제 제작 카드로 굳어짐 / 대형 | P1 |
| FX-089 | 챔피언 제작 완료 | `holy/sunburst`<br>`holy/holy-pillar` | 일반 제작보다 큰 문양과 이름 강조 / 대형 | P1 |
| FX-090 | 카드 분해·프리즘 획득 | `spawn/disintegrate`<br>`pickups/crystal-shard` | 카드가 조각이 되어 프리즘 잔액으로 이동 / 경로 | P1 |

### 보상·계정 진행 · 8곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-091 | 팩 구매·팩 지급 | `pickups/chest-open`<br>`pickups/collect-burst` | 지급된 팩 묶음과 잔액 변화의 짧은 강조 / 선수 | P2 |
| FX-092 | 출석 보상 수령 | `ui/coin-collect`<br>`pickups/collect-burst` | 선택한 출석 칸→해당 보상으로 이동 / 경로 | P2 |
| FX-093 | 일일 퀘스트 보상 | `ui/quest-complete`<br>`ui/coin-collect` | 완료한 항목만 체크하고 실제 보상 이동 / 선수 | P2 |
| FX-094 | 시즌 퀘스트 보상 | `ui/achievement`<br>`pickups/loot-beam` | 시즌 완료 항목의 특별한 승인 효과 / 대형 | P2 |
| FX-095 | 보상 한꺼번에 수령 | `pickups/collect-burst`<br>`ui/coin-collect` | 수령 개수마다 폭발하지 않고 하나의 합산 흐름 / 경로 | P2 |
| FX-096 | 대전 결과 보상 정산 | `ui/coin-collect`<br>`pickups/gem-spin` | 서버 확정 수량만 잔액에 도착 / 경로 | P2 |
| FX-097 | 꾸미기 장착 완료 | `pickups/key-glint`<br>`scifi/hologram` | 실제 장착한 외형 미리보기에만 짧은 반짝임 / 선수 | P3 |
| FX-098 | 덱 저장·구성 완료 | `pickups/key-glint`<br>`ui/achievement` | 저장 성공 표식에 작은 승인 효과 / 선수 | P3 |

### 타워·드래프트·튜토리얼 · 14곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-099 | 타워 입장 | `transitions/iris`<br>`weather/fog` | 타워 테마에 맞는 짧은 진입 전환 / 화면 | P2 |
| FX-100 | 층·경로 선택 | `pickups/key-glint`<br>`arcane/rune-circle` | 실제로 고른 경로 지점의 반응 / 선수 | P3 |
| FX-101 | 방 전투 시작 | `arcane/rune-circle`<br>`transitions/diamond-wipe` | 전투가 시작되는 필드의 입장 문양 / 필드 | P2 |
| FX-102 | 정예 전투 등장 | `fire/spirit-flame`<br>`scifi/scanner` | 정예 구분과 해당 적 테마를 한 번 강조 / 대형 | P2 |
| FX-103 | 보스·히든 보스 입장 | `shadow/eclipse`<br>`arcane/portal`<br>`weather/storm` | 보스 소개 장면의 배경과 등장점 / 필드 | P1 |
| FX-104 | 유물 획득 | `pickups/power-star`<br>`pickups/loot-beam` | 유물 선택·획득 확정 순간에만 빛 집결 / 대형 | P2 |
| FX-105 | 유물 효과 발동 | `nature/thorns`<br>`holy/halo`<br>`lightning/spark-arc` | 현재 설정된 유물 판정과 대상에 맞춘 선택형 모티프 / 선수 | P2 |
| FX-106 | 층·보스 격파 | `ui/achievement`<br>`arcane/portal` | 클리어 표식과 다음 층 진입점 연결 / 필드 | P2 |
| FX-107 | 타워 선택·교체·보상 확정 | `pickups/collect-burst`<br>`pickups/key-glint` | 현재 선택한 카드/보상만 짧게 승인 / 선수 | P3 |
| FX-108 | 타워 최종·히든 클리어 | `weather/god-rays`<br>`ui/confetti`<br>`holy/sunburst` | 최종 결과 장면의 큰 보상 연출 / 화면 | P2 |
| FX-109 | 드래프트 카드 선택 | `pickups/key-glint`<br>`arcane/blink-in` | 선택 카드가 덱 슬롯에 안착 / 경로 | P2 |
| FX-110 | 드래프트 덱 준비 완료 | `ui/achievement`<br>`arcane/rune-circle` | 완성 덱과 시작 버튼의 완료 표식 / 대형 | P2 |
| FX-111 | 튜토리얼 다음 행동 안내 | `ui/exclamation`<br>`arcane/rune-circle` | 현재 목표 대상만 절제된 강조 / 선수 | P2 |
| FX-112 | 튜토리얼 목표·레슨 완료 | `ui/achievement`<br>`ui/quest-complete` | 실제 목표 달성 후 완료 표식과 보상 연결 / 대형 | P2 |

### 배경·공통 UI · 8곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-113 | 메인 화면 분위기 | `weather/fireflies`<br>`weather/aurora`<br>`weather/god-rays` | 설정한 배경 테마에서 저빈도 배경 장식 / 배경 | P3 |
| FX-114 | 선택한 대표 카드·스킨 분위기 | `holy/halo`<br>`fire/spirit-flame`<br>`critters/wisp` | 선택한 하나의 카드만 테마별 장식 / 선수 | P3 |
| FX-115 | 설정·관리자 이펙트 미리보기 | `arcane/rune-circle`<br>`impacts/hit-spark` | 대상 크기·레이어·타이밍·강도를 직접 비교 / 대형 | P1 |
| FX-116 | 큰 화면 이동·장면 전환 | `transitions/diamond-wipe`<br>`transitions/slash-wipe` | 주요 장면 변경에만 짧은 일관된 전환 / 화면 | P3 |
| FX-117 | 특수 보상 창 등장 | `pickups/key-glint`<br>`arcane/mana-burst` | 보상 패널 뒤쪽의 짧은 도착광 / 대형 | P3 |
| FX-118 | 대상 선택 취소·되돌림 | `arcane/blink-out`<br>`scifi/glitch` | 취소된 선택 표시만 조용히 회수 / 선수 | P3 |
| FX-119 | 주문 대상 확정·효과 경로 | `arcane/rune-circle`<br>`projectiles/magic-missile` | 실제 확정 대상의 출발/도착을 읽기 쉽게 표시 / 경로 | P1 |
| FX-120 | 행동 불가·오류·중요 알림 | `ui/exclamation`<br>`ui/countdown` | 관련 버튼/안내 영역만 짧게 강조 / 선수 | P3 |

### 특수 키워드·메커니즘 · 20곳

| ID | 적용 순간 | PIXELFX 원형 후보 | 구성·기준 영역 | 우선순위 |
|---|---|---|---|---|
| FX-121 | 포획·삼키기 | `shadow/black-hole`<br>`shadow/grasping-hands` | 대상→포획 주체로 수축하고 연결 표식 유지, 파괴와 구별 / 경로 | P1 |
| FX-122 | 포획 해방·되돌아오기 | `spawn/respawn-beam`<br>`scifi/warp-in` | 포획 연결이 풀리고 실제 복귀 위치에서 재구성 / 선수 | P1 |
| FX-123 | 공격·체력·능력치 교환 | `lightning/spark-arc`<br>`scifi/hologram` | 바뀐 수치 위치 사이의 쌍방향 흐름, 단순 버프와 구별 / 경로 | P1 |
| FX-124 | 최고 능력치·능력치 복사 | `scifi/hologram`<br>`arcane/arcane-orb` | 허용된 공개 원본→복사 대상의 거울상과 확정 숫자 / 경로 | P1 |
| FX-125 | 처치·리타이어 후 능력치 흡수 | `shadow/soul-drain`<br>`shadow/shadow-tendrils` | 피해자의 실제 수치 변화→흡수 주체의 해당 숫자로 모임 / 경로 | P1 |
| FX-126 | 덱 카드 밀기·덱 소모 | `spawn/dissolve-burn`<br>`arcane/portal` | 덱 출발의 제거 흐름, 실제 공개되기 전에는 뒷면만 사용 / 경로 | P1 |
| FX-127 | 카드 카운트다운 감소·완료 | `ui/countdown`<br>`arcane/rune-circle` | 실제 카운트 변경 때만 숫자 문양, 완료 시 변신/해제 효과로 연결 / 선수 | P1 |
| FX-128 | 러쉬 진입·행동 가능 | `status/haste`<br>`moves/dash-strike` | 새 선수의 공격 가능 상태를 짧은 전진 잔상으로 표시 / 선수 | P1 |
| FX-129 | 기습 진입·첫 공격 준비 | `arcane/blink-in`<br>`explosions/smoke-bomb` | 기습 조건이 활성화된 경우의 빠른 출현과 첫 행동 표식 / 선수 | P1 |
| FX-130 | 수배 표식·처치 보상 예약 | `ui/exclamation`<br>`pickups/coin-spin` | 수배 표식과 확정된 다음 턴 보상 예약을 연결, 즉시 지급처럼 보이지 않게 함 / 경로 | P1 |
| FX-131 | 키워드 제거·공격 봉인 해제 | `scifi/emp-blast`<br>`arcane/blink-in` | 사라지는 키워드 표식을 회수하고 실제 행동 가능 상태를 표시 / 선수 | P1 |
| FX-132 | 카드 텍스트·능력 부여·사자 임명 | `arcane/rune-circle`<br>`scifi/hologram` | 부여 원본과 받은 선수 사이의 계약 문양, 새 텍스트/표식에만 강조 / 경로 | P1 |
| FX-133 | 예약 효과·지연 효과의 실제 발동 | `arcane/rune-circle`<br>`lightning/charge-up` | 예약 표식은 작게, 실제 발동 때 확정 대상에 후속 연출 / 선수 | P1 |
| FX-134 | 턴 종료 효과 반복 | `lightning/spark-arc`<br>`arcane/rune-circle` | 실제 반복 처리 횟수에 맞춘 짧은 반향, 큰 장면의 중복 재생은 억제 / 선수 | P2 |
| FX-135 | 리타이어 방지·생존 보호 | `holy/halo`<br>`holy/divine-shield` | 퇴장 직전 붙잡히는 빛과 생존 표식, 회복/부활과 구별 / 선수 | P1 |
| FX-136 | 피해량 보정·추가 피해 효과 | `status/rage`<br>`lightning/spark-arc` | 피해 보정 주체의 작은 표식과 확정된 최종 피해 숫자 연결 / 선수 | P1 |
| FX-137 | 조건부 효과 준비·성립 | `arcane/rune-circle`<br>`pickups/key-glint` | 공개 조건이 실제 성립하거나 등록 효과가 발동할 때만 짧은 신호 / 선수 | P2 |
| FX-138 | 효과 분기·고유 능력 전환 | `scifi/hologram`<br>`arcane/blink-in` | 실제 선택/교체된 분기와 능력 아이콘을 구분해 보여줌 / 선수 | P1 |
| FX-139 | 대전 중 카드 공개·숨은 정보 공개 확정 | `scifi/scanner`<br>`arcane/blink-in` | 실제 공개 이벤트가 허용한 카드만 뒷면에서 앞면으로 전환 / 선수 | P1 |
| FX-140 | 자기 피해·자해 비용 | `ui/health-bar-hit`<br>`shadow/hex-sigil` | 아군 효과로 내 체력이 감소했음을 작은 붉은/보라 비용 표식으로 구별 / 챔피언 | P0 |

## 4. 챔피언 11종별 전용 레시피

아래는 현재 공개된 챔피언 능력 설명을 기준으로 잡은 외형 설계다. 피니셔/보상 연결은 실제 설정의 정의 ID를 따르며, 오래된 설명 문구만 보고 새로운 보상을 만들지 않는다.

| 챔피언 | 능력·정체성에 맞는 구성 | PIXELFX 재료 |
|---|---|---|
| 나토마토 | 자신에게 내는 피해는 작은 비용 표시, 아군에게 회피 부여 링, 회피 성공은 빠른 분리 잔상. 토마티나는 붉은 입자 폭발로 변주 | `arcane/blink-out`, `arcane/blink-in`, `nature/spore-burst`, `ui/quest-complete` |
| 라 칼라베라 | 바닥의 녹보라 묘지 문양→좀비가 솟는 흐름. 부활과 일반 소환을 구별 | `spawn/summon-rise`, `spawn/soul-rise`, `shadow/necro-skulls`, `holy/resurrection` |
| 로지양 | 무작위 생성의 홀로그램/색 전환→실제로 확정된 카드가 손패에 실체화. 숨은 후보·미래 결과는 보여주지 않음 | `scifi/hologram`, `scifi/glitch`, `arcane/arcane-orb`, `pickups/collect-burst` |
| 마왕 벨모르트 | 어두운 파괴핵, 부서지는 카드의 보라 불씨, 강림 시 크게 열리는 공허. 한 번의 강림에 한 번의 등장 | `shadow/dark-explosion`, `shadow/eclipse`, `spawn/shatter-death`, `fire/spirit-flame` |
| 블랙마카롱 | 마피아 테마의 날카로운 타격/선택형 탄흔, 처치 성공 후 아군 슬롯의 짧은 호출. 단순 사용과 처치 성공을 구별 | `impacts/blunt-hit`, `projectiles/bullet-tracer`, `spawn/poof`, `explosions/smoke-bomb` |
| 여울 | 추가 골드 예약 표식→다음 턴 지급 때 동전 이동. 보디가드 호출은 등장 배지와 착지. 실제 보호 효과가 있을 때만 보호막 표시 | `ui/coin-collect`, `pickups/coin-spin`, `spawn/summon-rise`, `impacts/heavy-landing` |
| 예거 | 용병 호출은 스캔/연막→지정 슬롯 착지. 엘리트 호출은 필드 전체를 한 번 묶은 뒤 슬롯별 등장 | `scifi/scanner`, `explosions/smoke-bomb`, `spawn/spawn-portal`, `impacts/heavy-landing` |
| 크루세이더즈 | 공격력 상승의 금빛 축복과 챔피언 회복의 녹색 흐름을 분리. 마지막 희망은 하늘빛·각성 등장 | `holy/blessing`, `nature/healing-bloom`, `holy/holy-pillar`, `weather/god-rays` |
| 판도라 | 불안한 일격의 날카로운 공허 접촉. 핀폴이 확정되면 결정타→회복으로 연결, 폭주는 큰 붉은 각성 파동 | `shadow/void-orb`, `impacts/crit-hit`, `shadow/life-steal`, `status/rage` |
| 퍼플레인 | 의식의 보라 문양과 작은 자기 피해, 챔피언/선수 대상에 따라 드로우·비용 감소 또는 공격 버프로 후속 흐름 분리 | `shadow/hex-sigil`, `shadow/shadow-tendrils`, `shadow/soul-drain`, `arcane/arcane-orb` |
| 피 스타 세븐 | 트레이닝의 별빛이 실제로 강화된 손패 카드에 도착. 래리어트는 한 번의 확정 타격과 칠성 문양. 장식 별 7개를 피해 7회처럼 표현하지 않음 | `pickups/power-star`, `holy/blessing`, `impacts/crit-hit`, `lightning/spark-arc` |

## 5. 공개 피니셔 12종별 연출안

아래는 같은 "큰 폭발"의 색만 바꾸는 구성이 아니라, 각 카드의 실제 처리 순서가 읽히도록 구성한 안이다. 실제 처리된 피해·생성·부활·파괴만 재생한다.

| 피니셔 | 제안하는 시각 순서 | 주요 재료 |
|---|---|---|
| 궁극의 언데드 | 거대한 묘지 문양→오메가 좀비 실루엣→한 번의 착지 | `shadow/necro-skulls`, `spawn/summon-rise`, `impacts/ground-slam` |
| 뇌진탕 펀치 | 주먹 충격핵→피격 잔광→처치 성공 시 손패 보상으로 연결. 이후 생성은 짧은 마피아 표식만 사용 | `impacts/blunt-hit`, `impacts/crit-hit`, `pickups/loot-beam` |
| 대폭주 | 확정 대상 파괴→파편/에너지 집결→판도라 폭주 등장과 상속 수치 표시 | `spawn/shatter-death`, `shadow/dark-explosion`, `spawn/spawn-portal` |
| 라 토마티나 | 선택 대상의 붉은 토마토형 입자 착탄→아군 회피 링. 강화된 광역은 실제 추가 피해 이벤트와 동기화 | `nature/spore-burst`, `explosions/cartoon-pow`, `arcane/blink-in` |
| 라스트 서퍼 | 대상 리타이어→그 지점에서 챔피언으로 흐르는 생명력→회복. 이후 능력 변화는 작은 보라 표식 | `spawn/soul-rise`, `shadow/soul-drain`, `holy/heal` |
| 마지막 희망 | 위에서 내려오는 빛→각성 캐릭터 본체→주변으로 퍼지는 원환 | `weather/god-rays`, `holy/holy-pillar`, `holy/sunburst` |
| 보디가드 호출 | 호출 문양→보디가드의 슬롯 착지→추가 골드 예약 표시. 반복 호출은 큰 인트로를 반복하지 않음 | `spawn/summon-rise`, `impacts/heavy-landing`, `ui/coin-collect` |
| 세븐 스타 래리어트 | 칠성 궤적→단일 확정 타격→손패 강화 별빛 | `impacts/crit-hit`, `lightning/spark-arc`, `holy/blessing` |
| 어셈블!!! | 실제 확정된 소환 위치들을 잇는 필드 문양→짧은 간격의 개별 등장. 무작위 결과를 미리 보여주지 않음 | `arcane/rune-circle`, `spawn/spawn-portal`, `spawn/summon-rise` |
| 엘리트 호출 | 필드 전체 스캔→엘리트 슬롯별 등장→능력 강화 배지 | `scifi/scanner`, `spawn/spawn-portal`, `ui/level-up` |
| 파괴의 강림 | 전장 전체가 한 번 수축→실제 파괴된 카드 파편→단 하나의 강림 등장→잔여 불씨 | `explosions/implosion`, `spawn/shatter-death`, `shadow/eclipse`, `shadow/dark-explosion` |
| 흉내내기 | 허용된 실제 선택지 3장의 홀로그램→선택된 한 장만 실체화 | `scifi/hologram`, `arcane/portal`, `pickups/collect-burst` |

`moves/*`의 기본 회색 더미 캐릭터를 그대로 덮어씌우지 않는다. 공격 예고·접촉·히트 스톱·복귀 타이밍은 라이브러리의 `act`를 참고해 현재 카드 이동/우리 캐릭터 동작과 맞춘다.

## 6. 카드별 변주를 만드는 모티프 라이브러리

카드 태그 하나만으로 공격을 고정하지 않는다. 특히 '레이디' 같은 넓은 분류에는 하나의 색/모양을 강제하지 않는다. 실제 카드 콘셉트와 개별 설정을 우선한다.

| 적용할 카드 콘셉트 | 사용할 계열/원형 예시 | 구별할 시각 요소 |
|---|---|---|
| 육탄·스트리트·레슬링 | `impacts/blunt-hit`, `impacts/ground-slam`, `melee/uppercut` | 먼지·충격파·방향성 타격 |
| 마피아·총격 콘셉트 | `projectiles/bullet-tracer`, `projectiles/muzzle-pistol`, `impacts/bullet-impact` | 짧은 탄도·금속 스파크·탄흔 |
| 악마·군주 | `shadow/dark-explosion`, `fire/spirit-flame`, `shadow/eclipse` | 어두운 핵과 유색 불씨 |
| 언데드·소생 | `spawn/soul-rise`, `shadow/necro-skulls`, `critters/ghost` | 영혼 흐름·묘지 문양 |
| 천사·성스러운 콘셉트 | `holy/feather-burst`, `holy/blessing`, `holy/smite` | 깃털·세로 빛·금빛 원환 |
| 기계·실험체 | `scifi/hologram`, `scifi/emp-blast`, `scifi/laser-grid` | 스캔·재구성·격자 |
| 솔져·중화기 콘셉트 | `projectiles/cannonball`, `projectiles/rocket`, `explosions/grenade` | 묵직한 착탄·파편 |
| 구슬마스터·마력구 | `arcane/arcane-orb`, `water/water-orb`, `lightning/plasma-ball` | 구체·궤도·착탄 후 분산 |
| 슈퍼스타·쇼맨십 | `weather/god-rays`, `ui/confetti`, `impacts/crit-hit` | 스포트라이트·별·카메라 악센트 |
| 디 어쏘리티·명령/통제 콘셉트 | `arcane/rune-circle`, `scifi/force-field`, `shadow/hex-sigil` | 봉인 문양·기하학 경계 |
| 자연·독 테마를 지정한 카드 | `nature/vine-whip`, `nature/poison-cloud`, `nature/leaf-storm` | 잎·포자·덩굴의 모양. 독 상태가 없으면 외형으로만 사용 |
| 빙결·물 테마를 지정한 카드 | `ice/ice-shatter`, `ice/frost-nova`, `water/wave-crash` | 결정·물방울·파동. 새 빙결 판정을 추가하지 않음 |

244종은 모티프 선택지다. 같은 모티프도 팔레트·입자 형태·방향·발생 위치·준비/방출/잔상 조합을 달리해 카드별 레시피로 만든다. 모든 자산을 처음부터 다운로드하지 않고 현재 장면에 필요한 공통/챔피언/공개 카드 효과만 준비한다.

## 7. 첫 확장 목표: 공통 원형 36종

다음 36종을 우선 제작·짧은 대전용으로 재구성하는 제안이다. 36개의 PNG를 즉시 전부 띄우는 방식이 아니라 상황별 레시피에 사용한다.

| 계열 | 1차 원형 |
|---|---|
| impacts | `impacts/hit-spark`, `impacts/blunt-hit`, `impacts/crit-hit`, `impacts/ground-slam`, `impacts/heavy-landing`, `impacts/parry`, `impacts/shield-block`, `impacts/hit-flash` |
| melee | `melee/sword-slash`, `melee/claw-swipe`, `melee/double-slash`, `melee/uppercut` |
| spawn | `spawn/summon-rise`, `spawn/spawn-portal`, `spawn/soul-rise`, `spawn/shatter-death`, `spawn/disintegrate` |
| arcane | `arcane/spell-charge`, `arcane/magic-circle-cast`, `arcane/arcane-missiles`, `arcane/blink-in`, `arcane/blink-out`, `arcane/portal` |
| holy | `holy/heal`, `holy/heal-aoe`, `holy/blessing`, `holy/divine-shield`, `holy/resurrection` |
| shadow | `shadow/life-steal`, `shadow/curse`, `shadow/dark-explosion` |
| lightning | `lightning/chain-lightning` |
| ui | `ui/quest-complete`, `ui/level-up`, `ui/coin-collect`, `ui/combo-counter` |


## 8. 연결 구조와 실제 수정할 파일

| 현재 지점 | 확장할 내용 |
|---|---|
| `pixelfx-sprite.tsx`, `pixelfx-atlas.json` | 고정 128px·4종 분기를 크기/피벗/가시 영역/레이어/레시피 기반 재생기로 확장 |
| `battle-vfx.tsx`, `attack-animation.tsx`, `battle-vfx-model.ts` | 방향·접촉 시계·대상 크기를 전달하고 기본 타격과 강타를 구별 |
| `presentation-feedback-utils.ts`, `presentation-feedback.tsx` | 아머 획득/파괴·침묵·기절·버프·회복·자기 피해의 의미별 라우팅 |
| `champion-battle-actor.tsx`, `champion-sprite-events.ts`, `champion-sprite-motion.ts` | 실제 캐릭터 위치에 고유 능력/피격/각성 효과를 맞춤 |
| `champion-defeat-burst.tsx`, `cinematic-layer.tsx`, `screen-impact.tsx` | KO 파편·큰 광역·피니셔의 레이어 및 우선순위 조정 |
| `card-play-animation.tsx`, `card-leave-animation.tsx` | 일반/전설/토큰 등장 및 리타이어/파괴/제외의 독립 레시피 |
| `battle-zone-visuals.tsx`, `battle-resource-feedback.tsx` | 카드 이동·골드·흡혈의 출발/도착점을 실제 영역에 연결 |
| `quest-presentation.tsx`, 피니셔 표시 경로 | 준비 진행→완료→실제 보상→강화/강림을 하나의 흐름으로 묶음 |
| `pack-opening.tsx`, `collection-action-animation.tsx` | 희귀도별 공개·획득·제작·분해의 계열 차이 |
| `claim-all-rewards.tsx`, `reward-display.tsx`, 출석/퀘스트 페이지 | 확정된 보상 개수에 맞춘 합산 수령 흐름 |
| `pages/tower.tsx`, `draft-ready-panel.tsx`, 튜토리얼 컴포넌트 | 모드의 실제 상태 전환에만 해당 효과를 연결 |

레시피는 ‘이벤트 종류 + 카드 정의 ID/챔피언 ID + 효과 의미 + 지정 테마’에서 선택한다. 표시 이름의 부분 문자열만으로 판정하지 않는다. 알 수 없는 새 카드에는 공통 레시피가 적용되게 한다.

## 9. 연출이 읽히도록 만드는 규칙

- **의미 구분:** 리타이어/파괴/제외, 막기/회피/면역, 회복/최대 체력 증가, 소환/부활/생성을 다른 그림으로 만든다. 고피해용 `crit-hit` 그림이 새로운 치명타 확률 규칙을 뜻하지 않게 한다.
- **엔진 결과와 동기화:** 확정 이벤트를 입력으로 받는다. 이펙트 완료 콜백이 소환·드로우·피해를 다시 실행하지 않게 한다. 강림 1회는 시각 연출도 1회다.
- **큰 장면은 묶음:** 전체 파괴/8개 동시 소환은 전장 효과 1개 + 대상별 짧은 반응이다. 여러 개의 전체 화면 효과가 겹치지 않게 한다.
- **레이어:** 발밑/배경은 본체 뒤, 접촉은 본체 앞, 주요 숫자·상태·선택 윤곽은 그 위다. 배너·버튼 조작은 계속 가능해야 한다.
- **캐릭터 동작:** 실제 공격의 예고→접촉→멈춤→복귀와 효과의 밝은 핵심 프레임을 맞춘다. 원본 3–7초짜리를 무조건 몇 배속하지 않고 긴 대기·잔상을 대전용으로 재구성한다.
- **숨은 정보:** 상대 손패·덱·무작위 미래 결과를 입자/초상화/선행 다운로드로 드러내지 않는다. 공개된 카드와 실제 허용된 선택지만 표현한다.
- **중복 방지:** 이벤트 키·게임 ID로 묶고, 재접속·과거 리플레이에서는 이전 완료 연출이 재발동하지 않게 한다.
- **지속 상태:** 처음 부여될 때 확실히 보여주고 유지 중에는 약한 아이콘/외곽만 남긴다. 게임 내내 큰 루프 효과가 떠 있지 않게 한다.
- **우선순위:** 피니셔/KO > 큰 소환/광역 > 일반 공격 > 지속 장식. 겹칠 때 장식을 먼저 줄인다.
- **성능 설계 목표:** PC는 큰 효과 4개/작은 효과 12개, 터치 기기는 큰 효과 2개/작은 효과 6개 정도를 출발 예산으로 잡아 측정한다. 아직 달성한 FPS 수치가 아니다. 효과별 선택 로딩·캐시·프레임 제한·탭 숨김/퇴장 정리를 적용한다.
- **접근성:** 번쩍임 강도·동작 줄이기를 유지하고, 원형/파편/기호의 모양으로도 상태를 구별한다. 전체 화면 흰색 플래시를 일상 공격에 쓰지 않는다.

## 10. 권장 구현 순서와 완료 기준

1. **가시 크기·레이어 체계:** 현재 4종의 가시 부분을 대상 크기에 맞추고, 챔피언 경로/보호막 파괴 경로까지 정리한다. 모바일 터치와 데스크톱을 각각 촬영해 크기표를 검증한다.
2. **공통 전투 원형 36종:** 공격·회피·막기·등장·퇴장·이동·버프·회복·흡혈·골드·준비 완료를 연결한다. 가장 자주 반복해서 보이는 부분이다.
3. **챔피언 11종 + 피니셔 12종 레시피:** 개별 능력과 실제 처리 순서에 맞는 큰 장면을 제작한다. 공통 재료를 조합해도 결과의 실루엣·진행 방향·등장 방식은 다르게 한다.
4. **팩·제작·보상:** 희귀도별 차이와 보상 이동을 적용한다. 실제 지급 성공이 기준이며 빠른 공개/건너뛰기는 유지한다.
5. **타워·드래프트·튜토리얼:** 모드 상태별 레시피를 연결한다.
6. **배경·공통 UI 장식:** 핵심 연출의 판독성과 모바일 예산을 확인한 뒤 선택적으로 추가한다.

확인할 장면: 보통 공격/강타/정확한 핀폴, 아머 소진, 회피·면역, 자기 피해, 1체·광역 회복, 손패·덱 변화, 소환·부활·파괴·제외, 광역 파괴, 동시 소환, 피니셔 각성/KO, 팩의 빠른 공개, 보상 일괄 수령, 모바일 세로/가로, 터치/마우스, 큰 DPR, 번쩍임 0·약함, 동작 줄이기, 자산 실패·느린 로딩, 재접속과 장면 퇴장.

완료 기준은 후보 수만 채우는 것이 아니라 **대상 크기에 맞게 보이고, 효과 의미를 구별할 수 있고, 입력/프레임을 방해하지 않는 것**이다. 표의 P3 장식은 이 기준을 만족한 뒤 선택한다.


## 11. 엔진 정의 교차 확인 · 특수 메커니즘 누락 점검

`lib/effect-registry/src/index.ts`의 **등록 액션 51개·키워드 16개**, `game/effects/types.ts`의 **런타임 트리거 32개**를 위 적용 후보에 대조했다. 공개 카드가 현재 모든 기능을 쓰는 것은 아니며, 실제 발동이 있는 경우에 사용하는 대응표다. 등록/조건 검사 자체가 매번 큰 이펙트를 발생시키지는 않는다.

### 등록 액션 51개

| 액션 | 연결할 적용 후보 |
|---|---|
| `PROGRAM` | FX-008 |
| `REPLACE_CHAMPION_ABILITY` | FX-067, FX-138 |
| `BUFF` | FX-021, FX-022, FX-059 |
| `SET_STATS` | FX-021, FX-022, FX-023 |
| `MODIFY_STAT` | FX-021, FX-022, FX-023 |
| `MODIFY_MAX_HEALTH` | FX-022 |
| `SET_STAT` | FX-021, FX-022, FX-023 |
| `DAMAGE` | FX-004, FX-006, FX-041, FX-046, FX-140 |
| `HEAL` | FX-048, FX-049, FX-050 |
| `SILENCE` | FX-020 |
| `DESTROY` | FX-031 |
| `RETIRE` | FX-030 |
| `ADD_GOLD` | FX-056 |
| `ADD_NEXT_TURN_GOLD` | FX-057 |
| `DRAW` | FX-035 |
| `REDUCE_COST` | FX-053 |
| `INCREASE_COST` | FX-054 |
| `STUN` | FX-019 |
| `DISABLE_ABILITY` | FX-020 |
| `WEAKEN_TO_STUN_SILENCE` | FX-019, FX-020, FX-023 |
| `ADD_KEYWORD` | FX-024 |
| `REMOVE_KEYWORD` | FX-131 |
| `SWAP_STATS` | FX-123 |
| `ADD_DAMAGE_MODIFIER` | FX-136 |
| `SUMMON` | FX-025, FX-027 |
| `SUMMON_FROM_HAND` | FX-025, FX-027, FX-033 |
| `REVIVE` | FX-028, FX-029 |
| `GENERATE` | FX-036 |
| `MOVE_TO_HAND` | FX-033 |
| `MOVE_TO_DECK` | FX-034 |
| `STEAL` | FX-038 |
| `MILL` | FX-126 |
| `SPEND_GOLD_BUFF_SELF` | FX-055, FX-021, FX-022 |
| `DEPLOY_CHAMPION_TOKEN` | FX-069 |
| `CAPTURE` | FX-121 |
| `RELEASE_CAPTURED` | FX-122 |
| `REMOVE_FROM_GAME` | FX-032 |
| `SWITCH_EFFECT_BRANCH` | FX-138 |
| `QUEUE_EFFECT` | FX-133 |
| `ADD_AGGREGATED_ATTACK` | FX-125 |
| `COPY_BEST_STATS` | FX-124 |
| `REPEAT_TURN_END` | FX-134 |
| `TRANSFORM_SOURCE` | FX-039 |
| `TRANSFORM_TARGET` | FX-039 |
| `REGISTER_DELAYED` | FX-133 |
| `REGISTER_LISTENER` | FX-137 |
| `PREVENT_DAMAGE` | FX-013, FX-016 |
| `PREVENT_RETIRE` | FX-135 |
| `GRANT_RANDOM_CARD_TEXT` | FX-132 |
| `FUSION` | FX-040 |
| `VANISH` | FX-032 |

### 키워드 16개

| 키워드 | 연결할 적용 후보 |
|---|---|
| `PROGRAM` | FX-008 |
| `RUSH` | FX-128 |
| `SURPRISE` | FX-129 |
| `TAUNT` | FX-017 |
| `DODGE` | FX-011, FX-012 |
| `MULTI_STRIKE` | FX-007 |
| `IMMUNE` | FX-016 |
| `REGEN` | FX-052 |
| `ARMOR` | FX-013, FX-014 |
| `CONDITION` | FX-137 |
| `DEFENSE` | FX-015 |
| `LIFESTEAL` | FX-051 |
| `COUNTDOWN` | FX-127 |
| `WANTED` | FX-130 |
| `FUSION` | FX-040 |
| `CANNOT_ATTACK` | FX-018, FX-131 |

### 런타임 트리거 32개

| 트리거 | 실제 결과가 있을 때 연결할 후보 |
|---|---|
| `ACTIVE` | FX-061, FX-062 |
| `AFTER_MULLIGAN` | FX-075 |
| `ANY_BEFORE_RETIRE` | FX-135 |
| `ATTACK_SURVIVED` | FX-013, FX-137 |
| `BEFORE_ATTACK` | FX-002, FX-128, FX-129 |
| `BEFORE_DAMAGE` | FX-013, FX-016 |
| `BEFORE_RETIRE` | FX-135 |
| `CARD_DESTROYED` | FX-031, FX-125 |
| `CARD_DRAWN` | FX-035 |
| `CARD_ENTERED` | FX-025, FX-027 |
| `CARD_RETIRED` | FX-030, FX-125 |
| `CARD_SUMMONED` | FX-025, FX-027 |
| `COUNTDOWN` | FX-127 |
| `ENTER_FIELD` | FX-025, FX-026, FX-027 |
| `EXACT_ZERO_DAMAGE` | FX-010 |
| `FIRST_ATTACKED` | FX-004, FX-011, FX-013 |
| `GAME_START` | FX-073, FX-074 |
| `HAND_WRESTLER_ADDED` | FX-035, FX-036 |
| `LEAVE_FIELD` | FX-030, FX-031, FX-032, FX-033 |
| `ON_FUSION` | FX-040 |
| `OTHER_ALLY_ATTACK` | FX-008, FX-137 |
| `POSITION` | FX-001, FX-119 |
| `SELF_ATTACK` | FX-003, FX-004, FX-007 |
| `SELF_DAMAGED` | FX-004, FX-125, FX-140 |
| `SELF_ENTERED` | FX-025, FX-027 |
| `SELF_RETIRE` | FX-030, FX-125 |
| `SELF_RETURNED_TO_HAND` | FX-033 |
| `SOURCE_RETIRED_TARGET` | FX-030, FX-125, FX-130 |
| `STAT_CHANGED` | FX-021, FX-022, FX-023, FX-123 |
| `TECHNIQUE_CAST` | FX-041, FX-068 |
| `TURN_END` | FX-052, FX-133, FX-134 |
| `TURN_START` | FX-052, FX-057, FX-127, FX-133 |


등록 액션 외에 런타임에서 허용되는 `REVEAL_CARD`도 확인했다. FX-139에 연결하며, 카드 공개의 실제 허용 범위를 따른다. 따라서 등록 액션 51개와 런타임 추가 액션 1개를 합친 52개를 대응시킨다. 자기 피해 구분은 FX-140으로 별도 연결한다.

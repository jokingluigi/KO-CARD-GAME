# Claude에게: KO CARD GAME 챔피언 스프라이트 설명

2026-11-18 코드 기준. 작업 전에 현재 브랜치·커밋과 담당 파일을 확인한다. Codex와 같은 파일을 동시에 고치지 않는다.

## 1. 무엇을 말하는가

챔피언 스프라이트는 전투 화면에서 플레이어와 상대 챔피언을 표현하는 일러스트와 표정·포즈 시스템이다. 현재 구조는 표정별 정지 이미지(PNG/WebP)를 상황에 따라 교체하고, 이미지 컨테이너를 이동·회전·확대하는 방식이다. 필수로 스프라이트 시트나 GIF를 재생하는 구조가 아니다.

서로 구분해야 하는 것:

- **챔피언 스프라이트:** 기본·공격·피격 등 일러스트와 몸의 움직임.
- **초상화:** 챔피언의 일반 이미지와 준비 완료 후 이미지. 스프라이트가 없거나 이미지 로드에 실패했을 때의 대체 표현도 담당한다.
- **전투 VFX:** 폭발·입자·충격선 등 별도 효과. 이전 PixelFX 제작물은 폐기됐고, 이후 Claude presentation pass(e5ea2170)의 새 전투 연출이 운영에 반영됐다. 현재 연출은 최신 인계를 참고해 보존하고, 스프라이트 작업과 구분한다.
- **전투 규칙:** 피해량·체력·피니셔 조건·보상 지급. 스프라이트는 이미 확정된 게임 결과를 표현하며 규칙을 결정하지 않는다.

## 2. 설정은 어디에 저장되는가

| 대상 | 저장 위치 | 주의 |
| --- | --- | --- |
| 챔피언 기본 외형 | `champions.presentationLines.BATTLE_SPRITE` | `presentationLines`의 대사 등 다른 키를 보존 |
| 개별 장착 스킨 | `cosmeticItems.imageAssets.__battle` | 이 키는 JSON 문자열로 저장하며 다른 이미지·배치 키를 보존 |
| 피니셔 선택지별 외형 | 위 `BattleSprite` 안의 `finishers[choiceId]` | 챔피언 ID나 피니셔 카드 ID가 아닌 안정적인 **선택지 ID**로 연결 |

스프라이트 본체 설정은 `BattleSprite`, 검증 함수는 `parseBattleSprite()`다. 기본 외형은 논리적인 기본 스킨이며 인벤토리 스킨을 새로 지급하는 것이 아니다.

스프라이트 설정은 운영 관리자 화면에서 수정되는 데이터다. Git 저장소에 이미지 설정이 없거나 새 로컬 DB가 비어 있다는 이유로 운영에 스프라이트가 없다고 판단하지 않는다. 실제 저장 레코드와 업로드 이미지 접근 여부를 확인한다. 비밀키를 채팅이나 Git에 넣지 않는다.

## 3. 표정과 상황

표준 표정 키:

| 이미지 키 | 의미 | 대표 이벤트 |
| --- | --- | --- |
| `default` | 기본 | `IDLE` |
| `attack` | 공격·시전 | `ATTACK` |
| `hurt` | 피격 | `HIT` |
| `heavy_hurt` | 강한 피격 | `HEAVY_HIT` |
| `low` | 저체력 | 지속 상태 `LOW` |
| `summon` | 소환 반응 | `SUMMON` |
| `surprised` | 놀람 | `ALLY_RETIRED` |
| `victory` | 승리 | `VICTORY` |
| `defeat` | 패배 | `DEFEAT` |
| `relief` | 회복·안도 | `HEAL` |
| `awaken` | 준비 완료·각성 전환 | `AWAKEN` |

`reactions`는 이벤트 이름을 이미지 키에 연결한다. 예: `HIT: "hurt"`. 이벤트와 이미지 키를 혼동하지 않는다. `low`는 별도의 공격 이벤트가 아니라 지속 상태다.

감정표현은 `HELLO`, `THANKS`, `WELL_PLAYED`, `SORRY`, `OOPS`, `THREATEN`을 지원한다. `emotes`는 표정 키에 매핑하며 특정 항목의 `null`은 해당 감정표현을 비활성화한다.

이벤트 판정은 `champion-sprite-events.ts`를 기준으로 한다. 현재 저체력은 생존 체력 1~5, 챔피언이 실제 입은 한 번의 피해가 5 이상이면 강한 피격이다. 타입에 남은 `lowHealth`, `bigDamage`, `majorCost` 같은 과거 필드를 바꾸면 현재 판정도 자동으로 바뀐다고 가정하지 않는다.

## 4. 이미지와 배치 구조

`frames[key]`에는 다음이 들어간다.

```ts
{
  url: "실제 업로드된 이미지 URL",
  self:     { scale: 1, x: 50, y: 35, flip: false, crop: false },
  opponent: { scale: 1, x: 50, y: 35, flip: true,  crop: false }
}
```

위 URL은 구조 설명용이다. 실제 저장에는 검증되는 업로드 URL을 사용한다. 예시의 반전 값은 고정 규칙이 아니며 아트 방향에 맞춰 관리자 설정을 존중한다.

- `self`와 `opponent`의 배치를 독립적으로 편집한다. 한쪽을 맞췄다고 반대쪽이 맞는 것은 아니다.
- 현재 파서는 scale 0.5~3, x/y 0~100을 허용하며 flip/crop은 boolean이다.
- URL은 파서가 허용하는 HTTPS PNG/WebP 또는 업로드 경로여야 하고, 서버 저장 시 에셋 검증도 통과해야 한다. 임의 로컬 파일 경로·data URL·GIF·MP4를 프레임 URL로 넣지 않는다.
- 이미지가 하나라도 들어 있는 세트에는 `frames.default`가 필요하다. 빈 편집 초안과 실행 가능한 완성 세트를 구분한다.
- 세트의 프레임 키는 최대 12개다. 임의로 수백 장의 애니메이션 프레임을 넣는 API가 아니다.
- 표정 이미지마다 인물 크기·바닥 기준·여백이 다르면 교체할 때 튀어 보인다. 캔버스와 인물 기준점을 맞추거나 표정별 self/opponent 배치로 보정한다.

기본 설정 뼈대:

```ts
const sprite = {
  version: 1,
  awakening: "KEEP",
  frames: { default: defaultFrame, attack: attackFrame, hurt: hurtFrame },
  reactions: { ATTACK: "attack", HIT: "hurt" }
};
// 저장 전에 parseBattleSprite(sprite) 결과가 null이 아닌지 확인한다.
```

## 5. 표시 우선순위와 누락 이미지 처리

`championSpriteSkin()`이 장착 외형을 고르고 `championSpriteCandidates()`가 이미지 후보를 만든다. `selectSpriteFrame()`이 현재 상태의 프레임을 고른다.

1. 해당 챔피언의 올바른 `CHAMPION_SKIN`이 장착되어 있으면 그 스킨의 설정·그림을 사용한다.
2. 장착 스킨이 없으면 챔피언 기본 `BATTLE_SPRITE`와 그림을 사용한다.
3. 선택한 피니셔 분기에 별도 외형이 있으면 그 분기의 설정을 반영한다.
4. 현재 세트의 표정 이미지가 없으면 현재 세트의 기본 이미지로 돌아간다. 이미지 로드 실패 시 후보 목록의 대체 이미지를 순서대로 사용한다.

중요: 스킨의 공격 표정이 없다는 이유로 기본 외형의 공격 이미지를 가져와 섞지 않는다. 각성 후 세트에서 표정이 빠졌다고 각성 전 표정으로 돌아가게 만들지 않는다. `champion-sprite-skin.ts`의 세트 분리를 유지한다. 기본 챔피언의 motion 설정은 기본 동작값으로 활용되지만 이미지 세트를 섞는 것과는 다르다.

## 6. 준비 완료·각성·피니셔 분기

- `awakening: "KEEP"`: 기존 세트를 유지한다. 별도의 `awaken` 프레임이 있으면 준비 완료 후 기본 외형 선택에 사용될 수 있다. KEEP이 모든 이미지 변화를 무조건 금지한다는 뜻은 아니다.
- `awakening: "REPLACE"`: `awakened` 세트를 사용한다. 검증 시 `awakened.frames.default`가 필요하다.
- 새로운 `CHAMPION_QUEST_COMPLETED` 이벤트가 오면 전환 연출 후 교체한다. 기존에 완료된 상태로 들어온 경기까지 전환을 다시 재생하지 않는다.
- `finishers[choiceId]`에는 `sprite`, `portrait`, `music`을 둘 수 있다. 런타임의 `selectedFinisherId`와 일치해야 해당 분기가 적용된다.
- 분기 sprite는 자체 default 프레임이 있어야 한다. `FinisherPresentationEditor`를 참고한다.
- 분기별 외형·음악은 표현 설정이다. 피니셔 조건·지급 카드·지급 방식은 `questCondition.finisher`/`finisherChoices` 등 전투 데이터가 담당한다. 이미지 편집 중 그 데이터를 덮어쓰지 않는다.
- `questCompleted`는 기존 준비 완료 표현 상태와 연결되어 있다. 모든 완료를 특정 챔피언의 규칙상 각성으로 단정하지 않는다.

## 7. 움직임과 전투 이벤트

`ChampionBattleActor`는 확정된 `GameState.events`를 커서로 읽어 새 이벤트만 표현한다. 경기 교체·이벤트 되감기에는 커서를 재설정한다. 타깃 선택 중 취소될 수 있는 미확정 효과로 표정을 먼저 바꾸지 않는다.

피격 표정은 실제 타격 접점에 맞춘다. `attackActive`인데 아직 `hitContact`가 없으면 해당 피격 반응을 보류한다. 단순히 체력 숫자가 바뀌었다고 모든 카드에 같은 타이머를 걸지 않는다.

`reactSprite()`에는 반응 우선순위·유지 시간이 있다. 승리/패배는 높은 우선순위로 유지되고 각성·강한 피격 등이 약한 반응에 즉시 덮이지 않는다. 반복된 동일 피격이 유지 시간을 계속 늘려 표정이 고정되는 것도 방지한다. 구체적인 수치는 라이브러리 구현을 읽는다.

`ChampionSpriteVisual` 및 `champion-sprite-motion.ts`가 위치 이동·회전·스케일·복귀와 표정 교체 시점을 처리한다. 모션 설정은 preset, movement, rotation, scale, speed, rebound, pivotX/Y 등을 지원한다. 프리뷰와 실제 전투가 같은 선택·움직임 로직을 사용하도록 유지한다.

이 연출 때문에 서버 판정·입력·턴 진행을 기다리게 만들지 않는다. reduced-motion 설정도 존중한다. 기존 챔피언 타깃 DOM/ref와 히트박스는 유지한다.

## 8. 관리·저장 API

관리자 작업실은 `AdminBattleSprites`/`BattleSpriteEditor`를 사용한다.

```text
GET   /api/admin/battle-sprites
PATCH /api/admin/battle-sprites/default/:championId
PATCH /api/admin/battle-sprites/skin/:skinId
```

PATCH 본문은 `{ revision, sprite }`다. revision은 GET 응답의 해당 대상 revision이며 챔피언 행의 숫자 version과 다르다. sprite는 검증 가능한 세트 또는 의도적인 삭제를 뜻하는 null이다.

- 서버는 읽은 설정의 revision을 트랜잭션 안에서 다시 확인한다. 409는 다른 편집이 먼저 저장됐다는 뜻이므로 다시 읽고 병합한다. 기존 값을 무시하고 강제 덮어쓰지 않는다.
- 기본 외형 저장은 `presentationLines` 전체를 교체하지 않고 `BATTLE_SPRITE`만 갱신한다.
- 스킨 저장은 `imageAssets`의 다른 키를 유지하고 `__battle`만 갱신한다.
- 같은 그림의 배치만 수정할 때는 서버가 이미 검증한 URL을 재사용한다. 새 업로드 URL은 에셋 검증을 받는다.
- 저장 응답을 받지 못했다면 성공했다고 단정하지 않는다. 다시 조회하고 `sameSavedSprite()` 등으로 실제 저장된 값을 비교한다.

## 9. 먼저 읽을 파일

| 파일 | 용도 |
| --- | --- |
| `lib/cosmetics/src/battle-sprite.ts` | 타입·검증·표정 선택·우선순위·타이밍 |
| `lib/cosmetics/src/champion-sprite-skin.ts` | 기본/장착 스킨/피니셔 분기 선택과 fallback |
| `artifacts/ko-game/src/components/champion-battle-actor.tsx` | 전투 상태와 화면 표현 연결 |
| `artifacts/ko-game/src/components/champion-sprite-events.ts` | 확정 이벤트를 반응으로 변환 |
| `artifacts/ko-game/src/components/champion-sprite-motion.ts` | 모션 종류·길이·키프레임 |
| `artifacts/ko-game/src/components/champion-sprite-visual.tsx` | 실제 이미지·모션 렌더링 |
| `artifacts/ko-game/src/components/battle-sprite-editor.tsx` | 관리자 편집·미리보기 |
| `artifacts/ko-game/src/components/finisher-presentation-editor.tsx` | 피니셔 분기별 외형·초상·음악 |
| `artifacts/api-server/src/routes/admin-battle-sprites.ts` | 저장·revision 충돌·에셋 검증 |
| `artifacts/ko-game/src/lib/sprite-save-policy.ts` | 저장 결과 비교 |

검증 시 참고할 기존 테스트는 `battle-sprite-policy.test.ts`, `champion-sprite-skin.test.ts`, `champion-sprite-events.test.ts`, `champion-sprite-motion.test.ts`, `finisher-sprite-presentation.test.ts`, `lib/db/qa/battle-sprites.test.ts`, `lib/db/qa/battle-sprite-workspace.test.ts`다. 전체를 무조건 실행하기보다 수정 범위에 맞게 선택한다.

## Claude에게 전달할 작업 원칙

> 챔피언 스프라이트를 새로 발명하지 말고 기존 BattleSprite 구조와 운영 관리자 설정부터 확인해줘. 기본 외형·장착 스킨·피니셔 분기를 구분하고 표정/각성 세트가 섞이지 않게 해. self/opponent 양쪽과 누락 이미지 fallback, 접점에 맞춘 피격, 저장 충돌을 검증해. 표현 작업으로 카드 효과·피니셔 조건/보상·대사·다른 스킨 설정을 바꾸지 마. 폐기한 옛 VFX는 복원하지 말고, 이후 인계된 현재 연출은 보존해. 오타나 모호한 요청은 사용자에게 먼저 확인해. 변경 전 Codex와 담당 파일을 나누고, 완료 후 변경 경로·커밋·검증 결과를 인계해줘.

# Sprite size, framed preview, threat reactions and drag repair

Feature branch only; no main merge. Frontend presentation/input changes; no combat rules, card/champion values, quest logic, ownership, rewards, or production DB writes.

## Administrator controls

Open **관리자 → 대전 스프라이트**, choose champion, skin, normal/awakened set, expression and own/opponent placement. Under **이미지 크기** use ±10%, numeric 50–300%, or the slider. Numeric entry applies on blur/Enter. **100% 초기화** resets the selected frame/side only. **양쪽 위치에 배율 적용** copies its scale to both sides without changing alignment, crop, or automatic opponent mirroring. Click **스프라이트 저장**.

A previous mismatch limited runtime/preview scale to 200% despite the existing sprite parser accepting 300%. Sprite rendering now explicitly supports 300%; normal card illustration limits remain unchanged at 200%. Each registered expression retains independent positioning and size. No source image is resized or replaced.

The preview uses the actual `ChampionPortraitFrame` component and shared arched aperture mask. Choose representative **모바일 390×844** or **PC 1440×900**, own/opponent side, normal/awakened appearance, placement or reaction preview. The frame, nameplate and health remain stationary while only the image moves. Cropped edges are visible while adjusting scale.

## Surprise conditions

The existing surprised expression is reused for committed opponent legendary wrestler entry, champion-token entry, printed/base-cost >=6 wrestler entry, printed/base-cost >=6 technique play, and opponent champion quest completion. Discounts do not change the base-cost category. Ordinary low-cost nonlegendary/nonchampion-token entry does not surprise. Existing own legendary RETIRE/DESTROY/VANISH reactions remain.

Uses actual public engine events/catalog metadata, same-skin/current-set fallback, existing priority and duration. Multi-entry effect IDs suppress duplicate reactions across snapshots. Cancellable targeting does not trigger surprise before commit; cancellation/reconnect do not replay it.

## Input and motion

Both hand and field information targets are 24×24 instead of an invisible 44×44 hand region. Short taps still open information; dragging from the information corner now starts the corresponding legal card gesture. Field attack drags show a pointer-following card clone, with original source dimmed. The clone cannot intercept input and is cleaned on commit, cancellation, resize, turn/game change or unmount. Legal field targets allow an 8px edge tolerance inside the opponent field only; server/engine attack validation is unchanged. Hand horizontal scrolling remains intact.

Pinned information no longer disappears when its layout moves under the mouse; explicit close/Escape dismisses it. ALT inspection remains.

Transient body motion is 1.8× stronger, with bounded displacement (28px horizontal/26px vertical), 5-degree tilt and 7.5% uniform scale cap. Distinct preparation/recoil/recovery profiles and reduced-motion settings remain. Portrait masks clip the decorative movement; HUD/input targets remain stationary. Measured at 390×844: spell peak 6.81px, ability 10.79px, heavy hit 20.06px (previous 3.78/6/11.14px). Idle breathing is deliberately unchanged.

## Validation

- 99 engine/sprite/motion/inspector regression tests passed; frontend typecheck/build passed.
- Actual admin UI at 390×844 and 1440×900: zoom limits/buttons, reset, per-expression isolation, both-side application, shared frame and save/reload. **Admin API persistence is mocked in this browser test**, not a production DB save test. Existing server sprite parsing of scale 300% is unit-checked; no new schema is needed.
- Actual shared battle UI and real local engine: opponent legendary/token/costly wrestler/costly spell reactions; ordinary summon ignored; current selected skin, 300% scale, surprised-frame-specific scale and return preserved; opponent automatic flip preserved. Quest browser case injects a confirmed completion event; engine quest rules are not modified or retested end-to-end here.
- Genuine CDP corner-start touch attack at 390×844/844×390 and mouse attack at 1440×900, including cancellation, illegal targets, explicit information, visible drag clone and cleanup (390/1440). Hand spell corner drags passed at 360×740/375×812/390×844/412×915/1440×900, including selection/use, cancel, target selection, invalid plays and horizontal hand scroll.
- Real battle motion at 390×844: 600 rAF samples, headless p95 16.8ms; stable HUD, reaction cleanup, ability, spell, heavy hit, low/result/reconnect and reduced-motion checks. This is not physical-device performance proof.
- Screenshots use explicitly temporary diagnostic sprite images. Final artwork composition, all champions/skins, real Android/iOS, new live two-client PvP and full separate tower/draft campaigns remain unverified. No static mockup substitutes for the executed local battle tests.

## Changed files

- `artifacts/ko-game/src/battle-presentation.css`
- `artifacts/ko-game/src/components/admin-battle-sprites.css`
- `artifacts/ko-game/src/components/admin-battle-sprites.tsx`
- `artifacts/ko-game/src/components/alt-inspector.tsx`
- `artifacts/ko-game/src/components/battle-attack-drag.tsx`
- `artifacts/ko-game/src/components/battle-card-drag.tsx`
- `artifacts/ko-game/src/components/battle-sprite-editor.tsx`
- `artifacts/ko-game/src/components/battle-viewport.css`
- `artifacts/ko-game/src/components/card-artwork.tsx`
- `artifacts/ko-game/src/components/champion-battle-actor.tsx`
- `artifacts/ko-game/src/components/champion-portrait-frame.css`
- `artifacts/ko-game/src/components/champion-sprite-events.test.ts`
- `artifacts/ko-game/src/components/champion-sprite-events.ts`
- `artifacts/ko-game/src/components/champion-sprite-motion.test.ts`
- `artifacts/ko-game/src/components/champion-sprite-motion.ts`
- `artifacts/ko-game/src/components/champion-sprite-visual.tsx`
- `artifacts/ko-game/src/game/cards/types.ts`
- `docs/qa/field-size-input-browser.mjs`
- `docs/qa/mobile-spell-drag-browser.mjs`
- `docs/qa/sprite-size-threats-browser.mjs`

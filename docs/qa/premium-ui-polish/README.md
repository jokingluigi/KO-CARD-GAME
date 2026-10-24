# Premium UI/UX polish — measured refinement

Dedicated branch `feat/premium-ui-polish`. No main merge, operating deployment or production DB access. Reuses the existing retro font, dark wood, beige fabric and matte black/gold. No engine, server, card frame, artwork, keyword/state indicators or combat animation logic changes.

## Diagnosis and priorities

| Priority / observation | User impact / principle | Change / risk / verification |
|---|---|---|
| High: catalog type and auxiliary buttons used small padding without a minimum touch target | Inconsistent aiming precision; Fitts's law | Minimum 44×44; wrapping type row; do not resize cards. Risk: overflow. Actual browser assertions verify minimum sizes and filtering still works. |
| High: deck type selection communicated visually by color only | Ambiguous selection; clarity | Add aria-pressed and underline using existing gold state. No new card keyword indicators. Assert selected type after reset. |
| Medium: search suppresses input outline without a matching group focus treatment | Harder to locate keyboard input | Existing search baseline changes gold on focus; minimum input height supports group target size. No search/filter logic changes. |
| Medium: unneeded reset action always enabled in default filter state | Redundant action / predictable feedback | Disable reset only when all four values are default; preserve visible label and existing reset behavior. Assert disabled state after resetting an active combination. |
| Medium: battle controls lacked a dedicated board focus treatment; settings close used small padding | Inconsistent control feedback/target size | Scoped gold focus ring, stationary pressed feedback, disabled cursor, settings-close 44px. Keyboard focus, actual open/close and document geometry checked. |
| Verified, preserve: central battle buttons already 44×44 and end-turn 82×44 | Unnecessary resizing risks touch/drag coordinates | Leave layout and button hierarchy unchanged. Before/after sizes identical. |
| Verified, preserve: shop/online/tower flows operated through existing controls | Avoid gratuitous redesign / cognitive load | Preserve layouts; exercise actual isolated purchase, matchmaking, rewards and deck swap. |

## Existing design system

Reuse board-bright/gold/panel/muted and existing catalog gold; NeoDunggeunmo typography and current card effect sizes. No blanket font or card-size change. Maintain existing panel spacing, 1px frames and skins. Only catalog control minimums and wrapping change geometry. Existing reduced-motion behavior stays intact; new states introduce no motion loop or transform-based press movement.

## Screenshots

Controlled battle fixture comparisons (placeholder art, same state and size):

| Width | Before | After |
|---|---|---|
|360|[Before](before-360.png)|[After](after-360.png)|
|375|[Before](before-375.png)|[After](after-375.png)|
|390|[Before](before-390.png)|[After](after-390.png)|
|412|[Before](before-412.png)|[After](after-412.png)|
|844 landscape|[Before](before-844.png)|[After](after-844.png)|
|1440 desktop|[Before](before-1440.png)|[After](after-1440.png)|

[Deck before](flows-before/owned-deck-390.png) / [after](flows-after/owned-deck-390.png); [collection before](flows-before/collection-filters-390.png) / [after](flows-after/collection-filters-390.png).

Additional actual UI captures: [shop](flows-after/shop-mobile.png), [deck detail](flows-after/deck-detail.png), [online](flows-after/presence-390.png), [quick battle](flows-after/quick-battle.png), [tower reward](flows-after/mobile-card-reward.png), [tower swap](flows-after/mobile-card-swap.png). These additional views are coverage captures, not fabricated before/after comparisons.

## Executed functional checks

- Full workspace typecheck and frontend/API production build passed.
- Compiled UI + isolated PGlite/HTTP inventory suite: seven groups passed, no page errors. Deck and collection combined ownership/rarity/tag/cost/search/reset, pack individual reveals, daily completion, administrator configuration and prism retry. Added assertions verify visible catalog targets >=44px, selected aria state and reset-disabled feedback. Layouts checked at widths 360/375/390/412/1440 (inventory height 844).
- Shop: actual administrator product creation/upload; player purchase and persistence; editable bought deck; mobile widths; actual AI and two-browser PvP entry passed. Initial attempt failed from occupied local port 5188; reran with isolated local 5388/5378, without production traffic.
- Online: self-excluded presence, duplicate tabs, reconnect, gray failure state; five widths; server 30s quick-AI transition, consistent nickname, surrender/result and AI reward receipt passed. First attempt timed out waiting for intro nickname; clean retry on stable build passed. No claim that first failure was a product fix.
- Tower: real local KO/result/reward/25-card swap passed. PvP: two authenticated browser skins/opaque backs/image emotes/reconnect/missing-image fallback and AI cosmetics passed. Draft: both browsers, frozen loadouts/emotes/reconnect passed.
- Real mobile touch spell drag passed at 360×740, 375×812, 390×844, 412×915 and 1440×900; PC hand suite passed 1920/1440/1366/1280/1024 widths with 1/6/10 cards, selection/hover, scroll and spell-use hit testing.
- Focus/settings script exercises six battle viewport sizes, keyboard focus, real settings close and stable document geometry. It correctly uses the dialog close button instead of clicking through a modal; geometry comparisons account for browser scroll rather than mistaking viewport scroll for layout shift. Final outcome is saved alongside final screenshots.

## Files

`components/battle-board.css`: board interaction states and settings-close target.
`index.css`: catalog minimum targets, selected underline, focus grouping.
`components/card-catalog-filters.tsx`: semantic group hook and default-state reset disable.
`pages/decks.tsx`: selected type aria-pressed.
`docs/qa/premium-ui-polish-browser.mjs`: focused keyboard/settings/geometry regression.
`docs/qa/quest-completion-features-browser.mjs`: actual catalog-control assertions.

## Limits and follow-up

No physical smartphone or live operating-account match; all browser sessions use isolated local fixtures. No user study or task-time/mistap study: this does not establish psychological satisfaction or faster human decision-making. All four exact mobile sizes are covered in battle/touch tests; not every modal in every nonbattle screen was tested at every height. Battle comparison fixture uses placeholder art; cosmetics tests separately verify skin identity and fallback, not an art-direction rating of every champion. Full keyboard focus trapping and screen-reader audit remain separate accessibility follow-ups. No production release is authorized or performed.

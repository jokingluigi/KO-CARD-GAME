# Requested physical card / champion / collection polish

Scope:1–28,30,32,34–40 (duplicate36 interpreted once).37 selected proposals,36 applicable;22 has no corresponding game state. Existing correct implementations were reused rather than duplicating flight/VFX/animation owners. Feature branch only; no main merge, API deploy, DB mutation or game/card/champion/economic rule changes.

## Exact scope mapping

| # | Actual implementation |
|---|---|
|1|Thin paper side/bottom edges on hand/drag/attacking copies. Original frames and hit boxes unchanged.|
|2|Selected hand card gets spacing from neighbors; hand remains horizontally scrollable.|
|3|Existing velocity-based drag tilt retained; no second gesture controller.|
|4|Drag shadow separation changes with lift distance; return uses current hand position.|
|5|Valid hovered summon slot has an inset pressed-cloth edge, without moving its target.|
|6|Existing invalid/cancelled drag's160ms flight back retained and tested.|
|7|Existing keyed hand FLIP and draw fade retained and tested.|
|8|Card detail opens from the clicked card position and returns toward its still-existing source on close. Radix portal mounting handled with bounded animation-frame retries.|
|9|Attack tilt follows lateral/vertical travel; physical contact remains from existing combatContact geometry.|
|10|Raw attack controls bounded windup distance, lean and scale. Confirmed damage still controls hit response, including blocked high-power attacks.|
|11|Counter badge only for actual defender damage from that declaration, bounded by next attack. No duplicate damage numbers or invented retaliation. Integrated in self/PvP/opponent animation construction.|
|12|Existing confirmed ARMOR cue now has distinct Kenney authored spark textures. Existing metal sound reused.|
|13|Existing confirmed BLOCK barrier/return behavior reused. Illegal immune targets do not fabricate damage or a successful hit.|
|14|Confirmed finishing-blow contact briefly dims only the decorative background, then restores it. No timer/network pause.|
|15|Red transfer on conservative, attributable lifesteal combat with actual healing. Full-health/zero-heal and ambiguous multi-source batches do not produce it. Public source card + BASIC_ATTACK/COMBAT attribution used; no image-based inference.|
|16|Card overkill gets a short explanatory label; authoritative damage numbers unchanged.|
|17|Confirmed GOLD_CHANGED spending sends an authored gold texture from resources toward the played unit/ability owner.|
|18|Actual gold increase has a transient fill from old to new fraction of the existing displayed turn-gold baseline. Numbers update immediately to confirmed values; no fabricated intermediate balances/pips.|
|19|Existing deck-to-hand draw flights retained; opponent cards stay concealed. Real END_TURN draw verified.|
|20|Existing RETIRE trajectory to actual graveyard retained. DESTROY/REMOVE/VANISH remain distinct; real lethal field combat verified.|
|21|Deck stack depth follows public remaining count, becomes flat/dashed when empty.|
|22|NOT APPLICABLE: no persistent destroyed-slot state/engine rule exists. A retired unit does not make its empty slot look permanently unusable.|
|23|Very low-opacity authored dirt/smoke textures move slowly at board edges; no global champion theme color. Reduced-motion hides them.|
|24|Small frame pendants use the actual chosen champion/skin art. Selection comes from existing cosmetics; no new inventory/shop system or bespoke weapon props claimed.|
|25|Confirmed target position directs the portrait's restrained gesture, including wrestler commands, without moving HUD/target boxes. Support cues still do not duplicate the attack VFX.|
|26|Existing HELLO/THANKS/WELL_PLAYED/SORRY/OOPS/THREATEN slots have differentiated small gestures and recovery. Existing expressions/priorities retained.|
|27|Existing speaking-frame emphasis gains a thin geometrically anchored tether to the speech bubble. Pointer-transparent.|
|28|Existing first/second-speaker dialogue schedule and specific champion interaction data retained. No new lines/timers duplicated.|
|30|Ability emphasis decays through a low-opacity tail before clearing; body recovery and gameplay duration remain independent.|
|32|On real intro unmount, public portraits make a280ms uniform-scale flight toward actual HUD apertures. Both skip and natural end verified. No per-clock DOM cloning or added input lock.|
|34|Validated add/remove in deck editor gets a small inert visual transfer between collection and actual deck list. Save payload unchanged.|
|35|Retained card search/filter results use keyed FLIP; no blanket disappearance/re-entrance. Deck and collection pages integrated.|
|36|Existing MotionNumber now animates confirmed collection quantity changes only, not all counts on initial render.|
|37|Owned champion/card skins have a large accessible comparison dialog with one shared image box and keyboard/touch range slider. Missing art does not produce invented comparisons.|
|38|Single real pack opening has a short skippable seal reveal after server-confirmed rewards. Preview/bulk fast paths preserved. No new purchase/open request.|
|39|Ordinary/epic/major card reveal durations220/360/520ms; existing rare reward scenes and reveal-all skip retained.|
|40|Confirming actual rewards sends at most six inert copies toward the collection-vault label. Preview does not pretend to grant cards; close callback remains immediate.|

## Assets and implementation

Existing Kenney Particle Pack CC0 files: `public/vendor/kenney/particle/spark_04.png`, `spark_01.png` (armor); `star_01.png` (gold/lifesteal transfer); `dirt_01.png`, `smoke_01.png` (edge ambience); existing `circle_03.png` for blocked results. License: same folder `LICENSE.txt`. Original card/champion/skin art supplies comparison/intro/pendants. No newly synthesized sounds or newly generated major VFX.

New common files: `physical-feedback.ts` (inert transfers, keyed grids, detail origin), `physical-card.css`, `battle-resource-feedback.tsx`, `skin-comparison.tsx`. Existing drag/attack/portrait/dialog/pack components and actual pages extended. Source changes are in the associated commit; no alternate demo implementation substitutes for production wiring.

## Validation

- Frontend typecheck and production build passed.
-142 component/policy/event/camera/combat tests passed. Added counter event boundaries, raw-power differentiation, emote recovery; updated confirmed-target assertions to verify gaze without duplicate attack effects.
- Actual shared battle in Chromium390×844 and1440×900: real engine turn/draw, gold spend/refill, summon, damage, lifesteal with real healing, no full-health drain, counterattack, armor/blocked external textures, RETIRE path and confirmed basic-attack finisher background hush. Existing six atmosphere effects still checked. Quest is a confirmed-event fixture, not an entire live quest campaign.
- Real cosmetics/collection/packs routes with mock API,390×844 and1440×900: comparison slider, search/clear/reflow, card detail, confirmed craft quantity, seal, individual reveal, reveal-all skip, close. Mock craft/open POST exactly once each; no production requests/writes. Initial browser checks exposed search clear label/hover collision and a test waiting for an already-consumed pack; corrected actual search control and fixture expectations, then passed.
- Real deck page with mock API at390×844,320×740,430×932,1440×900: add/remove, details, save and exact25-card payload retained.
- Hand info-corner drag test at360×740,375×812,390×844,412×915,1440×900 passed. Field info-corner drag/target/cancel at393×760 passed. Eight existing viewport no-scroll/portrait-ratio/emote-gold assertions passed.
- Intro missing/delayed image and skip regression passed at360/390/1440 widths. Actual intro + shared battle integration: skip at390/1440 and natural completion at390 produced two finite HUD flights and cleaned them up.
- Browser screenshots use explicit diagnostic art and mocked inventory. They prove integration/geometry; not a final champion-art review. No physical phone/GPU-FPS measurement, fresh live two-client PvP, full separate AI/draft/tower campaign, production admin mutation or controlled player study performed. Bulk pack fast path is preserved in code, not newly browser-tested here.

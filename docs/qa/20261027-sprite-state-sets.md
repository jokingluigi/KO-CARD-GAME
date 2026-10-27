# Champion sprite state/set extension — review only

Branch `feat/champion-sprite-state-sets`, based on the prior sprite implementation. No main merge or deployment.

## Implementation

Presentation metadata remains in the existing champion and skin fields. Old default-only manifests remain valid. A manifest now supports KEEP versus REPLACE awakening, a complete optional awakened set, persistent IDLE/LOW/VICTORY/DEFEAT mappings, optional self-damage override, disabled reactions, configurable durations and health/damage/retirement thresholds. Replacement requires an awakened default. Upload verification/preloading now includes both sets.

`selectSpriteFrame` is shared by the real battle actor and administrator preview. It chooses a set first, then persistent state, then an available enabled reaction. An absent reaction returns to that set's state/default; an awakened replacement cannot borrow an old normal expression. Runtime state never stores an image to restore later: timers clear only the transient event, so current low-health/awakening/outcome are re-evaluated. Winner/loser state overrides transient reactions.

Low-health threshold defaults to 5, following the existing critical-HP UI, and uses `getPlayerSurvivalHealth`. Large damage defaults to >=6 actual positive damage with known friendly source against the opposing player. Major ally retirement remains LEGENDARY or configured minimum definition cost (default 5); retirement is not merged with destruction/removal. Self-damage requires canonical `sourceContext.sourcePlayerId` evidence; no inference from filenames/effects.

HEAL is offered for an observed positive HP change in a fresh event batch, or a positive player-health STAT_CHANGED event. Damage zero never triggers HIT or BIG_HIT. Missing provenance skips conditional/large-outgoing attribution. Note the same-batch healing limitation below.

Priority is result > awakening > ability > hit/heal > ordinary. Hit bursts are coalesced; there is no backlog. Default durations: HIT 600ms, HEAL 700ms, ABILITY 900ms, ordinary 800ms, awakening 1500ms, with configurable 100–3000ms presentation windows. Existing engine, quest/reward/skin-ownership rules and battle target refs are unchanged.

## Administrator

In champion or champion-skin sprite editor:

1. Choose normal or awakened editing set; register default PNG/WebP before optional expressions.
2. Choose KEEP or, after registering awakened default, REPLACE.
3. Map persistent states and optional reactions; configure self-damage expression, enable flags, durations and thresholds.
4. Existing per-side/per-expression size/position/crop/flip controls remain independent for each set.
5. Preview awakening, low health and self-damage, play reaction buttons, and observe return to current state. Preview shares selection and priority/timing functions with battle.
6. Save through the existing champion/skin save button. Removing referenced expressions cleans mappings; removing awakened default resets mode to KEEP.

[Actual administrator save/re-entry/awakening preview](screenshots/20261027-sprite-state-sets/awakening-preview.png). The image is an explicit local fixture, not a final sprite.

## Executed checks

- Full typecheck/build.
- Sprite policy tests: 4 pass, covering old validation/priority, low-state return, replacement default isolation, missing awakened default rejection, self-damage override, disabled reaction fallback, timing and result precedence.
- Actual isolated storage/API suite: 24 pass, including prior champion/skin manifest save/load/removal and validation regressions.
- Shared real-battle/engine browser checks pass at 360×740, 375×812, 390×844, 412×915, 1440×900, 844×390. Existing attack/ability, diagonal placement and image fallback checks pass.
- Actual administrator browser: upload, per-side framing/flip, mapping, save/re-entry, awakened default registration, REPLACE persistence, low/awake preview, missing awakened HIT -> awakened default after timeout, and unregister pass.

## Remaining verification / limitations

No final sprite assets exist, so final expressions, very different silhouettes and alignment require asset registration and art review. The new condition matrix has not been exercised end-to-end on two authenticated PvP clients or full tower/draft matches. Burst damage, actual heal/zero-damage/self-damage combinations, live reconnect, orientation/input continuity and frame-level audiovisual synchronization were not exhaustively browser-tested; unit/shared checks are not reported as those tests passing.

Recovery inference from a positive fresh-batch HP delta is conservative but cannot identify an intermediate heal that is fully offset by damage in the same snapshot unless an explicit positive health event exists. Exact source-by-source healing classification remains a follow-up for such event batches; no engine event schema or battle rules were changed.

Set selection currently follows confirmed quest-completed state at awakening presentation start; it does not insert an extra wait or change the existing awakening animation timeline. Administrator preview shares selection/timing, not the full battle camera/VFX scene. Separate mobile-versus-desktop saved placement profiles remain unsupported, as documented in the prior sprite report.

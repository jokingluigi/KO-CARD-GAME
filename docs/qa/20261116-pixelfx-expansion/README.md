# PIXELFX expansion validation

137 baked PIXELFX library atlases and 140 presentation recipes. Source pin: `5294518ce7c72e48b6100a744596e0acf57f2826`. Exporter and library manifest contain the original effect IDs and hashes. MIT licenses/notices are retained. No gallery fonts or stock humanoid actor art is distributed.

Actual visible geometry determines scale; tall sprites fit the viewport rather than being clipped. Desktop canvas max 1400 CSS px, coarse pointer max 900 CSS px; existing DPR budget retained. Only four common effects preload. Image promise cache is bounded to 12 on coarse pointers / 32 on desktop. Other assets load on demand: the 23,149,991-byte library is not fetched at startup.

The global decorative channel allows 6 scenes (3 at LOW quality), at most two atlas layers per scene. High priority finishers/results displace ambient scenes; ambient effects cannot evict them. Timers, resize, hidden tabs and preference changes clear scenes. There are no engine calls or input locks in this channel. Gameplay/presentation completion times are unchanged.

Confirmed battle cues and public instance deltas drive effects. Opponent hidden zones are not scanned for artwork, draw outcomes or random candidates. First snapshot and identical snapshots do not replay events. Actual attack contact continues through the established combat director; leave effects use the existing leave animation. Numeric feedback omits a second hit for physical combat. Champion families and finisher names select dedicated motifs, with actual damage/heal/spawn results remaining separate confirmed effects.

`coverage.json` records the hook family for each recipe; a hook binding is not proof that every live content combination has been played. All 140 recipes were separately rendered and checked for visible pixels in desktop and true coarse-pointer browser contexts. Live end-to-end tests cover ordinary attack, heal, pack seal/normal/epic/legendary reveal, crafting, stun, countdown, capture and release; all 11 champions and 12 finishers have not been played through against a live server as part of this check. Other special bindings use state deltas and source metadata and require live content verification. No claims of 140 distinct fully playtested gameplay outcomes are made.

Checks:

- `pnpm --filter @workspace/ko-game typecheck`
- `pnpm --filter @workspace/ko-game build`
- 13 existing combat timeline/geometry/preference tests.
- `node docs/qa/pixelfx-expansion-browser.mjs`: 140 recipes desktop and touch portrait; input passthrough; true coarse-pointer branch; actual attack/heal; concurrency, cleanup, flash zero and reduced motion.
- `node docs/qa/pixelfx-expansion-behavior.mjs`: initial/identical snapshot baseline; stun/countdown/capture/release; actual pack opening and crafting components; missing image fallback; touch landscape.
- All 137 PNG hashes, dimensions, nonempty alpha, and transparent final frames verified. All recipe effect IDs resolve.

Browser logs/screenshots are in local `qa-results/pixelfx-expansion/`; summarized results are checked in beside this report. Physical phone and live multiplayer content matrix: not run.

A separate touch smoke test (`node docs/qa/pixelfx-settings-smoke.mjs`) opens the actual settings route without visiting a battle, verifies all 140 options, visible pixels and a fixed, noninteractive overlay. Essential canvas positioning is inline so lazily loaded battle CSS is not required.

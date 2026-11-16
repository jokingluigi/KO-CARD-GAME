# PIXELFX expansion implementation

Authorized: implement the complete 140-area plan, including scale correction, full library-backed battle rendering, 11 champion and 12 finisher recipes, collection/rewards/modes/UI, validation and deployment. Do not change game rules or trigger engine actions from visual callbacks.

Plan: docs/design/pixelfx-expansion-20261116.md. Inventory: scripts/vfx/expansion-inventory.json.
Current production: 4a54033b4282d210a79c8b3a55e73798e93a9124 (4 custom effects).
Upstream pin: 5294518ce7c72e48b6100a744596e0acf57f2826, checkout /workspace/shared/pixelfx-source.

Implementation checkpoints:
- [x] Export full referenced library with transparent actors, content bounds, content hashes and license.
- [x] Size-aware renderer, recipe registry, layered bounded global director and lazy loading.
- [x] Battle presentation and special mechanics wiring, champion and finisher compositions.
- [x] Out-of-battle pack/crafting/rewards/modes/UI hooks.
- [x] 140-area coverage audit with concrete hooks; do not count config-only entries as implemented.
- [x] Desktop + true touch/mobile + accessibility + failure/performance tests.
- [ ] Production release and asset verification.

Preserve preexisting untracked QA/video directories. No agents were requested; work without delegation.

Validation: 137 SHA-256 matches and transparent tails; all 140 preview recipes have visible pixels on desktop and true touch browsers. Actual combat/healing, pack tiers, crafting, status/capture/countdown, replay baseline, budget, cleanup and asset-failure fallback passed. Live content combinations for all champions/finishers remain unplayed; see docs/qa/20261116-pixelfx-expansion/README.md.

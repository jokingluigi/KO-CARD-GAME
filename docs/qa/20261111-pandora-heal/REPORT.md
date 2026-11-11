# Pandora pinfall healing source — 2026-11-11

The ordinary global pinfall path did not automatically heal Pandora. However, her `PANDORA_DAMAGE` loop searched for any exact retirement of the selected target during the damage chain, regardless of which card actually caused it. An isolated fixture reproduced an incorrect 15→17 heal when Pandora only hit a target from 2→1 and a reacting pinfall card caused the final 1→0 retirement.

The healing condition now checks the retirement's actual card source against Pandora's ability proxy, the correct player, Pandora's stable champion ID and ability action, and the same root resolution when available. Shared identification is factored into `isPandoraAbilitySource`; generic pinfall eligibility remains unchanged. Other cards' pinfalls can still contribute to the existing preparation rule but cannot invoke this ability's 2-health heal. Other healing effects and lifesteal are not modified.

## Actual verification

- Before patch: the new nested-source regression failed as expected, showing health 17 instead of 15. Ordinary physical/effect pinfalls already did not auto-heal Pandora.
- After patch: **149 engine/content/champion checks passed**, including legitimate Pandora exact kills, multi-target/ally healing, ordinary physical/effect pinfalls without ability healing, nested pinfall denial and the existing source-rule tests.
- **6 actual PvP service/persistence checks passed** in isolated PGlite. The added nested-source scenario keeps health at 10, agrees for both sanitized viewers after reload, and duplicate confirmation cannot award healing. Existing genuine Pandora kills still heal correctly.
- `pnpm build` passed including type checks.

No new production cards, stats changes, schema changes, Production DB writes or production matches. Browser UI playback was not rerun in this turn because only the source check changed; both-view service serialization and persistence were exercised.

Changed files: `artifacts/ko-game/src/game/engine/balance-effects.ts`, `artifacts/ko-game/src/game/engine/pinfall.ts`, `artifacts/ko-game/src/game/engine/pinfall-sources.test.ts`, and `docs/qa/balance-content-20261111-service.test.mjs`.

Deployment receipts will be added after API-first/frontend-second release. Main is not merged.

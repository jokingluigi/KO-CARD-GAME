# Grade-only token leakage and Sovereign investigation — 2026-11-12

Production data showed Guild Receptionist using STANDARD random generation, while Werewolf Pandora had `rarity: TOKEN` and both token booleans false. STANDARD, collection SQL and deck validation previously checked only booleans. This allowed an ostensibly token-grade transformation card into ordinary generation and, if owned/unlimited, deck construction. Earlier random-scope tests did not include this inconsistent grade-only case.

## Changes

- Shared `isTokenCard` recognizes TOKEN grade or either token flag. Used for STANDARD catalog generation, deck save/resolve/AI validation, test/admin unlimited eligibility and client browsing/deck guards. FULL generation remains inclusive; existing field targets remain valid in both scopes.
- Published runtime card definitions normalize TOKEN grade to `isToken: true` without rewriting stats/effects or granting champion-token protection.
- Collection/deck-option/prism/pack queries reject grade-only tokens alongside existing flag checks. Admin card saves normalize TOKEN grade to its token flag to prevent recurrence.
- Werewolf Pandora's token flag was repaired through the authenticated administrator API. All other stored fields were compared and preserved (except automatic version/update timestamp). See `admin-repair-receipt.json`. No ownership rows/decks were deleted. Existing decks containing the card are invalid and must remove it before selection/play.

## Verification

- Focused engine/HTTP/tag/absorption regression: **48/48 pass**. Actual live-record Guild effect tested across 100 seeded, serialized entry resolutions; stale false-flag token excluded from STANDARD, included in FULL. Actual disposable SQL/HTTP proves owned token hidden from collection/options, forged deck save rejected, existing deck invalid/unselectable, ordinary deck valid, AI validation rejects token, admin save repairs flag.
- Historical Guild Receptionist/Desert Trader creation tests: **2/2 pass**.
- Collection/deck real UI with deliberately malformed old API card data: 390×844, 844×390, 1440×900. Owned grade-only token absent and unsearchable; normal card remains visible. Isolated HTTP fixtures, not production browser writes.
- Shared library, API and frontend typechecks and both production builds pass. `git diff --check` passes.
- Broader old-content run: **350/351 pass**. The old `Lord returns ...` test also fails under a control restoring the previous token-generation/definition rules (`lord-preexisting-control.log`); no unrelated Lord effect was changed. This existing failure is not reported as a pass.

## Sovereign report

Current public Sovereign version 2 text and 4/6 base stats were checked. **Seven tests pass**, covering repeated combat, effect damage and forced retirements across JSON restoration: maximum health 6→4→2→no further revival. A real +2 HP buff yields 8→6 when dying without a kill. Simultaneous ordinary kill adds its printed +1/+1 (6→5); Demon kill adds another +1/+1 (6→6, or buffed 8→8). This reproduces an unchanged maximum HP while still applying the revival penalty. The user's exact opposing card remains unconfirmed; no Sovereign balance/effect change was made based on that assumption.

No claim of physical-device testing or live production FPS. Only the explicitly requested Werewolf Pandora metadata was edited in production through the existing admin route; other token-grade records are protected by code rather than mass database edits. Release verification is recorded separately.

# Calavera and existing catalog settings checkpoint

User clarified that both Purple Rain and La Calavera must be written into the existing administrator champion settings, then tested from stored settings.

Migration 0029 edits only exact existing named champions (optional 챔피언 prefix/whitespace) and exact existing 좀비 wrestler tokens. It stores original complete records in ko_catalog_patch_backups before editing, increments version, and runs only once per existing row. IDs, ability costs, portraits, audio, status and unrelated rows are preserved. Subsequent admin edits are not overwritten on restart. No champion record is newly created. Server startup applies this migration transactionally after existing schema installation.

Purple Rain: actual stored base/upgraded effects, texts, eight-hit self-effect damage quest and upgrade reward. Shared schema/save validation accepts the explicit branching flag. Runtime reads persisted flags; legacy name repair remains only for old configurations.

La Calavera: cost-one 1/1 zombie summon, ten actual allied wrestler retirements (DESTROY excluded), upgraded cost-one 2/2 summon. Existing allied zombie receives incoming current attack/health instead of a second entry, including full fields and hand summons. Living unsilenced zombies on either side gain +1/+1 when another wrestler retires; dead/newly-entered zombies do not grow from their own/earlier retirement. Event-index deduplication prevents listener replay growth.

Passed: 394 combined shared engine/actions/effects/champions/Tower tests (including six Calavera and ten Purple Rain), 17 card tests, 79 structured configuration tests, isolated catalog persistence/reload/engine execution test and two startup installation tests. Type checks and frontend/API production builds passed.

Operational verification remains OPEN: direct production DB connection returned EAI_AGAIN. Browser root rendered server connection loading; Render wake-up interstitial appeared on an initial API navigation. Correct /api/healthz subsequently returned net::ERR_BLOCKED_BY_CLIENT (WORK_BROWSER_FAILURE). Production DB application, administrator UI values and actual browser matches cannot be marked PASS until observable. New matches use newly stored definitions; existing match snapshots keep previous definitions.

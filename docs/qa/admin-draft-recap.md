# Admin draft, match highlights and MVP

Status: UNVERIFIED (browser/mobile interaction and production deployment pending). No production settings, account collections, or card/champion catalog rows were changed. Existing EPIC work at 049efba is preserved.

## Implemented behavior

- `/admin/draft` is accessible only to ADMIN. Every `/api/admin/draft` route independently checks the authenticated role. The ordinary main menu has no draft entry.
- Global ON/OFF is stored in `draft_settings`; default OFF. ON still admits only admins. OFF refuses session/gameplay operations while preserving session data.
- Champion 1-of-3, then 25 card selections from up to three distinct legal candidates. Published definitions only; tokens/champion tokens and excluded definitions never appear as offers. When a nearly exhausted pool has fewer than three distinct legal candidates, it uses the available candidates without duplicating offers or trapping the last picks.
- Fixed technique slots default to 5/10/15/20/25; legendary preference slots 8/18 fall back when three eligible legends are unavailable. Existing NORMAL 3 / EPIC 2 / LEGENDARY 1 and legendary total 3 rules come from the shared helper. EPIC has no total limit. Remaining type/copy capacity is checked for every offer.
- AI independently drafts from the same offers using configured card scores, stats, champion/deck tags and cost curve. It does not use existing AI deck presets. AI drafting has no time limit.
- PvP uses an invitation room ID between two admins, pairs before independent simultaneous selection, hides opponent selections and reveals only progress. Default timers: champion 45s, card 25s, review 30s. Timeout auto-picks via draft AI and auto-readies. There is no public matchmaking queue in this admin-only release.
- A persisted catalog/config/seed/history/offers snapshot prevents rerolling or live admin catalog edits from changing an existing draft. Advisory transaction lock, expectedVersion, request IDs and the participant primary key prevent double picks and multiple active drafts.
- Existing engine handles intro, mulligan, card/champion effects, AI actions and combat. Server timer worker handles disconnected draft timers and combat turns. 60s without a client heartbeat forfeits a combatant; reconnect before then restores the snapshot.
- Temporary draft decks use their own tables and never create ordinary deck or ownership rows. Battle dependencies, including DRAFT champion tokens and transformations, remain available without appearing in selection offers.
- Existing configured match win/loss currency rewards and daily quest processing are reused. Before-battle abort has no reward. Reward idempotency prevents repeated grants.
- Review includes deck list, cost curve and tags. End summary includes both draft decks, champions and notable events. Pool exclusions and advanced timing/weight/AI/tag settings are editable by admins.

## General result highlights and MVP

AI and online result overlays (including draft combat) display the shared match recap. Tower is excluded. This is an event summary, not a video/replay player.

MVP score: opposing damage recorded for a revealed wrestler instance + enemy wrestler retire/destroy count × 5. Ties: damage, kills, first contribution, stable instance ID. Techniques, directly deployed champions, self-damage, blocked zero damage and never-revealed hand cards do not win wrestler MVP. Re-entered instances can earn additional kills; repeated death records without re-entry are counted once. Score does not change match rewards.

Online terminal snapshots/messages carry a server-calculated recap. Both seats receive the same MVP. Hidden-zone transformed card metadata is not revealed; an already revealed contributor currently in a hidden zone uses a generic name. Up to three highlights prioritize actual finishing damage, surrender/fatigue ending, champion quest completion, then largest opposing hits. A surrender after earlier non-lethal damage no longer falsely plays the final-hit cinematic.

## Storage and migrations

`0037_admin_draft.sql` only adds `draft_settings`, `draft_sessions`, `draft_participants` and inserts a missing default OFF row. Startup includes the migration. Repeated execution preserves ON settings, sessions, ordinary decks and original catalog rows. No recap migration is necessary; existing persisted battle events reconstruct the recap.

## Validation

| Check | Status | Evidence |
| --- | --- | --- |
| Existing DB/API regressions plus draft integration | PASS | 76 tests; EPIC, tower, rewards, packs and original AI 100-match test included |
| Final draft/domain/online regression selection | PASS | 44 tests, including 1,000 complete offer simulations, scarce pools, legendary fallback and dependency validation |
| Highlights/MVP and final draft integration | PASS | 17 tests, including 5 full HTTP-driven AI draft battles, ordinary online terminal messages, privacy, fatigue/surrender, retaliation, duplicate deaths and hidden transforms |
| TypeScript shared build, API and frontend checks | PASS | All three commands exit 0 |
| API production bundle | PASS | esbuild succeeds |
| Frontend production bundle | PASS | Vite succeeds; existing chunk-size/sourcemap warnings remain |
| Original NORMAL/EPIC/LEGENDARY data | PASS | Existing rows preserved in isolated migration/regression tests |
| Administrator and ordinary account API authorization | PASS | 401 anonymous / 403 non-admin, including direct gameplay requests |
| Browser interaction, actual mobile layout and animations | UNVERIFIED | WORK_BROWSER_FAILURE: work browser blocked localhost preview with net::ERR_BLOCKED_BY_CLIENT; automated API/type/build checks do not replace visual QA |
| Deployment and live administrator draft play | UNVERIFIED | This patch is not deployed; mode defaults OFF |

Operational check during implementation: production `/`, `/api/healthz`, `/api/cards`, `/api/auth/me` returned 200; `/api/server-status` returned enabled=false, allowed=true. No production mutation was made.

Earlier full-suite baseline failures are documented in `epic-rarity-patch.md`; unrelated game behavior was not changed to satisfy them.

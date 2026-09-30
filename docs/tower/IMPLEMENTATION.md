# Tower implementation checkpoints

The user supplied the final Tower specification on 2026-09-30. Completion requires all specified flows, 24 relics, mobile flow tests, real persistence/reward tests and existing-mode regression. An unverified item is not a pass.

## Pre-flight findings

- `@workspace/game-engine` is a server-safe adapter exporting the existing browser engine. Tower must call the same `createInitialGameState`, `startGame`, `executeAction`, and `getLegalActions`.
- GameState already serializes its random seed, pending targets, listeners, and quest event cursors. Explicit RNG is required for opening shuffle; structured effects use the state seed.
- The four board slots are fixed. Tower field caps must be checked both for hand plays and effect-based entries, before paying/removing cards.
- RETIRE occurs in combat and structured effects and resolves leave/listener effects. DESTROY has a separate path and removes the card without leave triggers. Relic survival must intercept before retirement, not resurrect afterward.
- Champion ownership is `user_champion_collections.owned`. Tower starter cards do not require collection ownership.
- Account decks have 25-card and Legendary restrictions. Tower decks have an independent 25-card requirement; replacement must not mutate account decks or collections.
- Reward service accepts CARD, PACK and CURRENCY, using a unique idempotency key inside a caller-supplied transaction. Tower first-clear reservation, reward and run transition must share one transaction and user lock.
- DB uses Drizzle/Postgres with additive SQL migrations. Existing rows must not be rewritten for Tower.
- Admin is a tabbed page; player navigation is Wouter. Existing battle presentation can be reused through an adapter, without another combat engine.
- Current AI evaluates actual legal actions through engine simulation. Sequence search must conceal enemy hand/deck identities rather than simulating with privileged knowledge.
- Mobile deck editor needed `minmax(0, 1fr)` to prevent intrinsic overflow. Tower uses independent responsive CSS, readable controls, safe-area padding and internal dialog scrolling.
- User supplied the production DB connection separately. Read-only connection attempts failed with DNS `EAI_AGAIN`, including an escalated attempt. No SQL reached production and no credentials are stored in the repository. Live database, migration and real account reward tests remain UNVERIFIED until a disposable database is available.

## Architecture decisions

Tower configuration and run data live in new Tower tables. A run snapshots its season/configuration so updates do not reroll or corrupt a running adventure. New runs use current admin settings. Seeded choices are stored as well as generated deterministically. Versioned transitions reject stale double-clicks. Battles remain server-authoritative; submitted wins are not trusted. Continue restarts a battle from its saved initial state/seed.

Feature flag defaults OFF. An incomplete phase is not enabled in production. Work branch: `feat/tower-mode`.

## Required checkpoints

1. Analyze + baseline regression.
2. Typed configuration, run reducer, seed/eligibility/hidden conditions, additive DB schema.
3. Transactional persistence, authoritative battle API and reward idempotency.
4. All 24 relic hooks + field/action caps + HP safety + individual/combination tests.
5. Owned champion selection, rewards/replacement, battle presentation, dialogue and result.
6. Admin configuration, uploads, structured rule/reward selectors, isolated test runs and diagnostics.
7. AI difficulty/sequence improvements with information restrictions.
8. Complete Tower/mobile/API/DB/regression verification and final report.

## QA status

Status is tracked per checkpoint. PASS requires executed tests; code inspection alone is not sufficient. Full Tower release: IN PROGRESS.

### Foundation checkpoint — 2026-09-30

- PASS: 7 run-domain tests, including seeded choices, owned champion restriction, 25-card replacement, all 16 floors, three relic selections, hidden win/loss and condition TRUE/FALSE cases.
- PASS: 5 configuration/input tests, including forged client victory rejection, bounded condition groups, supported reward quantities, sprite resource validation and deck/relic numeric limits.
- PASS: 2 actual shared-engine battle tests: identical initial hands/deck after serialized reconnect, simultaneous mulligan, full legal-action match through FINISHED and identical final state on replay. These use QA fixtures, not production card data.
- PASS: DB/game-engine declaration builds and API TypeScript check after adding the transactional store and catalog loader.
- IMPLEMENTED / UNVERIFIED: transactional run creation with actual ownership query, optimistic version/account locking, immutable configuration snapshot, initial-battle restart, first-clear/reward/receipt atomic settlement and test-run exclusion.
- IMPLEMENTED / UNVERIFIED: server action adapter and Tower route module. Router is deliberately not mounted yet; no production player can enter an unfinished battle.
- NOT IMPLEMENTED: 24 relic engine hooks, difficulty/sequence AI upgrade, player UI, Tower admin UI/test tools, full mobile flows.
- UNVERIFIED: migration apply, actual persistence, account rewards, retry/race cases and full existing-mode regression.
- Baseline existing engine suite before any Tower engine modification: 35 file suites, 32 pass, 3 fail (`deck-system.test.ts`, `draw-card.test.ts`, `ko-mechanisms.test.ts`). Direct deck-system run: game-start effect test expected attack 4, observed 2. These are pre-existing failures, not marked fixed.

This checkpoint is development progress, not a release or completion report.

### Administrator single-battle diagnostic

Added `/admin/tower-test` and a test entry in the existing admin navigation. Administrator chooses floor, seed, both champions and exactly 25 published eligible cards per side. The battle uses shared Tower initialization, existing game presentation and the existing AI scheduler. Browser session storage contains only test setup. No Tower/AI reward API is called, no account deck is saved and no clear record is written.

This tool does not yet test relics, difficulty profiles, season stories, hidden conditions or reward issuance. Those limitations are shown before launch. A separate deployed test URL is not available yet. Real-browser/mobile tests remain UNVERIFIED.

- PASS: 2 sandbox tests covering invalid setup rejection, unavailable card rejection, reconnect determinism and complete real-engine battle without setup mutation.
- PASS: frontend TypeScript check and production Vite build.

### Relic entry/cost checkpoint

Implemented and engine-tested 6/24 relic types: 왕의 자리, 소수 정예, 선봉장의 깃발, 입장권, 폭주 티켓, 빈자리의 왕관. Administrator sandbox can force up to three of these supported types; unsupported relics are rejected. This remains a diagnostic, not a complete Tower release.

- PASS: 11 individual/combined engine tests for entry buffs, field caps, real legal actions, cost discounts, turn summon restrictions, Rush attack suppression without active suppression, temporary buff expiry, opponent-turn summons, turn-end summons and HP-floor utility.
- PASS: blocked SUMMON_FROM_HAND/REVIVE retain their source-zone cards.
- PASS: 3 administrator sandbox tests including real battle completion, setup isolation, supported relic application and unsupported type rejection.
- Existing engine regression repeated after shared hooks: 35 file suites / 32 pass / same 3 baseline failures. No newly failing file suite, but overall regression remains FAIL until baseline issues are resolved and full QA completed.
- Remaining 18 relics, full run integration and real browser/mobile validation remain NOT IMPLEMENTED / UNVERIFIED. No feature flag enabled, no production database write and no paid deployment performed.

### Resumed checkpoint — 2026-09-30

Original branch and commits preserved with `backup/tower-resume-987e41d`. Remote checkpoint c8e596f and local checkpoint 987e41d were both inspected. The screenshot reports later work, but its source changes were not present in accessible repositories or reflogs. Original user MASTER SPEC is now retained in MASTER_SPEC.txt.

- Added remaining 18 structured relic handlers, live aura recomputation, deterministic leftmost leader ties, one-use survival, bounded turn draw triggers, quest hooks, combat and effect damage reduction. Existing six entry/cost relics retained. Run battle initialization now actually attaches acquired relic values from the immutable snapshot.
- PASS: 44 Tower tests, including actual combat, structured DAMAGE/RETIRE/DESTROY, individual and combined relic rules, quest completion and reconnect determinism.
- FIXED → PASS: three previously failing engine tests. GAME_START and CARD_DRAWN are dedicated timing windows, exempt from the generic ongoing hand-trigger gate. Ordinary hand TURN_START/TURN_END gating preserved. Full pre-AI engine regression: 319/319.
- Added bounded NORMAL/HARD/BOSS same-turn search using the existing AI. Opponent hand and both deck orders are masked during evaluation. PASS: four dedicated immediate/multi-action lethal, hidden-information invariance and missing-HP healing tests.
- Frontend, shared engine/DB declarations and API type checks passed before the AI change; checks rerun after each next checkpoint.
- Remaining: full player/admin/run presentation, wider AI scenario matrix, real API/DB reward and persistence verification, mobile browser flows and final regression. Release remains IN PROGRESS. Feature flag not enabled; no production DB mutation.

### Player/admin integration and isolated PostgreSQL QA — 2026-09-30

- Added player Tower route and server authority, owned-starter selection, deck/reward replacement, dialogue, relic choices, normal/hidden results and persisted boss-reward receipts. Feature availability defaults OFF and the main-menu entry is conditional.
- Added structured admin configuration for seasons, boss rewards, presets, starters, relic numbers, story characters/eight sprite expressions, ordered dialogue and synergy metadata. Tower image references are retained by existing image cleanup.
- Added administrator test runs using the same engine and SQL persistence: chosen floor/seed/preset/relic combination and forced hidden encounter, with separate `isTest` records. They cannot grant rewards or enter account clear history. Existing runs/records are preserved on administrative closure, which now serializes with battle settlement and prevents stale writes from reopening the run.
- PASS: 11 isolated PGlite PostgreSQL tests running actual Drizzle schema/migration, store and shared-engine actions. Includes additive migration twice with sentinel preservation, ownership/concurrent creation/version checks, immutable reconnect, first/repeat CARD/PACK/CURRENCY issuance, atomic failure rollback, test isolation, closure, full 16-floor + hidden run, nine distinct relic candidates, dialogue cursor/skip and hidden-loss preservation.
- PASS: HTTP QA through real Tower/admin routers and existing session verification on disposable PostgreSQL. Covers creation/challenge/action parsing, stale conflicts, deterministic restart, real engine + AI battle to card reward, opponent hidden-card render projection and diagnostic access isolation. Uses QA fixtures, never production catalog or DB.
- HTTP QA exposed and fixed the incorrect client `playerId` action field. Frontend now reuses the strict wire payload and existing online-game-state render projection rather than treating hidden zones as card arrays.
- Added request timeout/reload handling and snapshot-first resume. Dialogue keeps the last left/right speakers with neutral expression fallback. Tower uses existing own-play and attack presentations, queues attack animations, and holds final settlement for presentation. These presentation changes are TYPECHECKED but not browser-verified.
- PASS: 367 existing game/shared Tower tests repeated after diagnostic domain changes, frontend/API type checks and Vite build. Remaining presentation changes require a fresh final build/check.
- WORK_BROWSER_FAILURE: cloud browser rejected `http://localhost:4173/qa/session` with `net::ERR_BLOCKED_BY_CLIENT`. No mobile, screenshot, actual browser play or visual behavior is marked PASS. The local QA harness can be run with the installed tsx loader and `lib/db/qa/tower-preview.ts`; `--smoke` runs HTTP checks and exits.
- Still IN PROGRESS: actual browser/mobile flows and emote bounds, animation/audio synchronization, wider AI strategic scenarios, production-data compatibility/read-only QA, exhaustive admin GUI interaction and final integration with the remote checkpoint. No merge, force push, deployment or production DB/config modification performed.

- Further AI QA: added public lethal-threat survival, bad-trade avoidance, RETIRE/DESTROY threat targeting and actual Tower field-cap legality across NORMAL/HARD/BOSS. Survival initially FAILED (the AI chose nonlethal face damage while exposed to lethal); fixed visible unguarded lethal-threat penalty. Dedicated AI scenarios: 9/9 PASS. Guard trade lines, resource/draw/buff/quest strategy and larger action-order scenarios remain pending.

### Permanent unlock checkpoint

- Added additive/idempotent `0027_tower_unlocks.sql`: only Tower unlock records, without permanent combat stats or changes to existing account/deck/card tables.
- Conditional relic/alternative-starter unlocks are earned atomically with saved progress, persist across subsequent condition/config changes, and are excluded from administrator diagnostics. Repeated writes skip already-earned entries.
- PASS: isolated PostgreSQL integration now 12/12, including both migrations twice, earned starter reuse after a changed condition, and no diagnostic unlock records. API/shared DB declaration type checks passed.
- Deployment requires both Tower migrations. Neither has been applied to production here.
- Remote backup push of checkpoint `4b77cf7` was rejected by automatic approval review because a new remote branch/source transfer lacked explicit authorization. No retry/bypass performed. Local commits remain intact; remote preservation is BLOCKED pending authorization.

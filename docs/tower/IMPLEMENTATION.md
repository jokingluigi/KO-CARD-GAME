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

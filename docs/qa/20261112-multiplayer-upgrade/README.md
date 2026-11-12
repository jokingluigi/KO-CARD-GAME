# Multiplayer, catalog filters and presentation — 2026-11-12

Branch: `fix/multiplayer-action-latency`. No main merge. Production release receipt is recorded separately after live verification.

## Implementation

- Negotiated catalog protocol v1: full catalog on subscription/resync; subsequent states carry versioned definition changes only. Legacy clients still receive full snapshots. Missing bases request an authoritative resync; actions are never automatically replayed.
- Request snapshots share recursively frozen catalogs; dynamic battle state remains independently cloned. Slow sockets coalesce obsolete accepted states while preserving all acknowledgement IDs and sequenced events. Oversized/stalled send queues reconnect for a current snapshot.
- Eligible single-target spells/abilities use local target preview and one atomic commit request. The server revalidates and pays costs once. Unsupported effect shapes retain existing targeting. Immediate pending-card indicator changes no battle result.
- Daily/season account progress uses a durable transactional outbox; champion preparation remains synchronous. Jobs capture event-time configuration, dates and event offsets; processing is ordered per user and retried atomically. Reading/claiming rewards flushes outstanding work. Migration 0058 is additive and runs through normal startup; no manual production SQL.
- Maintenance read singleflight/cache (one second; immediate invalidation on admin changes). Bounded runtime metrics and authenticated `/admin/multiplayer-performance` UI show processing, acknowledgement, frame gap, heap, backlog and outbox measurements.
- Deck editor/collection expose always-visible **등급으로 보기 / 태그로 보기** selectors using the existing shared filters and tag labels. Combined filters and browsing preferences persist.
- Spell art stays for **2,000 ms**. Its reading phase releases input after arrival; authoritative state/network handling does not wait for the display timer. Champion-token spells get a separate FINISHER_CARD cut-in, gold/red sigil, selected cosmetic artwork, existing champion impact/sound and higher visual priority. Reduced motion remains supported; no new rarity or finisher card definition.
- Legendary retirement dialogue uses the same spotlight as entrance dialogue in both player views. Original retire/destroy events remain distinct.
- Pandora preparation requires eight qualifying opposing pinfalls. Calavera requires **eight Undead cards currently in the owner's graveyard**, preserving the condition type. Both text and numeric fields were saved through the authenticated administrator API (see receipt). Unfinished stored 5/10 conditions normalize to eight; completed rewards are preserved.
- Wolf Pandora + Sovereign fix: nested retirement/revival used to advance an already-advanced parent effect index again, skipping attack absorption. The child now resumes the correct next effect. Captured-stat lookup also supports the resolution snapshot. Sovereign revival/Raven deck return remain unchanged. The actual current public records are stored in the focused test fixture.

## Verification

- `regression-tests.log`: **1,010/1,010** engine/service/reward/protocol tests pass. An older pinfall test still expected multi-target Pandora and a manual confirm; it was updated to test each single target independently, preserving enemy-only preparation and own-ability healing assertions.
- `protocol-tests.log`: 9/9 focused protocol/cache/outbox/actual TCP WebSocket/admin authorization tests pass, including injected partial worker failure, rollback, retry and replay safety. Representative uncompressed catalog test: 283,825-byte initial snapshot → 24,030-byte unchanged-catalog update (92% less). This is not a live bandwidth percentile.
- `wolf-tests.log`: Sovereign and Raven are selected after real turn start and JSON serialization; pre-retirement attack/current HP absorption, max HP gain and Dodge all verified; Sovereign revives at the correct reduced stats. Calavera incomplete at seven/completes at eight; completed legacy reward preserved.
- `latency-test.log`: existing isolated PvP SQL fixture with 10ms artificial delay/query: **3 critical queries/action**, 49–61ms local action processing, 12 batch reward queries. Prior measured implementation used ten critical queries/action. This is controlled local SQL delay, not Korean production round-trip latency.
- Catalog browser: real collection/deck pages at 390×844, 844×390, 1440×900; visible closed-details filters, combined tag+rarity results, reload persistence and no horizontal overflow. API responses are isolated fixtures.
- Online browser: two actual online pages connected to the real authoritative match service and disposable SQL database via an intercepted WebSocket transport. TCP WebSocket behavior separately tested above. Final browser result JSON records tested viewports. Screens/video use temporary QA cards and some existing artwork; missing art in fixture is not final production art.
- Full shared library/API/frontend typechecks and production builds pass. `git diff --check` passes.

## Limits and operation

No claim that all lag is eliminated, or that this Chromium run measures 60 FPS on a physical Korean phone. Production player percentiles require actual matches after deployment and can now be inspected in the administrator performance page. Render log API access was unavailable; controlled local tests do not identify every live slow query. Existing visible large animated/filter-heavy scenes may still exceed frame budgets on slower devices.

Old clients keep the compatible full-state protocol until refreshed. An existing saved target preview can be cancelled/reopened normally; local new previews disappear on reconnect without spending resources. Account progress may appear briefly after a battle ACK; read/claim endpoints drain the durable outbox first. Repeated worker errors remain in the outbox and surface in admin metrics rather than silently dropping progress.

Administrator metrics page rendered through the real authenticated isolated API at 390×844 and 1440×900 (`performance-browser.json`). The mobile clip was extracted from the actual online-page recording; placeholder cards are deliberate QA fixtures.

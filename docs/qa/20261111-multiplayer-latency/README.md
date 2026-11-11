# Multiplayer action latency — 2026-11-11

Branch: `fix/multiplayer-action-latency`. Baseline: `74f30a4` (gameplay code matches the previously live `3db598a`). No rule/card/champion changes, schema migrations, paid services or manual Production DB edits.

## Changes

- Share quest settings, definitions and seasons across the two seats **inside one persistence transaction**. Context is never cached across actions, so new admin edits are re-read.
- Keep per-user locks and the unique occurrence ledger. Batch positive quest-event inserts (500 rows per chunk) and update progress once per assignment using only newly inserted increments. Progress remains capped; replay does not grant credit twice.
- Avoid a second season-assignment query when no assignment was inserted. Preserve fresh reads after conflict-safe insertion.
- Skip meta-quest queries for target previews/cancellations that produce no events. Finished matches still process settlement-related quest events.
- Negotiate WebSocket `permessage-deflate`, level 1, threshold 1KB, no context takeover and concurrency limit 2. Full snapshots, viewer sanitization, protocol messages and reconnect behavior stay intact. Clients without compression remain supported.
- Log accepted actions slower than 250ms with queue, validation, engine, persistence and request-cache durations. No game-state payload, cookies or tokens are logged. This covers server processing, **not** end-to-end network latency.

## Measurements

Actual service + disposable PGlite DB, full checked-in card catalog, two seats, existing daily/season assignments:

| Case                                                                 |  Before |    After |
| -------------------------------------------------------------------- | ------: | -------: |
| Steady-state END_TURN SQL calls                                      |      19 |       10 |
| 40 CARD_PLAYED events, daily + season progression SQL calls          |     169 |       12 |
| Six END_TURN samples, median with controlled 10ms delay per SQL call | 234.3ms | 132.65ms |

The SQL counts exclude transaction BEGIN/COMMIT. The delay is injected at the Drizzle logger using `Atomics.wait`; it is a controlled sequential-cost benchmark, **not** production DB or Korean mobile latency. Raw samples: `before.json`, `after.json`.

An actual local TCP/WebSocket connection negotiated compression and received a successful card-play result: full JSON 275,525 bytes → 53,346 observed socket bytes, about **80.6% less transfer**. This measures a single full-catalog fixture action, not an average across all matches. The other seat used an uncompressed legacy connection and agreed on state/version. Local transport measurements do not establish production p95.

## Executed verification

- New integration suite: actual PvP service and SQL persistence, duplicate request, runtime reload, failed save rollback, 40-event batch replay/partial replay, injected mid-transaction quest-update failure, atomic ledger rollback and retry, 1,100 events spanning chunks, completion cap, disabled-definition filtering, actual two-client WebSocket card play/privacy/version agreement, uncompressed-client compatibility, compression negotiation, no duplicate gold payment and reconnect restoration. PASS.
- Existing authoritative PvP/sanitizer/action-validation/maintenance regression: **22/22 PASS**.
- Existing reward regression using `upgrade-isolated-rewards.test.mjs`, quest unit tests and latest card engine suite: **122/122 PASS**.
- API TypeScript check and production build: PASS.
- Existing actual online-page browser suite: **390×844, 844×390, 1440×900 PASS**, including target selection, opponent wait, reload, card discovery and selected awakened appearance. Transport in this UI suite is intercepted and calls the actual service/isolated DB; it does not measure Internet/WebSocket compression. The separate TCP test above exercises the actual WebSocket server. Temporary illustrations are used. Results: `browser-results.json`.
- An initial direct invocation of `rewards-progress.test.ts` failed because its PostgreSQL endpoint was not running; reran through the existing disposable-DB wrapper above and all tests passed. No production DB was used for these tests.

Reproduce from the repository root after sourcing the environment:

```sh
KO_LATENCY_BASELINE=1 KO_LATENCY_SQL_DELAY_MS=10 node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test docs/qa/multiplayer-latency-20261111.test.mjs
KO_LATENCY_SQL_DELAY_MS=10 node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test docs/qa/multiplayer-latency-20261111.test.mjs
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test docs/qa/upgrade-isolated-rewards.test.mjs artifacts/api-server/src/lib/daily-quest-service.test.ts artifacts/ko-game/src/game/qa/balance-content-20261111.test.ts
```

## Limits and follow-up evidence

No claim that all multiplayer lag is eliminated. Korean mobile-to-production action round-trip/p95, concurrent-user load, long-match memory, and Render CPU saturation were not measured. Existing full-state durability remains synchronous, and large state payloads still need browser parsing after decompression. Slow-action logs allow remaining server-side stalls to be distinguished by stage. Any paid move should be justified by real multiplayer measurements rather than menu request timing.

Only the API needs release for this patch; browser source and card assets are unchanged. Production release verification is recorded separately after deployment.

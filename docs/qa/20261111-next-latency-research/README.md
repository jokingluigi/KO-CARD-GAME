# Further multiplayer latency research — 2026-11-11

Research only. No production code, gameplay rules, card effects, database or deployment settings changed. Current live releases remain API `90d80ae`, frontend `a9cf8ab`.

## Executed measurements

`multiplayer-next-latency-research.mjs` uses the current engine/sanitizer, the checked-in public card catalog and synthetic two-player states. Six ordinary hand wrestlers and two board wrestlers per seat; no champion quest. History consists of repeated synthetic TURN_ENDED events. Fifteen samples per CPU measurement; median reported. Retained heap compares 64 full clones with 64 dynamic-state clones referencing a shared catalog, using `--expose-gc`. This is an experiment, not an implemented cache change or proof of catalog immutability.

| Metric                                        | 20 history events |     500 |   2,000 |
| --------------------------------------------- | ----------------: | ------: | ------: |
| Full viewer JSON bytes                        |           280,107 | 314,667 | 422,667 |
| Catalog JSON bytes                            |           259,954 | 259,954 | 259,954 |
| Full level-1 compressed bytes                 |            52,610 |  53,074 |  54,357 |
| Compressed without catalog bytes              |             1,296 |   1,694 |   2,783 |
| Retained heap: 64 full clones, MiB            |             25.23 |   30.44 |   44.36 |
| Retained heap: shared catalog experiment, MiB |              2.25 |    6.71 |   20.62 |
| Full clone median, ms                         |             1.563 |   1.818 |   2.602 |
| Shared-catalog clone median, ms               |             0.180 |   0.426 |   1.196 |
| Full JSON parse median, ms                    |             0.938 |   1.039 |   1.399 |
| Parse without catalog median, ms              |             0.055 |   0.162 |   0.503 |
| Cold legal-action enumeration median, ms      |             0.471 |   0.561 |   0.980 |

The catalog was about 93% of the short-history JSON. Compression is already live; avoiding repeated catalog transfer would still greatly reduce this fixture's compressed payload. These are **workspace Node measurements**, not production p95, actual Render heap usage, mobile FPS, concurrent-user capacity or expected speedup of the entire game. Real diverse event histories will compress differently from repeated synthetic events. The snapshot catalog is not a fresh inventory of all currently published production cards.

The simple legal-action enumeration did not dominate these samples. Heavy actual card combinations still require separate profiling; bypassing rule validation is not justified by this result.

## Confirmed code paths and recommended order

1. **Version/reuse the match catalog, send changes when required.** `online/service.ts` sends a sanitized full state on every accepted action; `online/sanitizer.ts` retains cardPool and history. `online-match.tsx` merges and reinstalls the catalog after each update. An initial/reconnect snapshot should supply the catalog; later messages should identify its revision and include definition additions/changes. Missing revisions require full resync. Do not simply remove cardPool: `effects/effect-engine.ts` adds definitions at runtime, including generated/summoned variants. Old clients must retain the full-state protocol until capability negotiation.

2. **Reduce request-cache catalog duplication.** The runtime keeps up to 64 accepted-action snapshots; `applyMatchAction` deep-clones the entire state into each cache entry. Share only verified immutable catalog revisions, retaining correct per-version dynamic state and replay acknowledgements. Never shorten/disable duplicate-request protection merely to save RAM. The heap experiment above motivates this work; it does not prove production garbage collection is the current bottleneck.

3. **Combine straightforward targeted actions into one authoritative request.** The current client sends BEGIN_TARGETED_ACTION, waits for the server's precommit targeting state, then sends CONFIRM_PRECOMMIT_TARGET. Both pass through persistence. For effects whose target list can be safely previewed, accept action+target together and validate/execute atomically on the server. This removes one round trip and one intermediate save from those cases. Invalid targets, cancellation, cost/use limits, random-dependent choices and other pending resolutions must remain correct; retain the existing two-phase path for effects that need authoritative intermediate information. No elapsed-time gain was measured for this proposal.

4. **Move only daily/season progression off the response-critical path using a durable outbox.** The live optimization reduced queries, but `persistRuntime` still awaits both users' meta-quest processing before broadcast. Persist the combat state and an idempotent work item together, then process/retry the meta progression durably. Include action-time date/timezone/config/season identity to prevent midnight or configuration changes from moving rewards to the wrong period. Claim/read paths must account for pending work. **Champion preparation, finisher, damage and combat triggers must stay in the synchronous rules engine.** Fire-and-forget promises would risk lost progression and are not an acceptable substitute. This needs a schema/compatibility plan and separate tests.

5. **Remove per-message duplicate maintenance reads.** The WebSocket handler awaits a database maintenance-settings read before handling every client message. Share short-lived reads/single-flight work and invalidate/push the setting immediately when the admin changes it; continue fail-closed behavior on failures. This is an extra round trip outside the current `applyMatchAction` stage timings. No production query time was available to rank its actual contribution.

6. **Measure and bound slow-connection send backlog.** `websocket.ts` sends every full message without inspecting `bufferedAmount`. First add backlog/serialization/send timing. A future protocol can keep acknowledgements and events reliable while replacing unsent obsolete state snapshots with the latest version. Never discard already-required request acknowledgements, skip game events, or replay player actions automatically. Catalog reuse should precede a more complex delta/backpressure protocol.

7. **Separate visible responsiveness from authoritative results.** A released hand card can show a brief pending flight/indicator immediately while awaiting acceptance. Rejection returns the visual to its authoritative place. Actual damage, gold, retirement and champion reactions still wait for server confirmation. This improves perceived response, not network latency, and must not trigger a second owned-card flight or hide a failed play.

## Needed production evidence

Render's log endpoint returned HTTP 403 when requesting the last two hours filtered to `online-action-slow`. CPU metrics were also inaccessible in the preceding investigation. No production slow-action distribution was obtained. Existing server logs cover queue/validation/engine/persistence/cache, but there is no in-app percentile/event-loop/backlog dashboard in the searched code.

Before/after acceptance should measure release-tagged client action-to-ack, action-to-opponent-update and input-ready times, p50/p95, main-thread long frames excluding hidden tabs, event-loop delay, heap and WebSocket backlog. A lightweight authenticated admin aggregate would avoid depending on provider log access. Do not infer live player experience from menu HTTP response times or these local fixtures.

The strongest measured next step is **catalog reuse plus catalog-sharing cache design**, with production instrumentation in parallel; atomic single-target requests are the next direct round-trip reduction. Full field/event deltas come later: historical sanitization can change with hidden-zone visibility, so blindly appending public events can diverge from full snapshots.

Reproduce:

```sh
node --expose-gc --import ./docs/qa/checkpoints/20261006/qa-loader.mjs docs/qa/multiplayer-next-latency-research.mjs
```

Raw output: `measurements.json`. Production writes and deployed changes in this research: **0**.

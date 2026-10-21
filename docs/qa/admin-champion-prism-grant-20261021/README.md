# Administrator champion-prism grants

## Behavior

The existing **제작 · 프리즘 → 프리즘 지급** tab now selects either **일반 카드 프리즘** or **챔피언 프리즘**, a user and an integer amount (1–1,000,000). The server credits only the selected currency and writes the corresponding existing transaction ledger with administrator attribution. General prism callers that omit `kind` retain the old CARD default. No new table/migration, crafting costs, rewards or game rules change.

The UI guards synchronous double clicks, disables grant inputs while pending, sends a request ID and retains it when a response fails. The server serializes the request ID, locks the account row, checks both existing ledgers for prior use, and commits balance plus ledger atomically. Replaying the same request returns `alreadyGranted`; reusing it for a different currency/user/amount/admin is rejected. Integer balance overflow is rejected cleanly. Legacy CARD callers without a request ID retain their previous behavior; the new UI always sends one and the new CHAMPION path requires it.

Grant/revoke result messages previously lived inside the first hidden pricing tab. Move the common message above the tabs so the current operation's success/error is actually visible.

## Executed validation

- Full workspace TypeScript checks and frontend/API production build: PASS.
- Public draft/admin HTTP suite: **13 passed, 0 failed**, including champion/card grant authorization, validation, concurrent retry, separate balances/ledgers, cross-request conflicts, legacy CARD compatibility, missing user, overflow, and rollback if the ledger insert fails. The forced insert failure exists only as a temporary constraint in the isolated test DB; after removal the same request succeeds once.
- Real compiled UI + isolated Express/PGlite browser suite: **7 groups passed, 0 page errors**. The added group grants champion prism, deliberately drops the committed response, retries with the same ID, verifies only one credit, grants normal prism independently, reloads and checks persisted balances. Three widths (360/390/1440) have no horizontal overflow. Existing six quest, pack and filter groups still pass.
- One early browser attempt fetched the static preview instead of the fixture for the injected lost-response test; it was corrected to the explicitly asserted loopback fixture. The next attempt exposed the real hidden-message problem; that was fixed in the UI without weakening the visibility assertion.
- Mobile testing is emulation. No physical phone or production grant/revoke was tested.

## Cost and deployment

Each successful grant updates one existing wallet and inserts one existing ledger row. Additional request-ID/account/receipt reads and locks run only on administrator grant actions; no polling or gameplay queries are added. Production confirmation checks service commits, static asset hashes, health and read-only admin access. It does not give currency to operating accounts.

The earlier champion quest-completion dialogue feature is already deployed on both services at `48887286dd8fa9c7e4cb7d2688e32aac75f10720`, with all 11 checked asset hashes and read-only administrator access verified. Its deployment and admin receipts are included here. The administrator supplies each champion's actual dialogue; no production text was populated automatically.

## Final production verification and CI launcher fix

Both Render services are live at `f3606a957a1afb3f2a7b1c299663c41f80a354a6`; all ten selected tested asset hashes, both health endpoints and read-only administrator prism access passed. No production prism grant/revoke or schema migration was performed. See the deployment and administrator receipts.

The larger GitHub job failed before launching this browser suite: colored Vite output contains ANSI codes between `Local` and `:`, so the raw readiness search timed out despite the preview running. Strip ANSI sequences for readiness matching and expose root/child logs through Checks annotations. The local runner was exercised with actual ANSI output (`CI=true`, `FORCE_COLOR=1`, `NO_COLOR` unset), retaining the full DB/UI assertions. A focused CI job verifies the same launcher without the unrelated complete combat suite. Full workflow status is tracked independently; no failed run is reported as passing.

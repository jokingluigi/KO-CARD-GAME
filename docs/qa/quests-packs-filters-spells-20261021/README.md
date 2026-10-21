# Quest management, daily completion bonus, pack reveals, catalog filters and mobile spells

## Changes

- Admin quest deletion uses a tombstone in the existing `platform` JSON and one audit entry. It disappears from management and future daily/season assignment pools. Existing assignment snapshots, earned rewards and claim history remain intact. The built-in lifetime draft quest also checks its tombstone instead of assigning itself again. Deleting an active definition preserves already assigned progress; deleting a paused definition does not resume it. Both edit APIs reject deleted IDs; retries do not create duplicate audit entries.
- Separate daily three-quest bonus: administrator configures currency/card/pack/champion and quantity; **disabled by default**, with no automatic settings insertion. Reaching three distinct DAILY goals for the current configured server date qualifies, independently of their individual reward claims. Season, lifetime, prior dates and incomplete assignments do not count. A server transaction takes the existing per-account quest lock, checks a date-based receipt independent of reward type, and invokes the existing atomic reward grant. Repeated/concurrent requests and reward-type changes cannot grant twice. Failed grants roll back. No DB schema changes.
- Pack reveal state tracks individual selected indices. Third/fourth/last card no longer reveals preceding cards. Repeated taps are inert; explicit reveal-all remains. Existing rare reward queue/audio and bulk pack behavior are retained; no probabilities or server inventory changes.
- Shared deck/collection controls: ownership (all/owned/unowned), rarity, exact tag and actual cost, alongside existing name/type/favorites controls. Cost values come from the authorized catalog, including values above six. Collection browsing merges the already fetched publicly craftable and owned catalogs by stable ID, preserving owned records. Filters run locally without additional requests; hidden unowned definitions are not fetched. Existing deck validation/ownership and crafting APIs remain unchanged.
- Mobile spells accept drops on either field or champion HUD and can begin dragging from the selected spell's Use button. Drops on valid targets use the existing target-selection callback after the authoritative targeting state arrives. Invalid targets retain normal targeting; outside/cancelled/blocked actions do not cast. Existing hand horizontal scrolling, tap Use and wrestler attack drag remain.

## Draft investigation (not declared fixed)

Authenticated read-only production admin and draft-lobby responses show identical current descriptions for Lord (로드), Bodva (보드바), War Thunder (워썬더); see `draft-lobby-readonly.json`. The administrator reports both wording and behavior differ in a newly started draft. The specific discrepant wording/action is still requested.

Added integration coverage creates a new isolated draft from the recorded administrator catalog, selects champion and 25 cards, starts the actual persisted battle and reloads resources: all three descriptions **and abilities** remain equal to the normal card adapter. No production match was created or advanced for this test.

An admin-only explicit `GET /api/admin/draft/sessions/:id/catalog-audit?cardIds=...` provides at most ten requested catalog definitions from the stored session and current catalog, plus creation date/version/phase. It does not call `mutateDraft`, advance deadlines, heartbeat, take match locks, or expose either player's hand/deck/account data. SQL extracts only the requested cards. It adds no polling. Tests verify unauthenticated/non-admin rejection, parameter bounds and byte-equivalent persisted rows even with expired deadlines. This enables production diagnosis without advancing the reported match; it is **diagnostics, not a claimed behavior fix**.

## Executed validation

- Full workspace TypeScript checks and frontend/API production builds: PASS (`pnpm run build`). A DB-record typing error in the diagnostic adapter was corrected before the successful build.
- Quest completion feature HTTP/PGlite suite: **10 passed, 0 failed**. Real engine card plays feed the trusted progress path, including three goals, dates, concurrency, type changes, rollback, tombstones, stale edits, paused deletion and the built-in lifetime draft quest.
- Existing quest platform HTTP suite: **7 passed, 0 failed, 1 optional browser test skipped**.
- Public draft HTTP suite: **12 passed, 0 failed**, including fresh-catalog and read-only audit tests. Initial new test hit intentionally OFF settings left by an earlier test; its own setup now explicitly enables its isolated mode. No production settings were changed.
- Compiled frontend + actual isolated API/DB browser suite: **6 groups passed**, covering admin save/delete/reload, 0→1→2→3 goals and one persisted claim, independent five-card pack reveals, both catalog filter combinations and responsive widths. See `browser-results.json`.
- Native CDP touch spell suite: **five viewport scenarios passed**, 360×740, 375×812, 390×844, 412×915 and desktop 1440×900. Covers targetless champion drops, targeted wrestler drops, Use-button drag, rejection/cancel/outside, horizontal hand scrolling, no zoom/overflow and unchanged tap behavior. Selection preparation for Use-button drag uses keyboard focus/Enter to avoid Chromium's missing compatibility click when mixing raw CDP touch and Playwright taps; the drag itself uses real touch events. Earlier harness attempts failed at preparation; the assertions remain enabled. See `mobile-spell-results.json`.
- Existing current-card effect/rounding regression suite (including the three named cards): **300 passed, 0 failed**.
- Existing native-tap/mobile input browser regression: PASS.
- Existing field attack drag browser regression: **360/390/412/1440 passed**; see `attack-drag-results.json`.
- No physical phone test or production two-account gameplay was performed. Browser validation is mobile emulation. The live reported draft mismatch is not yet reproduced by these tests.

## Cost and deployment

No migration, new table, new recurring task or combat-action DB writes. Quest-page responses add one settings lookup and one existing reward-receipt lookup. A bonus claim performs existing transactional quest/reward reads and one grant only once per account/date. Deletion writes one existing definition and one audit entry. Catalog filters and pack reveal add zero API calls. Diagnostic reads happen only when explicitly requested by an administrator, never per poll.

Production verification must check both Render commit IDs, tested static asset hashes, health, administrator session, default-disabled bonus and the read-only draft audit. It must not delete/configure/claim quests, open packs or create matches on real accounts. Existing authorized administrator login side effects are the only permitted login effects. See the deployment receipt when available.

## Live investigation update

PR #73 deployed to both Render services at `780fbab79afcedd560adfa00ef04cb15de607ae4`. Read-only administrator verification passed and the daily bonus remains disabled. The registered administrator account's active draft was created **2026-10-15 10:33 UTC**, is in the drafting phase, and its stored text and ability definitions for all three reported cards equal the current administrator catalog. No timers or match state were advanced by this audit. This may differ from the user's newly reported session; no cause is asserted from this account alone. The exact discrepant wording/action remains requested.

A follow-up also ensures the new browser checks run after Playwright installation in CI and accept the CI-supplied module instead of relying on the cloud machine's local Chromium path. Local compiled browser and five-viewport touch checks were rerun successfully. GitHub full-workflow status is tracked separately; local passes do not claim a completed CI run.

## Final deployment and CI label maintenance

PR #74 is live on both Render services at `5163158bfdeb47f51f341a908299cd62a632dcd2`. The tested assets and health checks match; the server remains free-tier and no migration was applied.

PR #73's GitHub draft traffic check passed; startup CI exposed the browser-installation ordering addressed in #74. Another existing CI script still looked for the obsolete `DRAFT 저장` button after the champion editor had changed to `수정 저장` / `미공개로 생성`. Update those two selectors to the actual save actions without weakening save assertions, and ensure the relevant QA script paths trigger their workflows. Actual champion browser checks and compiled admin menu navigation/save checks pass locally with the corrected selectors. Full GitHub runs are not claimed as passed while pending. These follow-up files change QA only.

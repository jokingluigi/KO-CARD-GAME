# Multiplayer presentation and Pandora correction — 2026-11-11

Branch: `fix/multiplayer-action-latency`. Main was not merged. No manual Production DB edits or migrations.

## Pandora urgent correction

The public production champion record was read back during this task: Pandora UUID `bcffab96-f61f-497e-b60b-de5a869837d3`, version 44, ability cost 1, text **자신이 선택한 선수 카드에게 1 데미지를 줍니다. 핀폴로 처치했다면 체력을 2 회복합니다.**

The previous reviewed adapter explicitly implemented the earlier “모든 선수” wording as a 1–8 target selection. The new singular text also needed to retain the dedicated ability pinfall/healing implementation instead of falling back to raw DAMAGE alone.

- Both the old saved wording and latest singular wording resolve to **one board wrestler** for the basic ability. Champion targets are excluded from this basic ability.
- Cost, once-per-turn limit, existing quest/finisher rules and upgraded ability definition remain intact.
- Healing is still restricted to that ability's own exact-zero retirement, including the existing root-source guard against another card's nested pinfall.
- Existing ability snapshots are normalized by the shared current-ability accessor. An unfinished old multi-selection reopens as one choice, keeping payment/use counters; the underlying damage operation also refuses to damage more than one ID.
- API release `90d80ae6f5f6d53be32d358e2ab28618ec0ee2f8` was deployed and its public serving revision verified before the presentation release.
- Three new focused tests plus the latest card engine and actual PvP service suites: **114/114 PASS**. Includes latest singular text, single target, no champion target, nonlethal no-heal, no second selection/use, legacy serialized selection, duplicate requests, reconnect and nested-source no-heal.

## Presentation changes

- Replaced the online page's 250ms full-page clock polling with independently updating countdown HUDs and a single intro-deadline wakeup. Server time offset, expiry, visibility/focus recovery and live end-turn confirmation time remain supported.
- Event-presentation processing no longer rescans historical events merely because callback props were recreated.
- Same-result wrestler summon flights overlap, capped at four. Separate server result batches and spell reveals retain causal order. Out-of-order completions remove only their exact entry. Only currently flying cards are hidden on the board.
- Entry handling recognizes the actual `PLAYER` source of hand-play events; previously the CARD-only filter skipped those flights. The owned hand-flight is not also enqueued as a generated-card copy.
- Independent-target feedback can run together, capped at four; repeated numbers on one target, awakenings and transformations stay sequential. A future exclusive cue does not prematurely block input while ordinary feedback ahead of it is running.
- Removed the extra 180ms input hold after the owned card-play animation has already completed.
- A full authoritative resync remounts the presentation subtree, cancelling old local flights/feedback rather than holding the restored game behind them.
- Fixed smoke/emission filters are prepared and cached once per texture. Flash preferences are read once per VFX instead of every frame; hit textures are warmed during idle time. Attack strength and existing motion preferences are preserved.

## Executed validation

- Frontend TypeScript check and production build: PASS.
- New clock/batch tests, existing presentation/upgrade tests, Pandora tests and actual PvP service tests: **32/32 PASS** after final source changes.
- Actual two online pages invoking the authoritative service and isolated PGlite persistence at **390×844, 844×390 and 1440×900: PASS**. Their transport is intercepted, so this is not Internet latency measurement.
- Latest Pandora single-target precommit, reload while selecting, one victim retirement and 2 healing; unrelated second victim unchanged; card discovery; selected awakened appearance restored on both views: PASS.
- Generated hand-card flight has one visible copy; one spell summons three cards into the remaining slots with three simultaneous flights; both clients agree on four final cards; both players end turns; actual attack deals 2; opponent's simultaneous summon interrupted by authoritative resync clears old flights; countdown still advances: PASS.
- Chrome precise-coverage probe over 2.6 idle seconds: full `GameStatePreview` calls **13/12/12 before → 1/1/1 after** for portrait/landscape/desktop. These are actual component-call counts, not an FPS claim. Samples: `before-browser.json`, `after-browser.json`.
- Motion sampling includes video recording, screenshots, dev build and isolated service overhead. Final frame-gap p95 was 67/117/117ms; it **does not demonstrate 60 FPS** or quantify real-phone improvement. No Korean mobile production multiplayer frame or network benchmark was run.
- The QA card art is placeholder/missing art in some cases. It is not validation of final sprite artwork.

The first browser attempt caught a leftover clock variable; type checking exposed it and the two HUD readouts were moved into isolated clocks. The next motion scenario exposed the existing CARD-only hand-entry filter; fixed it and reran all three viewports successfully. No failed run is reported as passed.

Reproduce:

```sh
KO_LATENCY_RENDER_PROBE=1 KO_MOTION_SCENARIOS=1 FINISHER_QA_OUTPUT=/tmp/ko-motion-review node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs docs/qa/balance-content-20261111-browser.mjs
```

Local artifacts: `/workspace/ko-multiplayer-motion-20261111/mobile.webm`, `concurrent-summons-390.png`, `attack-motion-390.png`. They show local Chromium online-page verification, not a physical phone or production match.

Production serving verification completed at **2026-11-11 23:36 UTC**. API `90d80ae6f5f6d53be32d358e2ab28618ec0ee2f8` and frontend `a9cf8ab289047aaf913b7e18aebe3b86f07c03cf` are live. Verified both pinned build configurations, API health revision, Pandora's version-44 public text, actual main/admin/online route entry revisions, and the new online-match JS chunk. Receipt: `production-release.json`. No production match was created or played during this read-only release check.

# Active abilities: once per uninterrupted field stay

The user clarified that an active ability must be used only once in total while the card remains on the battlefield. The previous implementation cleared the use marker at every owner turn start.

## Implementation

- Add serializable `CardInstance.activeUsed`; successful effect resolution marks it independently of the legacy `activeUsedThisTurn` flag. Both direct actions and targeted precommit use the same authoritative checks, including AI legal-action enumeration.
- Turn start preserves the lifetime marker and carries forward any legacy current-turn use. It only clears the legacy turn marker. Serialized reconnect/viewer projection preserves the new field.
- Source and target transformations keep the marker, so changing forms does not refresh an already consumed active.
- Actual board exit/reset and newly generated cards start a fresh field stay; bounce/replay retains the existing entry-turn cooldown. Release from capture clears the marker like other runtime one-shot state.
- Invalid actions and canceled precommit choices do not consume the use. An unresolved committed target selection already locks other actions; use is marked on completion as before.
- The actual battle button reads `사용 완료` and stays disabled after subsequent turns, with a tooltip explaining the lifetime limit. This makes availability explicit instead of relying on color alone.

No card catalog text/stats, champion ability rules, accounts, inventories, rewards or database schema changed. No main merge.

## Executed validation

- 335 engine tests passed: new lifetime-active tests, combat mechanics, keywords, targeting cancellation, effect targeting, script continuations, current catalog effects, balance patch 20261024 and admin revision 20261013.
- Nine new focused cases cover next-turn/reconnect blocking, independent copies, source/target transformations, self-transforming active, cancel/invalid target behavior, entry-turn rejection, legacy flag carryover, silence/buff preservation and bounce/replay.
- Frontend/API type checks and production builds passed.
- Chromium at 360×740, 390×844, 740×360 and 1440×900: clicked the actual common battle UI active button using the existing Great Chan fixture; checked consumed state, disabled `사용 완료` label, and preserved restriction after two real engine turn transitions and serialized reload. No page errors. API/media are mocked in this local runner.
- Runner: `node docs/qa/active-once-browser.mjs` with Vite on port 5186.
- [Next-turn used button screenshot](20261031-active-once/used-next-turn-390.png), [browser results](20261031-active-once/results.json).

Physical devices, two-account live PvP, tower/AI matchmaking and production gameplay were not separately exercised. Existing matches with no recorded historical marker cannot reconstruct uses from older turns before this change; newly completed activations retain the lifetime record.

## Deployment verification

API, then frontend, deployed source `a55a6a2d22af84a06e46817fbb6d25eddac44bdf`. Both deployments are live at that commit and health endpoints returned 200. All 109 frontend JavaScript/CSS files match local build SHA-256 hashes. The first immediate frontend check still received the preceding release HTML during rollout; a later check confirmed the new entry and every asset. Maintenance remained disabled, matching preflight. No live gameplay was exercised by these deployment checks.

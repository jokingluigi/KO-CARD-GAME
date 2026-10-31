# Zombie multi-buff and effect target selection focus

## Changes

- Effect-summoned zombies previously absorbed into only the first existing allied zombie. All existing allied zombie instances now receive the incoming stats, including Calavera's normal and awakened ability and effect summons from hand. An incoming hand card is consumed once. No additional zombie enters the field when absorbed.
- Retirement growth already iterated eligible zombies. Tests now explicitly protect simultaneous growth, each instance's independent two-per-turn allowance, silence/disable rules, duplicate callback protection, and distinct retire/destroy/vanish/return behavior.
- Follow-up SAME_TARGET effects receive all affected zombie instance IDs once, avoiding duplicate applications during multi-summons.
- During the local player's effect-target choice, a noninteractive viewport mask dims the scene by 38%. Actual valid board/hand/champion targets and selected targets retain brightness. Existing command instructions and cancel controls remain readable. Targets receive a thin gold outline.
- Focus geometry follows original DOM refs and clips to visible scroll containers. Resize, rotation and scroll refresh geometry; cleanup disconnects observers/listeners. Original hitboxes, drag and game state remain authoritative. Ordinary attacks do not trigger this effect-choice mask. Graveyard selection retains its existing filtered modal/backdrop; other menus suspend the mask.

## Design rationale

Figure/ground contrast and visual hierarchy reduce scanning effort during a forced choice. Keeping the original targets and cancel controls preserves predictable input and player control. One dimming layer avoids compounded darkening and excessive flashing. Zombie buffs preserve individual limits instead of sharing a hidden allowance.

## Executed checks

- 605 engine regressions passed: balance patch 20261024, latest admin revisions 20261013/14, current catalog effects, and zombie multi-buff cases.
- Final focused run: 23 tests passed (22 zombie cases plus viewport/clipping policy).
- Frontend and API TypeScript checks and production builds passed.
- Chromium, actual shared battle component and real local engine, with mocked API/media and development fixtures: 360×740, 390×844, 740×360, 1440×900. Effect choice, valid-target holes, original pointer hit testing, viewport rotation, cancel preserving state, real spell resolution and Calavera buffing all three zombies passed. No page errors.
- Separate touch input regression passed at 390×844, 740×360 and 1440×900: summon drag, spell drag/target, cancel preserving state, rotation preserving state.
- An initial browser run attempted the ability while the preceding presentation was busy; corrected the test to wait for presentation readiness. No engine workaround added.

## Images and reproducibility

- [Ordinary battle before selecting a target](20261031-zombie-target-focus/normal-390.png)
- [Effect selection focus](20261031-zombie-target-focus/selection-390.png)
- [Three zombies after champion ability](20261031-zombie-target-focus/all-zombies-390.png)
- [Browser results](20261031-zombie-target-focus/results.json)
- Runner: `node docs/qa/zombie-target-focus-browser.mjs` with Vite on port 5186.

Images use development fixtures and mocked media, so missing artwork is a fixture limitation. These are executions of the actual common battle UI and local engine, not live PvP sessions. Physical Android/iOS, two-client PvP, live tower/AI matchmaking, hand/champion/graveyard target choices and human usability evaluation were not separately exercised in this change. No production account/card/deck data or database schema changes are required. No main merge.

## Release verification

Source commit `93ce8df8f271ccc99a8b351f0ac302411c909eb8` deployed to API, then frontend. Both Render deployments are live at that commit; both health checks returned 200. All 109 frontend JavaScript/CSS files match local build SHA-256 hashes. Maintenance remained disabled as before. Deployment receipts are recorded beside this report. Production gameplay was not exercised by this release verification.

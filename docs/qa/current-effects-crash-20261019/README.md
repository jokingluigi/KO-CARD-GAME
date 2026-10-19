# Latest administrator effects and combat rendering crash

## Administrator data

- Authenticated GET of all visibility states: 163 cards (142 wrestlers, 21 techniques), 11 champions; no new/deleted IDs since the October 15 snapshot.
- The snapshot includes disabled Ruina and tokens. No operational content edits, account/test-match creation, rewards, collection edits or database resets. Existing registered administrator login was used under the previously granted login/provisioning authorization; the private session and credentials are excluded.
- [Snapshot and source/hash manifest](../snapshots/20261019-admin/manifest.json), [complete field differences](changes.json).

## Effect revisions

| ID | Name | Change / implementation |
| --- | --- | --- |
| 4e28e957-1148-44c3-8f8b-b6fe8f40e3a9 | 루이나 | Generate another standard-pool Authority card, give only that new hand card lifesteal, then +1/+1 per Authority card in own hand. Board/deck excluded. Remains DISABLED. |
| latest-wrestler-4 | 휴먼쿠커 | Generate Feast without the old unconditional -1; -1 only when the existing friendly-board Authority condition is met. Existing condition includes the Cook itself; asked user to clarify, pending reply, preserved existing behavior rather than inventing a new exclusion. |
| epic-spell-feast | 만찬 | +2 current/max health to allied wrestlers and champion. Old unconditional ID-based +3 replacement no longer overrides new administrator text. |
| df532c95-0e4d-4b17-8200-a86e6a682341 | 조킹루이지 | Bind revised wording to the previously confirmed friendly-tag summon/taunt and other-card +1/+1 behavior. Source excludes its own instance, not different copies. |

Latest numerical/keyword changes are loaded directly: Luna cost 5, Cook 3 cost/4 health, Joking Luigi cost 6, Cassandra health 4, Pandora 2/2, Kamisator health 3, Skard/Kamisator no dodge; champion health changes are read from current records. Audio/art changes continue through existing runtime content loading. No administrator UI, card text, costs, health, publication status, or audio settings were overwritten.

Implementations use explicit stable-ID and literal-text bindings. Unknown future text is not silently assigned the October 19 behavior. Historical +3 regression now explicitly loads the actual October 15 Feast record, rather than relying on a blanket ID override of the obsolete October 5 field-only description.

## Combat crash

The reported quick-match card-vs-card incident has no original client stack trace or match details; its exact cause remains **UNCONFIRMED**. Browser ErrorBoundary messages are logged to that browser console, not an existing server-side client-crash store. Render log retrieval returned Cloudflare HTTP 403; it was not bypassed.

A matching failure was reproduced with the actual engine, battle renderer and ErrorBoundary: when `Element.animate` exists but throws `NotSupportedError`, the retirement/zone reaction throws from a React effect, unmounting the live battle into “Something went wrong”. Normal Chromium attack succeeds. With injected animation rejection, the old code fails and the patched code completes attack/counterattack and both retirements, retains the battle, and does not change resulting state after cosmetic completion.

`presentation-motion.tsx` now catches failures only around optional Web Animations calls for zone/card reactions, hand movement, and numeric pulses. Game actions, exceptions in game rules, damage and networking are not swallowed. Supported animations are preserved.

The dedicated QA page is development-only and absent from the production build. Tests do not log in or write to production.

## Validation

- 10 latest-data engine tests: passed; exact wording/cost/status preservation for all 163 records and champion health values, new effects and negative conditions.
- Four real Chromium combat cases: 390×844 touch and 1440×900, normal and rejected Web Animations. One attack, two retirements, no boundary/page errors, resulting game state unchanged after cosmetics.
- Additional exploratory sweep: all 142 wrestler definitions through engine attack transitions and battle state rendering: zero engine exceptions / browser page errors. This is not proof of every effect or the original reported incident.
- Physical phones and two-browser live production PvP: not run.
- Full supported engine runner: 2,680 passed, zero failures/skips (includes the 10 new effect tests).
- Separate current October 19 snapshot validation: 173 passed, including 100 deterministic varied full AI matches. These executions overlap some suite names with the engine runner; counts are not claimed as unique combined tests.
- Workspace type checks and complete build passed. Repository CI and Render results are recorded in the PR after completion.

## Deployment / recovery

No new migrations, environment variables or infrastructure changes. Deploy API and frontend from the same merged commit; existing matches retain their original snapshotted definitions, while new matches load latest administrator definitions and these explicit bindings. An already open browser may need to reopen/refresh for the frontend fix. Revert the PR to roll back code without changing operational card data.

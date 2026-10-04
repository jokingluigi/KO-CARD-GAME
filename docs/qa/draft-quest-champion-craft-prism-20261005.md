# Draft quest, champion craft permission and prism revoke

- PASS: existing draft AI and PvP finish settlement records one participation per user/match, independent of victory. Completed matches only; cancelled queue and draft selection do not count. Persistent assignment `draft-five-minion-a` uses LIFETIME outside daily random slots and survives date changes. At five, the existing claim/reward transaction grants champion-minion-a once, including DRAFT targets. Duplicate match and reward requests do not duplicate progress/ownership.
- PASS: champion `isCraftable` defaults true for all existing rows; additive migration 0040, startup installation, admin editor, API save and collection rendering support it. Direct craft API enforces the flag even for test/admin accounts; rewards do not depend on it. Isolated save, reload, deny, allow, reward and original champion stat preservation verified.
- PASS: admin prism revoke selects CARD/CHAMPION, account, integer quantity and reason. Atomic conditional decrement rejects insufficient balance and leaves balance/log unchanged. ADMIN permission required; immutable transaction audit stores actor, recipient, negative quantity, balance and reason. Request IDs prevent duplicate decrement; frontend retains ID on failed-request retries. Concurrent competing requests cannot overdraw.
- PASS: full regression 1,054 tests, zero failures/skips; database, frontend and API types and web/API builds passed.
- PASS: main background 8% layer deployed before this patch (dc0a58c), strictly below UI.
- UNVERIFIED / BLOCKED: production champion-minion-a is DISABLED v7 (read-only admin UI observation). Existing reward rules correctly block claim until its status is DRAFT/PUBLISHED. No status, starter-grant, gameplay effects or original HP/cost were changed. The desired one-time quest is implemented; live Minion A reward issuance is not yet enabled.
- UNVERIFIED: real-phone views and live production mutation tests. No production accounts, prism balances, champion original data or catalogs were modified during QA.

Changed API: draft settlement, daily quests, champion admin parsing/save, craft enforcement, admin prism revoke.
Changed UI: persistent quest display, champion editor checkbox, collection craft state, admin revoke form.
No original card ATK/HP/cost changes.

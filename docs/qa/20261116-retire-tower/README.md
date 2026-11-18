> 2026-11-18: 이 문서의 VFX 제작·미리보기 내용은 폐기됐습니다. 타워 제거 및 데이터 보존 검증 기록만 유효합니다.

# Retire Tower and separate effect silhouettes

User request: remove the entire Tower mode, including its effects, and address the repeated-effect appearance.

Removed the player route and menu availability request, administrator management/test tools and navigation, mode client/sandbox/dialogue/editors/styles, both API routers, server run/catalog/battle implementations and statistics outbox processing, shared Tower domain modules and exports, and all relic/configured-effect integration with the common combat engine. Standard four-slot capacity is now a mode-neutral helper. Tower-only quest mode selections and the archived dummy champion are excluded from active catalog tools. Retired preview IDs 71 and 99–108 are removed and rejected by the effect bus.

No production table, run, inventory, uploaded attachment or historical migration is deleted. Archived schema definitions and read-only attachment-reference checks remain to preserve existing records. Application startup no longer requires or recreates retired tables; the shared historical statistics migration is filtered to supported-mode DDL. A fresh-schema test explicitly drops all retired tables and confirms startup works without them. Finisher music upload/editing was extracted to mode-neutral MusicTrack tools rather than deleted.

Created distinct geometry for 43 frequently conflated mechanic cases and dedicated 11 champion/12 finisher signatures. The active atlas manifest contains 87 authored shapes; sharing vocabulary no longer aliases every ability to the same burst. A consistent material palette is retained. Settings offers 129 remaining situation recipes plus 23 named champion/finisher choices. These are not 152 independently authored atlases.

Validation:

- Shared library, frontend and API typechecks pass; both production builds pass.
- 21 presentation/navigation/audio-policy/upload tests pass.
- 5 startup tests pass, including preserved existing records and absence of retired tables.
- 27 isolated database/HTTP tests pass, including GET/POST 404 for retired routes and unchanged archived runs.
- 129 situation recipes rendered on desktop and true touch browsers; ordinary attack/heal, pack tiers, crafting, status/capture/countdown, preference/cleanup/budget/fallback checks pass.
- 23 distinct champion/finisher atlases rendered on desktop and touch; player route unavailable, administrator/menu entries absent, no retired API requests, all 152 current preview options checked.
- All 87 PNG hashes, nonempty alpha and transparent final frames checked. Production frontend JS/CSS contains no Tower screen/module text.
- Full combat/effect/champion/AI regression: 1,001 of 1,005 pass. The four existing awakening AI-choice assertions also fail on unchanged baseline `37c3394`; no new engine regression remains. The obsolete Tower-cap assertion was replaced with a standard capacity integration case; its full-board probe uses a fresh immutable snapshot to respect the existing legal-action cache.
- Analytics integration: 34 of 35 pass, including the retained-outbox and AI retry/backoff cases. The existing return/transform hand-replay assertion fails on baseline `37c3394` too (mandatory hand discard). These five baseline failures are recorded, not described as passing or fixed in this change.

Independent baseline runs used `/tmp/ko-tower-baseline` at commit `37c3394`. They did not touch production data. Physical-device checks and every champion/finisher gameplay combination have not been run. The 23-signature browser check validates rendering, not all engine outcomes.

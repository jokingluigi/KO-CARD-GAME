# Champion quest-completion dialogue

Administrators can set **퀘스트 클리어 시 대사** in the champion editor's **대사** tab. The optional string (up to 120 characters) is stored under `presentationLines.QUEST_COMPLETE` in the existing JSON column. Existing before/after-quest emotes, matchup dialogue, artwork, audio and game rules remain unchanged. There is no schema migration or automatic content update.

The shared battle board displays the configured line on a newly observed authoritative `CHAMPION_QUEST_COMPLETED` event for either player. It takes priority over summon dialogue in the same reward batch and uses the existing 2.6-second speech display. Blank text produces no extra line. Existing event keys prevent repeated snapshots from replaying it. Existing quest-presentation eligibility suppresses the line on a lethal/finished state, including an already visible completion line when defeat arrives. Old-match speech is hidden on a game ID change.

Visual inspection found that the existing reduced-motion rule fast-forwarded the entire speech fade to opacity zero. A reduced-motion-only override disables the animation while preserving the normal dismissal timer. This keeps speech readable without motion; normal animation is unchanged.

## Executed validation

- Full workspace TypeScript checks and frontend/API production builds: PASS. An initial inferred `false | PlayerState` type in the new presentation condition was corrected before the successful builds.
- Existing champion start/exit/reward HTTP suite plus new persistence test: **13 passed, 0 failed**. Actual isolated PostgreSQL-compatible DB/Express administrator save, list reload, definition mapping, clear operation and invalid string checks; existing emote fields are preserved. No production writes.
- Existing champion UI/engine browser suite: PASS, desktop/mobile/small. Actual editor input and saved request include the new completion text while independent game-start, exit dialogue, quest token replacement and status actions remain functional.
- New browser suite: **four scenarios passed**, 360×844, 390×844 and 1440×844 with reduced motion, plus 390×844 with normal motion. Real engine `PLAY_WRESTLER` completes a quest. Checks cover completion text over summon speech, opponent speech, empty option, no repeated snapshot replay, same-action defeat suppression, later defeat hiding, no page errors/overflow and computed visible opacity. Early DOM-only captures exposed the reduced-motion invisibility issue; final screenshots/tests require actual visible opacity.
- Browser checks use the shared real development UI and isolated local data; mobile verification is emulation. No physical handset or live two-account gameplay test was performed.

The new browser guard is included in the existing startup workflow. Full GitHub CI status is separate from local test results.

## Deployment

Use the normal reviewed feature-branch PR merge and deploy both Render services. Verify their commit IDs, tested static asset hashes, health and read-only administrator access. Do not fill in or save dialogue for production champions automatically; the administrator chooses each champion's text. No operating accounts, rewards or gameplay data are used for tests.

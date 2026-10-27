# Equipped presentation skins, readable champion captions, AI skin assignments

## Implemented

- Legendary dialogue already selected the speaker's equipped skin; champion ability, awakening and standalone quest portraits now do too. Shared cinematic images accept framing and fall back to the original if a skin fails. Mirror champions resolve by player ID. Existing base/awakened asset selection policy remains unchanged.
- Champion speech now uses an 18px body and 15px speaker name, up to 560px width. It sits outside the actual portrait, above it where possible and otherwise below. It may temporarily overlay field cards as a caption; portraits/resources/turn controls remain separate. Reflow observes caption height so late font changes cannot make it overlap the portrait. KO offscreen fallback is preserved.
- AI deck administration supports champion/card skin selection, previews, save/reload, duplicate and removal. Server verifies active catalog IDs, matching targets, unique slots and administrator authorization. Writes use the existing deck-save transaction, and removing a deck or skin cascades its assignment. No user inventory grants.
- Normal AI battle snapshots carry the selected loadout into VS intro, HUD, card art and shared presentation. Quick-AI saves the opponent loadout in its existing match metadata: subsequent admin edits do not change an already-created match. Card definitions, engine actions, match selection, timers and rewards are unchanged.

## Storage / rollout

New migration: `lib/db/migrations/0055_ai_deck_cosmetics.sql`. It adds only `ai_deck_cosmetics(deck_id, cosmetic_id)`, foreign keys/cascades, composite primary key and RLS. Existing tables/data are untouched. It was tested twice on an isolated PGlite database.

**No production migration has been executed.** Migration 0055 is deliberately absent from the automatic startup installer. Until separately authorized/applied, old AI reads/starts remain available, the new skin selector reports that storage preparation is required, and saving nonempty skin assignments returns JSON 503 before a deck is changed. The migration requires explicit production-DB authorization because of the user's earlier prohibition. Application rollback can leave this additive table intact.

## Actual checks

Passed:

- New shared-UI skin browser suite at 390×844 and 1440×900: own/opponent legendary dialogue, champion abilities, quest awakening, same-champion ownership, framing, default/broken-skin fallback, awakened ability.
- Updated champion quest dialogue browser suite at mobile/desktop and reduced motion: body >=18px, actual portrait does not overlap the caption, completion, no replay and defeat suppression.
- Existing distinct-dialogue browser suite: four mobile sizes, desktop, reduced motion; portraits/resources/controls remain unobscured, artwork modal priority, landing, selection/cancel, two speakers and no replay.
- AI storage/API integration plus existing fixture/pack regressions: 24 tests. Includes actual admin save/read/duplicate, invalid/mismatched/duplicate slot rejection, nonadmin rejection, quick-AI frozen loadout, unchanged player cosmetics, disabled skin fallback, delete cascade, idempotent migration and missing-table compatibility.
- New actual administrator UI browser suite: skin selection/save/reload at 360×740, 375×812, 390×844, 412×915, 1440×900 without horizontal overflow. Actual AI match starts with the saved opponent skin in VS intro and battle HUD.
- Existing cosmetics regression suite: authenticated two-client local PvP, reload, skins/emotes, failed-image fallback and AI start.
- Full workspace typecheck/build and scoped cosmetic/quest/cinematic tests.

Limits: no physical device or user study; no exhaustive live draft/tower runs. The quick-AI server snapshot and client wiring are tested/inspected separately; the new browser suite does not run an actual 30-second queue handoff. Standalone quest token reward/source-card finisher branches are wired and built, not individually covered by the new browser suite.

Screenshots: [caption](screenshots/20261027-skins-captions/champion-caption-390.png), [AI admin](screenshots/20261027-skins-captions/ai-admin-390.png), [AI intro](screenshots/20261027-skins-captions/ai-intro-390.png). These use isolated fixture data; they are not production-account captures.

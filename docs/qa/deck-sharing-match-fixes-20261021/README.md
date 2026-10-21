# Independent deck sharing and battle/admin fixes — 2026-10-21

## Changes

- HUD: the original two large stacked resource panels now show HP then gold. The original small bottom panels show deck/graveyard. No hand/portrait shrinking.
- Administrator entry: independent no-store session request, eight-second deadline, recovery/login after 1.5 seconds, generation and abort protection against stale responses. Reuse server authentication lookup. Cookies remain intact on transport failures.
- Zombie: only **other allied** RETIRE events grow an already-present, living, unsilenced Zombie. Enemy retirements and DESTROY do not. Explicit owner-approved wording supersedes dated fixture text; historical snapshots are preserved.
- Attack-ready cards use a subtle static gold glow rather than an artwork-covering badge. Enemy cards and exhausted cards do not receive the glow.
- Spell drag uses actual rendered field rows rather than a zero-sized `display:contents` container, preserving normal engine targeting, cancellation and resource validation.
- Result music: administrator victory/defeat upload, preview, volume and activation controls reuse existing media storage/table. Same-outcome activation is serialized and atomic. Result tracks play once, respect BGM settings and stop at navigation without overriding subsequent menu music. No sample tracks added to production.
- Deck sharing: share/import buttons, current public card/champion previews, existing card details, copy controls and hash links. Login retains the pending link. Imports always POST a new owned deck through the unchanged server validator. Insufficient ownership blocks saving; no cards are granted. Save/select/other-account access restrictions remain server enforced.

## Code format and database cost

`KO1.<unpadded base64url>` contains binary version 1, UTF-8 deck name, champion ID and public-content checksum, unique card IDs/counts/public-content checksums, then CRC32. UUIDs occupy 16 bytes; bounded non-UUID IDs are supported. Entries are sorted, duplicates and noncanonical encodings rejected. Total is exactly 25; maximum decoded payload 4096 bytes / code 5500 characters / pasted URL 7000 characters. CRC detects accidental damage and is not a signature or authorization mechanism.

Links use `/decks#deck=<code>` so the shared payload is a browser fragment, not a server query. No source account/deck ID, credentials or private entity metadata is encoded. Export permits published non-token cards and a published champion only. Current rule/display fingerprints warn about subsequent edits; deleted/unavailable IDs remain visible as errors and cannot be saved.

Creating/decoding a code performs **zero database and network operations**. Preview reuses the deck options already loaded. An unowned champion preview fetches the existing public champion catalog once per preview, with timeout/cancellation; this is metadata, not a sharing store. Explicit import uses the existing authenticated POST `/api/decks`. No sharing table, server decoding endpoint or schema migration. No deck-slot limit exists in the current server; this feature does not introduce or bypass one.

## Executed verification

- Workspace TypeScript, Vite production frontend build and API esbuild: PASS.
- Current engine suite: **2687 passed, 0 failed, 0 skipped**, including 100 seeded AI simulations using dated local fixtures. Four pre-existing historical/live-only suites remain excluded by the existing runner; this is not a fresh audit of every production effect.
- Independent codec/admin-session/audio unit tests: **34 passed**.
- Isolated PGlite HTTP: **3 deck-sharing tests + 3 result-music tests passed**. Actual login/session, POST/save/select, persisted deck -> real game setup/mulligan/play/surrender, ownership/quantity/rarity/token checks, other-account denial, activation persistence and concurrent same-outcome activation.
- Shared actual UI/engine: **44 browser groups**, four mobile sizes, PASS. Includes touch summon/attack/cancel, touch spell drag -> normal target resolution, non-drag spell controls, destroyed slots, graveyard actual cards and return selection, quests/upgrades, settings/history/emotes, restore and unchanged card sizes.
- Actual built deck UI: **8 groups**, PASS: 360×740, 375×812, 390×844, 412×915, 1440×900; share/link/new import, zero sharing writes, unowned preview blocked, login return, damaged code rejected. Intercepted local APIs, no production users.
- Actual built administrator UI: **4 groups**, PASS: general auth request pending while independent administrator entry succeeds, delayed session permits explicit login and cannot later undo it, guest denial, victory/defeat controls and persistence requests.
- Existing mobile history/modal checks: **11 viewport groups**, PASS. Existing portrait interactions/rotation/hand sizes 1/2/3/5/10: PASS at four phone sizes. Scroll reachability now measures actual rows and centers panels rather than relying on a nonexistent wrapper rectangle or subpixel nearest-scroll rounding.
- Actual Home -> server AI replay: **3 scenarios PASS** (emote, timeout, surrender). No production DB.
- Isolated real PvP: **14 HTTP + 8 browser groups PASS**, including two-account transport, frozen skins, image emotes, reload and opaque backs. Draft: **18 HTTP + 4 browser groups PASS**. Tower: **11 HTTP + battle browser PASS**, including KO -> result -> reward -> 25-card swap and existing timer policy. Tower's obsolete text-badge assertion now observes the new attack-ready class.
- Offline real-art board captures: five viewport sizes / ten comparisons, no page errors or missing artwork. Production gate: board included, QA scenes and legacy opt-in excluded.

## Review images and limits

[Battle 390](battle-390.png), [battle 360](battle-360.png), [result music](result-music-mobile.png), [deck sharing](deck-share-mobile.png).

Battle captures use dated actual artwork cached offline. Deck/admin images are real UI with isolated fixture records; deck artwork downloads are replaced with placeholders in that browser test, not presented as production artwork. All mobile checks are Chromium emulation, not physical-phone testing. No production matches, purchases, test grants or live two-account gameplay performed.

Deployment is explicitly authorized by the latest owner instruction. Production deploy receipts and the separately approved single Zombie text correction receipt are recorded after live verification. No database migration or reset is part of this release.

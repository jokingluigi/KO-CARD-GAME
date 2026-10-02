# Current wrestler audit — 2026-10-02

Scope: all 61 wrestler definitions visible in production admin: 51 PUBLISHED, 9 DRAFT, 1 DISABLED. Public records came from read-only GET /api/cards. The ten unpublished definitions were read from actual admin dialogs (including advanced JSON), and their exact IDs from the existing Test Game links. No card/champion/deck/account DB records or publication states were changed. Media and account information are not in the fixture.

The current fixture is `artifacts/ko-game/src/game/qa/fixtures/wrestlers-2026-10-02.json`. It is an observed snapshot, not a replacement production catalog. Ten dialog-read rows have no created/updated timestamps. New tests consume every row through the actual converter, Card instance generator, PLAY_WRESTLER / target continuation, and JSON serialization. Additional independent assertions cover actual current effects, exact stats, targets, owner/zone restrictions, retirement vs destruction, token generation, queued effects, attack and turn triggers, transformation, cancellation/refund, and key keywords.

## Repairs

- 디 오리진: null effect ID / empty config now resolves the existing three-graves-per-+1/+1 wording.
- 도쿵: attack gain adds the exact same amount to HP. The saved explicit health=0 previously masked LAST_ATTACK_DELTA.
- 데헌: current text has no hand-only wording; first attack increase on field grants Dodge. Later HP changes cannot repeat that first-attack reward.
- 만드릴쿤: HP-only changes no longer grant its attack-increase reward.
- 프랑켄슈타인 만드릴쿤: missing HP-increase reward implemented; attack-only changes do not trigger it.
- 좀비 데헌: missing RETIRE effect adds only maximum HP to Undead cards across both owners' stated zones. DESTROY does not run the retirement effect.
- 좀비 벨로나: missing damage trigger summons 1/1 Zombie, using the existing single-Zombie merge/growth system.
- Shared stat application: explicitly selected GRAVEYARD cards are now actually updated; previously targets could be selected but that zone was omitted from mutation. This also fixes the saved grave-inclusive 아포스틸/매드 사이언티스트 퍼플레인 configurations.

## Verification

99 new tests pass, including legal play/serialization for each of the 61 definitions. Full isolated engine/Tower/champion/AI/keyword/admin deck suite: 550 tests pass (includes the new 99). Shared, frontend and API TypeScript checks pass. Frontend build passes, bundle index-B3jSOEi7.js.

Old network-catalog QA was additionally run against the actual public snapshot: 70/86 passed, 16 failed. Those files contain obsolete descriptions/expectations (e.g. old Yeoul hand buff, Phantom Walker Rush, old stat values), absent published techniques, hand-effect assumptions and old token behavior. They were not weakened or treated as proof that the new catalog passes. Current acceptance is based on the independent snapshot-specific assertions; no crash-only effect PASS.

## Boundaries and remaining checks

WORK_BROWSER_FAILURE: direct navigation to authenticated /api/admin/cards was rejected with ERR_BLOCKED_BY_CLIENT. Actual admin UI remained accessible; dialog reading supplied the missing rows. An initial public catalog request timed out; one later request succeeded. No safeguard bypass was attempted.

Live post-deployment browser proof is pending. Every current definition has engine tests; this does not claim every card has been independently played in browser, every mobile layout, every online reconnect, or every combination of cards has been tested. Production maintenance stays OFF.

## Stream recovery — 2026-10-02

- Recovered repository: `/workspace/scratch/e84071811a26/ko-card-game`, branch `feat/tower-mode`, accepted engine checkpoint `6fcdbba`. The other checkout is an older gamepad branch. No reset/revert, catalog writes, deck saves or deletion occurred. The pre-existing uncommitted `pnpm-workspace.yaml` change was retained.
- Did not rerun the completed 99/550 tests or repeat the completed card repairs. These counts above are prior checkpoint results, not new runs during recovery.
- Actual production DOM loads `/assets/index-B3jSOEi7.js`, matching the checkpoint's built frontend. Existing administrator/test-account session remained usable and maintenance remained OFF.
- Used actual admin Test Game buttons and match controls. Origin was played with zero graveyard cards: cost 6 consumed, card appeared at 2/2, entrance dialogue completed, and turn controls resumed. This is only a zero-grave smoke check, not new browser proof of its three-grave scaling.
- In a disposable custom test match, Deheon appeared at 2/5. Played the DRAFT technique Maegaejo intending to create its first attack increase; it consumed gold/entered the graveyard but no target selector appeared and Deheon's detail view stayed 2/5 with no stat changes. Deheon's browser effect verification is therefore inconclusive. Technique observation is outside the wrestler repair scope; no production definition was edited.
- Current browser continuation is a disposable Zombie Bellona/Pandora deck (four of each per side), opened through Zombie Bellona's actual Test Game button. Observed current Pandora text explicitly restricts damage to enemy wrestlers; do not try to use it on allied Bellona. No Bellona damage-trigger browser PASS has been claimed.
- Remaining: independent browser effect proofs, including nonzero-grave Origin, first-attack Deheon, Bellona damage/merge, Zombie Deheon retirement and grave-zone mutation. The previous engine acceptance remains complete; browser acceptance remains incomplete. Preserve this distinction on further recovery.
- During recovery HEAD advanced to `e005dae` from another ongoing work stream. Incorporated its refreshed catalog and recorded Doqung/Frankenstein browser results below instead of repeating them. No process was stopped and no changes were reverted by this recovery. The previously visible workspace setting change is no longer in the working diff; this recovery did not remove it. The observed production bundle only proves the earlier built version, not deployment of the final revised Calavera/WarThunder repair.

A later read during the same audit found four external catalog edits: Calavera v12 (cost 4, revive <=3 without Taunt, null effect), WarThunder v8 (generate an unmodified wrestler, null effect), Luna v10 (HP 7), Baldan v14 (cost 2). The fixture was refreshed and both missing revised effects were implemented. Original values/states were not overwritten. All 550 tests pass against the refreshed fixture; shared/frontend/API typechecks and build pass again.

Actual production browser on index-B3jSOEi7.js: an unsaved 4-card admin test deck played Frankenstein Mandrill, Doqung, then Pi Star Seven. Frankenstein changed 3/2 -> 5/5, including its extra +1 HP. Doqung changed 3/4 -> 5/8, including the exact +2 HP from its attack gain. Pi Star retained 4/3. The actual event log showed the separate bonus events. No saved player decks were edited. Final revised Calavera/WarThunder deployment verification remains pending.

## Additional live proof — final revised deployment

Production DOM now loads `index-DLQdBDO0.js`, matching the revised Calavera/WarThunder build. In a separate disposable admin match, WarThunder cost 3 was consumed and exactly one generated-card event added an unmodified 3-cost 1/3 WarThunder to hand. The individual-card admin match supplies an isolated related-card pool, so this proves runtime generation/stat preservation, not the full-catalog distribution.

An unsaved four-card deck then played Lord at cost 3 and Werewolf Pandora at cost 4. At turn 9, selecting Lord for Werewolf's start-of-turn effect retired it and changed Werewolf from 2/6 to 4/9. Playing the revised Calavera consumed exactly 4 gold (5 -> 1), revived that cost-3 Lord at 2/3, emptied the graveyard, and added no Taunt. The actual board and event log were captured in `wrestler-live-calavera-1790943281001.jpg`. This supplies the cost-threshold boundary proof missing from the earlier browser record.

Current test game remains connected and interactive; no disconnect screen was observed. A preliminary allied Red Range damage attempt was absorbed by its Dodge (0 damage) and is not counted as retirement/transform proof.

At this continuation, six uncommitted source/test files from another ongoing work stream were present. Their exact binary diff was preserved in `/workspace/scratch/wrestler-concurrent-work-2026-10-02.patch`; they were neither altered nor committed here. Earlier 99/550 PASS counts apply to the tested deployment checkpoint, not those subsequent uncommitted changes. Remaining browser/mobile/online checks above are still not claimed complete.

## User-corrected zone rule — 2026-10-02

This rule supersedes the earlier grave-inclusive buff claims above. “어디에 있든” means HAND/DECK/BOARD, excluding GRAVEYARD. Converter drops graveyard from anywhere targets; stat targeting/mutation also excludes graveyard so stale configurations cannot buff it. Zombie Deheon only upgrades live zones.

Cards moved into graveyard, deck or hand restore original definition attack/health/cost and clear temporary modifiers/stat history. This includes draw, mulligan exchange, steal, deck-to-hand effects and hand-to-deck effects. Generated copied Zombie stats no longer overwrite its original baseline. Explicit post-movement modifiers such as Pumpkin’s same-turn discount still apply after reset. Buffs applied while a card is already in hand/deck continue to work there, but expire on its next movement into another hidden zone. Play into the field preserves current hand buffs. Retirement listener snapshots still retain pre-retirement stats for the retiring event; the graveyard card itself resets.

Verification: 532 isolated frontend game tests plus 22 shared Tower/champion-condition/admin-deck tests pass (554 total); frontend typecheck and build pass, index-CJ6sMd_b.js. New assertions cover boosted draw, hand-to-deck, retirement reset and rejection of graveyard buffs; existing draw-buff expectations were updated to the explicit new rule. Two additional live API test files could not connect to absent local servers (localhost:80/8080); no pass is claimed for these. Production data untouched. This build has not been deployed or independently verified in production browser.

Further actual browser proofs on the same revised bundle:

- Deheon was played at 2/5. Pi Star Seven raised it to 4/7 and the rendered keyword list gained Dodge. This replaces the earlier inconclusive Maegaejo attempt with a working actual first-attack-increase proof. Screenshot: `wrestler-live-deheon-1790943411635.jpg`.
- Maid Pandora dealt 1 actual damage to allied Zombie Deheon (3/1), retired it, and transformed into Werewolf Pandora (2/6). The retirement log applied maximum HP +2 to matching Undead cards, including the opposing hand; allied Zombie Bellona retained current HP 3, showing this did not heal. Graveyard contained one retired card.
- A second Maid dealt 1 damage to allied Zombie Bellona (HP 3 -> 2). Exactly one 1/1 Zombie was generated and summoned into the remaining board slot, with normal image/name/effect rendering and restored turn controls. Screenshot: `wrestler-live-zombie-effects-1790943520128.jpg`. Existing-Zombie merge and DESTROY exclusions remain covered by engine assertions, not independently re-proven in this browser run.

These checks used disposable admin decks only. No production catalog or saved deck was changed. Remaining exhaustive browser, mobile and online reconnect verification remains incomplete.

## Continued feature changes — test champions, Tower, maintenance and private ownership

Continued from `fcf6064` without resetting prior edits or repeating the completed 61-wrestler audit. Test-deck setup now selects both champions. Ordinary Tower floors use a normalized no-ability/no-quest champion with HP30; bosses at 4/8/12/16 and the hidden boss retain their champion. Additive startup migration 0035 creates the draft Tower portrait entry without overwriting an existing entry. The ordinary champion cannot activate an ability even through a direct engine action.

Tower boss choices come from enabled, valid AI-match decks, with the same reference validation and sizes 1–100. New run snapshots resolve legacy boss selections to available AI-match decks; explicitly chosen removed/invalid AI decks fail validation. AI definitions and champion configuration are snapshotted in the same repeatable-read transaction. General enemies continue using their separate Tower preset pool; running snapshots remain immutable.

Tower OST editors accept MP3/OGG/WAV file attachments through the existing signed upload/verification/registration flow. Registered audio is disabled in title/global game pools and can be previewed, detached and adjusted in volume. Saving is blocked during attachment uploads; concurrent slot uploads merge into the current draft rather than overwriting each other.

Maintenance login validates credentials and then rejects every non-ADMIN account before creating a session. The maintenance screen exposes login only. Existing authenticated ADMIN recovery access remains supported.

Tower and quest reward targets accept draft cards/champions, and CHAMPION rewards now use the shared idempotent grant service to record champion ownership. Normal accounts may list and play draft definitions only when actually owned; copies must not exceed owned quantity. ADMIN accounts can compose unpublished definitions without ownership. Disabled definitions and direct token inclusion remain blocked. Deck listing, saving, representative selection and online/AI combat definition loading follow this rule; collection views include owned drafts without adding them to public crafting pools.

Validation uses isolated PostgreSQL WASM only; no production catalog, user collection, saved deck or season was modified. Targeted Tower/ownership/reward/media/maintenance tests, shared/frontend/API typechecks and frontend build were run. Persisted battle restart comparison uses the JSON representation, because JSON storage omits optional undefined properties introduced by the prior zone-reset fix. This change has not been deployed or verified in the production browser.

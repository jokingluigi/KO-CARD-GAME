# Latest administrator card refresh — 2026-11-19

Source: authenticated administrator catalog, including DRAFT cards. The catalog was re-read after the user's additional edits; a final pre-release read found no further gameplay changes. Sanitized reviewed records are in `docs/qa/snapshots/20261119-refresh/cards.json`.

- Star Killer v10: cost 7, 1/7, no starting keywords, still a LEGENDARY token. On draw/new hand creation, reveal, destroy all Wanted wrestlers in both hands and fields, gain +1 attack per actual destruction, then summon onto the opponent's field. Preserve the approved cheapest-opponent-wrestler clearance rule for a full field; that extra clearance does not add attack. A Wanted Star Killer is included by the printed “all” wording and is not resurrected/summoned after destroying itself.
- Wanted Notice v7: cost 7; its existing retirement/exit effect marks the enemy field and inserts Star Killer at the top of the opposing deck. Existing deck order is retained behind it; no shuffle or premature hand-arrival effect occurs.
- Edelweiss v5: 3/5 with Armor 1 and Wanted. Entry still asks for an enemy target. Later enemy Wanted retirement marks a random eligible enemy and generates Dragon Breath, without a manual target picker or repeating the old entry selection. With no enemy left, Breath still generates. Own retirement, unmarked retirement and destruction do not trigger this passive.
- Werewolf Pandora v23: LEGENDARY rarity with `isToken: true`. Its existing turn-end absorb/dodge is unchanged. The owner's clarification is explicit: token flags retain token classification irrespective of the rarity label. Standard generation excludes it; FULL generation can still include tokens under the existing FULL-pool contract. Deck, collection, pack and AI-deck paths were audited for token-flag checks and already exclude such tokens from ordinary-card eligibility.

Implementation adds standard hand-zone destruction (actual destruction events, normal Wanted reward attribution, no retirement/field-only destruction triggers), an enemy-deck-top insertion operation and a removed-target-keyword condition for automatic retirement passives. Legacy reviewed wording/configurations retain their old behavior for historical snapshots; the current administrator wording selects the revised effects.

No production card/champion data was overwritten or published. Three reviewed cards remain DRAFT; Pandora remains PUBLISHED. All 12 administrator champions have unchanged mechanics. Earlier music/offset controls and Claude presentation work remain in the source ancestry.

Validation: 305 selected engine/online regression cases passed, including 16 current-refresh cases. Coverage includes both hand/field wipes, actual +1 kill count, non-wrestler/deck/graveyard exclusion, full fields, source self-destruction, generated arrival, deck-top ordering and next draw, random Edelweiss retargeting, empty enemy fields, token classification/standard-pool exclusion, and no field-only growth for hand destruction. Full workspace typecheck and production frontend/API builds passed.

## Verified production release

Merged release revision: `6e471dafae55966be84bfd4ae64484fc9b0bccb8` (card implementation `1b13a246e11616d41b4293b50063eab628671061` plus current production `e6aa29ca3a50202c6c24272b4a458aea605ad6e6`). All 18 Claude presentation files match that production revision exactly; no presentation rollback occurred.

API `dep-dbv5v467bikc73fm4jf0` and frontend `dep-dbv608u7bikc73fm7odg` are live at the merged revision. Public health, actual frontend JavaScript and version.json all match. Authenticated post-release reads match the four reviewed card texts/stats/keywords/statuses/token flags; the public Pandora record explicitly reports LEGENDARY and isToken=true. The frontend environment approval guard is preserved.

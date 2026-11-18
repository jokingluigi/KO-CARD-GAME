# Administrator card/champion revisions, 2026-11-18

Source: the live public `/api/cards` and `/api/champions` catalogs, not the sparse local fixture database. The owner confirmed that updates normally happen in the administrator UI and explicitly corrected Rosie's champion wording from maximum to minimum. For future effect-update requests, inspect administrator/public saved revisions first; do not assume a new Git commit or uploaded document is required.

Reviewed mechanical records are retained in `snapshots/20261118-admin`. Existing card art, base stats and keywords continue to come from the saved catalog. The new rules match exact reviewed IDs and wording and do not blindly override later administrator descriptions or explicitly authored card configurations.

Implemented:

- Joking Luigi: adjacent Authority summons gain Surprise, exclude the source and champion tokens; tagged allied attacks buff both attacker and listener; conditional invulnerability and forbidden Taunt. Removed the obsolete summoned-ally +1/+1 listener for this revision.
- Rosie wrestler: return the original hand to deck, fill from the FULL generation catalog, reduce cost/attack/health by one; minimum cost/health one, attack floor zero. Generated instances do not mutate catalog definitions.
- Rosie champion: FULL random generation with the same three stat reductions and cost/health floors. Existing finisher conditions and choices remain intact.
- Werewolf Pandora: selected allied sacrifice, absorption and dodge at turn end, with no turn-start activation.
- Maid Pandora: transform on actual pinfall without the former entry damage.
- Blackmacaron champion: two damage, actual-retirement summon and five own-ability retirements for the finisher. Preserve existing finisher link.
- Crusaders: random allied attack +1 and champion heal two; quest health threshold three, while excluding a defeated champion.
- Existing saved Sovereign and Mafia Macaron mechanics already match their updated wording and remain covered. Mafia Luigi's unconditional saved IMMUNE is suppressed while the reviewed conditional field-protection ability controls invulnerability.

The owner-authorized typo correction was saved through the production administrator API with optimistic version checking: `champion-minion-a` version 32 → 33, only `abilityText` changed from 최대치 to 최소치. No other administrator data was overwritten by that request. Runtime adaptation of the other reviewed descriptions is implemented in shared source, so online server and browser must both receive the same release.

Validation before release:

- Whole workspace type check passed.
- Frontend and API production builds passed (existing tutorial chunk warnings remain).
- New revision tests, prior November 11 balance tests, and AI evaluator: 130 passed.
- Generation, turn system, combat, champion system and Minion A suites: 78 passed.
- Existing unrelated baseline failures documented in the earlier retirement handoff were not reclassified as fixed.

The source commit also contains the earlier owner-requested Tower/VFX retirement changes inherited from the handoff branch. Deployment status is established separately by Render live commit and public health/version responses, not by a successful local build or Git push.

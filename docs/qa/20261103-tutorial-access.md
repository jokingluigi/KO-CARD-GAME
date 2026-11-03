# Tutorial access, canonical rules and hidden-zone stat growth — 2026-11-03

## Implementation
- Main menu: distinct Tutorial and Game Rules actions. Existing six interactive lessons remain actual common battle UI, independently reachable without an owned deck. Rewards no longer hides the learning entry.
- Single rule reference shared by /guide, tutorial dialog and battle settings. Short in-battle hints are explicitly labeled as hints. Five ordered chapters: preparation, combat, champion/token, keyword dictionary, account/rewards. Search remains relevance-ranked.
- Dedicated champion/token chapter (7 questions): commander vs field token, actual deployment, protection, full field handling, leaving field, silence immunity and awakening. 33 FAQ plus 18 keyword definitions overall. Documentation reflects existing engine rules; those rules are not changed.
- STAT_CHANGED growth passives include deck alongside hand/field. Hand-only generic trigger gate no longer suppresses stat growth. SELF effects follow the changed instance's current zone, including historical definitions authored as BOARD or HAND+BOARD. Other triggers/targets, card definitions and ownership stay unchanged. Existing internal-listener recursion guard is retained.
- Optional journal/recovery storage is detected through read-only table checks. Missing optional tables yield explicit setup-pending responses, preserve local records and do not prevent ordinary password changes. Migration 0057 is not applied or added to startup.

## Validation performed
- Typecheck across libraries, frontend, API, scripts: passed. API and frontend production builds passed.
- 395 tests passed: account/recovery/journal API tests using isolated PGlite, guide content, champion protection/immunity, reviewed card behavior, hidden-zone growth, fusion.
- A separate read-only fetch of the current production catalog (152 definitions) was used for another 12 passing growth tests; no production actions or card edits were sent.
- Hidden-zone tests cover hand/deck/field attack and health growth, repeated external growth, no-change/decrease, combined growth once, disabled abilities, graveyard exclusion, no definition mutation and actual published Mandrill/Frankenstein definitions. The previous Frankenstein “never deck” regression expectation was intentionally updated to the requested behavior.
- Main/tutorial/reference browser checks at 320×568, 360×640, 360×740, 375×667, 390×844, 844×390, 1440×900: tutorial entry, all 6 lesson entries, shared reference dialog, 5 chapters, 7 champion FAQs; menu controls fit and are hit-testable with minimum 44px targets. Short-screen and landscape adjustments preserve the direct entry.
- Existing match browser: 390×844 and 1440×900 champion-token badge/inspector and shared battle rules dialog; closes back into the match. Public guide checked at four sizes.
- Complete actual six-lesson playthrough at 390×844, 740×360, 1440×900 with isolated read-only API fixtures and no production writes; includes targeting cancellation, active ability, quest, victory, persistence, reset, rotation and real card drag.

## Evidence and limits
Screenshots and test outputs: [20261103-tutorial-access](20261103-tutorial-access/). Browser tests use isolated account/catalog fixtures; they do not establish real-user login, live matchmaking, purchase or cross-device sync success. No manual production DB changes or main merge. Deployment receipt is recorded separately after live verification.

## Production deployment constraints
The API was deployed at commit `466b722934ccbd71e960002cec152d7fac6874b6` and returned health 200. Live capability checks report `emailRecovery: false`, `journalSync: false`. These optional services remain pending because email configuration / reviewed storage migration have not been activated. Local records continue to work; missing storage does not trigger a manual production migration. See deployment receipts for the final frontend verification.

## Deployed UI follow-up
The deployed public rulebook passed on 390×844, 844×390 and 1440×900 without account/catalog fixtures or production writes. An initial deployed-home fixture check caught overflow before web fonts completed loading at 320×568. Added short-screen hero compaction and medium-small screen spacing reserve, and made measurements explicitly await font settlement. Both the normal-font and deliberately blocked-font seven-viewport suites now pass locally; the final frontend receipt and deployed fixture results record the follow-up release.

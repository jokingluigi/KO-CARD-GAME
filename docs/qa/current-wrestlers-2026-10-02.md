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

## Verification before deployment

99 new tests pass, including legal play/serialization for each of the 61 definitions. Full isolated engine/Tower/champion/AI/keyword/admin deck suite: 550 tests pass (includes the new 99). Shared, frontend and API TypeScript checks pass. Frontend build passes, bundle index-B3jSOEi7.js.

Old network-catalog QA was additionally run against the actual public snapshot: 70/86 passed, 16 failed. Those files contain obsolete descriptions/expectations (e.g. old Yeoul hand buff, Phantom Walker Rush, old stat values), absent published techniques, hand-effect assumptions and old token behavior. They were not weakened or treated as proof that the new catalog passes. Current acceptance is based on the independent snapshot-specific assertions; no crash-only effect PASS.

## Boundaries and remaining checks

WORK_BROWSER_FAILURE: direct navigation to authenticated /api/admin/cards was rejected with ERR_BLOCKED_BY_CLIENT. Actual admin UI remained accessible; dialog reading supplied the missing rows. An initial public catalog request timed out; one later request succeeded. No safeguard bypass was attempted.

Live post-deployment browser proof is pending. Every current definition has engine tests; this does not claim every card has been independently played in browser, every mobile layout, every online reconnect, or every combination of cards has been tested. Production maintenance stays OFF.

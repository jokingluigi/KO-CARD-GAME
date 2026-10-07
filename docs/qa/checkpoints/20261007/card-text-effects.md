# Current card-text effect audit (2026-10-07)

Source: live /api/cards (85 definitions) and /api/champions (7 champions). Public catalog snapshot is fixtures/cards-2026-10-07-public.json. Base cost/ATK/HP and administrator descriptions are unchanged.

## Effect changes
- Gilded Orb Master: base cost >=6, hand only; discounts remain valid after previous discounts.
- La Calavera: cost <=3 graveyard revival, then TAUNT only on the revived instance.
- Luna MK: silence selected enemy on entrance; destroy silenced enemies at own turn END.
- Madokawa: +2 wrestler outgoing damage; other friendly wrestlers take +1 damage. No attacker retirement for current description. Silence/removal disable the aura; prevention/armor still apply.
- Mad Scientist Purple Rain: +1/+1 and REGEN to experiment cards in own hand/field only.
- Cassandra: health +1 and REGEN to authority cards in own hand/field only; end-turn healing unchanged.
- Phantom Walker: +1/+1 street cards in own hand/field only.
- Helper: entrance generates Nyanny Punch; last own-turn overflow must exceed 3, as printed (previous engine incorrectly required >5).

Historical description snapshots retain their old behavior through text-based compatibility. Authored structured scripts continue to take precedence.

## Additional engine defect
AI 100-match run reproduced 4 interrupted games with duplicate graveyard instances. Lethal SELF_DAMAGED trigger resolution could retire Zombie Bellona during its token summon, after which the damage executor retired its stale snapshot again. Revalidate field membership after damage preparation and lethal damage triggers. Damage is recorded before nested SELF_DAMAGED resolution so state-based retirement retains its current root damage cause; this also fixes Hilbil kill healing against Zombie Bellona. Exact-zero and retirement prevention remain covered by regressions. The same 100 seeded matches now all terminate successfully: 5667 actions, 20227 events, no interruption, duplicate instance, timeout or invalid action.

## Validation
- PASS: current-card descriptions and base stats, hand plays/casts for all 85 public cards; focused zone, trigger, damage, silence, armor, defense and duplicate-retirement assertions.
- PASS: 1471 full engine/current-fixture/AI tests; 100 focused current-description checks; 196 additional exact-output public-catalog semantic checks (retire/destroy/revive, generation, passives, spell results, lifesteal, armor, silence and attack triggers).
- PASS: 312 startup/backend/current-card tests before additional regression assertions.
- FAIL -> FIXED -> PASS: AI 100-match stress test (96/100 ->100/100).
- PASS: TypeScript/server/client production build.
- PASS: real Chrome desktop mouse/keyboard and mobile touch card-description popup/input-isolation checks.
- PASS: current champion abilities smoke: 14 executions, no failure/unverified ability.

## Verification boundaries
Older live-catalog tests published-effects-qa2, targeted-card-fixes and published-catalog-qa still include pre-existing obsolete expectations (e.g. Origin +1 per card instead of per two, Calavera revival without TAUNT, Deheon hand-only, old Champion quest/reward schema). Initial live combined run recorded 19 failures after excluding the subsequently fixed AI duplicate defect; these include obsolete fixtures and expectations and remain explicitly not passing. These suites are retained rather than weakening their assertions; do not count them as PASS. The current fixture/behavior suite and full offline engine suite are the regression gates for this patch.

No authenticated production PvP two-client match or physical mobile session was available; those remain UNVERIFIED. Unpublished/unreferenced draft and disabled administrator cards are not returned by the public catalog and are outside the 85-card inventory. Successful hand play and AI stress are not proof of every conditional effect in every combination.

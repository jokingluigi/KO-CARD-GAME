# Balance patch — 2026-10-24

Branch based on main `ce1c65c`. Authenticated read-only administrator snapshot: 163 cards, 11 champions. Stable IDs are used throughout; no catalog reset or seeded replacement records.

## Confirmed changes and decisions

- Milk Maid: 2/4, retain Taunt; replace old pre-hit attack reduction with a retirement exit giving **all surviving friendly wrestlers and the champion +2 current/max HP**. Existing DESTROY/VANISH semantics suppress exit effects. No resurrection of simultaneously dead cards.
- Zombie: **other allied retirement growth +1/+1 at most twice per card per global turn**. Summon absorption remains unlimited. Only the exact reviewed limited wording opts in; frozen older descriptions retain their original semantics. Persist a small optional per-turn counter with game state; no new table or per-event DB writes.
- Calavera quest goal 15, Jaeger 10, Pandora 5, Purple Rain 10. User explicitly approved synchronizing the four old descriptions to these actual configured goals. Fix legacy Calavera migration that previously overwrote a valid authored 15-goal with 10. Other current goals already execute from administrator settings.
- Administrator data already carries RM Udyr 3/3 (entry doubles to 6/6), Zombie Bellona max HP 3, Bull Grandpa without printed Armor, champion Luna HP 25, Minion A ability cost 1. Validate actual actions rather than rewriting these fields.
- Ruina re-published; Diamond Luna family and Runestarlight Luna unpublished as configured. Preserve status and random-pool policy. Actual Luna fusion quest still resolves its private reward through the existing complete effect catalog.
- MPG's changed wording is the previously shipped patch, not a new change to its rule. No rows were deleted or recreated. Crusaders' changed intro line passes through existing presentation data.

## New global retirement rule

User requested that personal enemy-retirement effects **do not trigger on basic counterattack kills**. Track combat hit role in serializable attribution, recover older games from actual attack/damage events, and gate both direct SOURCE_RETIRED_TARGET and registered SOURCE_CAUSED_TARGET_REMOVAL paths. Actual retirement events, victim-side Zombie growth, ordinary retirement quests and explicit card/ability kills remain intact. Tests cover Deheon, Rion, Beginner Gladiator, Zombie Deheon, Hasui, Hilbil and rampage Pandora. The prior three Hilbil counterattack-heal expectations are deliberately changed to the new rule; direct attacking kill healing and nested damage provenance regressions remain enabled.

**Pending clarification:** whether the same counterattack exclusion also disables Karzael's *before-retirement replacement* (Destruction Messenger). Existing replacement behavior is preserved pending the user's answer; no production deployment is permitted until this decision is incorporated.

## Executed validation

- Focused new balance suite: **63 PASS, 0 FAIL, 0 SKIP**. Actual hand play, targeting, champion ability, exact quest completion boundaries, enemy/ordinary-effect exclusions, retirement growth caps/reset/retry/serialization, unlimited summon absorption, suppression, private reward fusion and 7-card attack/counterattack/effect kill matrix. [Results](focused-tests.log).
- Existing Hilbil suite: **50 PASS** after updating the three counterattack expectations to the newly requested rule.
- Full supported engine runner: **2,814 PASS, 0 FAIL, 0 SKIP**, 107.03 seconds. Included 61 initial balance cases; the final two were run in the focused 63-case suite. Four pre-existing historical-catalog exclusions remain excluded, not labeled passed.
- Explicit latest administrator snapshot AI run: **100/100 matches complete**, 4,680 legal actions, 90 champion pairings, 50 first-player games per seat; both accompanying tests pass. [Report](ai-100.md).
- Full workspace typecheck and production frontend/API build: PASS. An initial build correctly exposed two new modules missing from the shared engine's explicit TypeScript include list; list updated and complete build rerun successfully.
- Initial Milk Maid test mistakenly expected a DESTROY exit trigger; corrected the test to the existing documented destruction rule, without changing game semantics.

All gameplay tests are local fixtures and the real shared engine. No live production test match, physical phone, fresh two-client PvP, or live draft/tower session was run. No production cards, stats, rewards or database schema have been modified. The four approved quest-description-only writes will use the existing version-checked admin endpoint after release, with fresh reads and full read-back checks.

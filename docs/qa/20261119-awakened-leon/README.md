# Awakened Leon: incomplete removal count during area damage

Reported in an AI match: four allied wrestlers left play but Leon had only 1 ATK. The published Leon record has base ATK 0 and grants floor(allied RETIRE + DESTROY events / 2) on summon. No administrator record or wording was changed.

## Reproduction and fix

Place awakened Wimari at slot 1 or 2 with three ordinary allies, each at 1 HP. Apply one 1-damage area hit to the entire allied board. Before the fix, all four allies retired, but Leon entered halfway through the per-target loop and received only +1. Slot 0 produced +0; slot 3 produced +2. Removing all four first through the state-based-death path did not reproduce the problem, which is why older entry and chain tests passed.

A synchronous removal scope now defers self entry buffs based on allied removal history until that multi-target DAMAGE/RETIRE/DESTROY effect finishes. It counts actual removals, preserves ordinary target/damage/leave listeners, freezes the completed batch's count before stat listeners, and applies the queued buff to the same surviving field entry only. The scope is cleared before the outer effect returns. This is a one-time summon bonus, not continuous growth from later effects or turns.

## Verification

- New focused suite: 14/14 pass, including both player seats, retirement/destruction, serialized states, tank/healer chain, simultaneous deaths, all four healer positions under area damage, Dodge/survivor exclusions, odd-count rounding and no later growth.
- Reproduction before patch: 3 failing slot cases (0, 1, 2); all now pass.
- Related engine, awakening and November 11 content regression suites: 880 tests, 876 pass and 4 fail. The four failures are the pre-existing AI legacy/NORMAL/HARD/BOSS active-stage target-choice assertions. They also failed against the unchanged HEAD engine in a separately bundled baseline run (58/62 pass). No new failure was introduced in this run; those AI assertions were not changed.
- Frontend and API typechecks passed; both production builds passed after merging the latest production targeting-reticle correction (`6809e61`).
- Existing card/champion data, battle presentation and Claude's frontend deployment guard are preserved.

Deployment results are recorded after live revision verification. Already running AI matches use their loaded JavaScript; reload before starting a new match after release.

## Live release

Both services now serve `9a4bcd0ba388e418ee611c37227d37fd6e9ef7dc` (HTTP 200 and exact public revision verified on 2026-11-19, approximately 22:31 KST).

- Frontend: `dep-dbvfjft6e07s73bm7he0`; existing `APPROVED_PRODUCTION_COMMIT` build guard preserved; approval advanced to this release.
- API: `dep-dbvfjhks728c73e25lp0`; existing guarded release workflow used.
- Both deployments are forward from their previous live revisions. Claude's targeting-reticle correction and all prior card updates are included. No paid hosting changes or game-data writes were performed for this fix.

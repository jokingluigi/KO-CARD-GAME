# Administrator card/champion update (2026-11-19 content batch)

Source: authenticated administrator catalog (202 cards, 12 champions), including drafts. Public catalog alone contains 182 cards and 11 champions and is insufficient for this review. Mechanical snapshots are under `docs/qa/snapshots/20261119-admin`; images, audio, accounts and credentials are excluded.

## Implemented effects

- Nebra: current “임명” wording retains +2/+2 and combat attack drain.
- Karzael: +2/+2, replace caused enemy retirement with destruction, +1/+1 per field destruction. Terminology is now 파괴의 사자.
- Rive: grant +1/+1, draw on attack, grow for each successful draw (including overdraw) and newly generated hand card, including techniques. Returns and fatigue do not count as creation/draw.
- Dragon Breath: 3 damage to the selected enemy wrestler; only exact lethal damage deals 1 to the enemy champion. Cast techniques now preserve their non-cast abilities during resolution, and their graveyard source can receive the causal pinfall trigger.
- Rosetta: draw the highest-rarity eligible deck card, excluding CHAMPION; retain the relative order of all other deck cards. No eligible card means no draw.
- Edelweiss: Wanted on the selected enemy and generate Dragon Breath; repeat entry for enemy Wanted retirement, not destruction or unmarked retirement.
- Briganda: if the owner has next-turn bonus gold, generate a standard PUBLISHED non-token EPIC/LEGENDARY wrestler with +1/+1 and Wanted. Do not consume the bonus.
- Wanted Notice: on retirement/exit, mark the opposing board Wanted and shuffle Star Killer into the opposing deck. Destruction continues to bypass exit under existing game rules.
- Star Killer: reveal on draw/new hand creation, destroy Wanted wrestlers on both boards, gain +2 attack per actual initial Wanted destruction, and summon that same instance onto the opponent's board. If full after Wanted removal, destroy the lowest-current-cost opposing wrestler (first board slot breaks ties); this additional removal does not grant the Wanted kill bonus. Return to hand and overdraw do not retrigger arrival.

All 12 administrator champions were checked for executable abilities, publication state and retained saved finisher definitions/choices. No champion data was replaced with an older snapshot.

## Explicitly approved administrator text changes

The user approved these corrections in chat. Text edits were saved through authenticated administrator endpoints; only `text`, `version`, and `updatedAt` changed:

- Karzael v10 → v11: 파괴의 전령 → 파괴의 사자.
- Edelweiss v1 → v2: repair the quotes around 드래곤 브레스.
- Star Killer v5 → v6: 손패에 생성; append the full-opponent-board rule approved by the user.

PUBLISHED/DRAFT states were preserved. Drafts were not automatically published. Future ambiguous wording/typos still require asking the user.

## Collaboration and deployment

This batch descends from production `e5ea2170e2567df2ad9f1cb9e62d81fa4314da15` and receipt `8774cf77e12b569ebba42a5d20501a9a83d54b5a`. Claude's presentation, sprites, audio and frontend deployment approval environment gate are retained. No schema/seed synchronization or production catalog reset is involved.

Validation: 289 selected tests passed, including 29 dedicated current-content cases plus Nov18/Nov11 balance, pinfall sources, Wanted, draw, generation, technique, structured effect and online sanitization regressions. Full workspace typecheck and production frontend/API builds passed. Historical draft mutation bounce and awakening AI failures are outside this selected passing regression suite.

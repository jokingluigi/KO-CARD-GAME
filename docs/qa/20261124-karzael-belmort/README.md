# Karzael + Belmort: duplicated descended token

## Reproduction

The public November 24 catalog links Belmort's tenth destruction to the instant-cast finisher `파괴의 강림`, which clears both boards and summons one `마왕 벨모르트(강림)`. Play Karzael, appoint an allied wrestler as the Destruction Messenger, then complete Belmort's quest. With the messenger behind Karzael in board order (reproduced at slots 1 and 3), the old code produced **two** descended tokens despite only **one** quest-completion event and **one** finisher auto-cast event. A messenger in slot 0 masked the defect by being destroyed before its ally.

The minimal public fixture stores only the relevant card/champion rules and no account or cosmetic data. Nine preceding destruction events are performed through the actual engine, and Karzael is played and targeted through legal game actions.

## Cause and change

A `CARD_DESTROYED` growth buff started a child effect frame while the finisher's board-clear frame was still running. Finishing the buff resumed the parent's next SUMMON early. The original board-clear call then returned and ran that SUMMON again.

Automatic destruction-growth BUFF/ADD_KEYWORD effects now use the same inline handling already used by entry and exact-zero buffs. They finish inside the current destruction event without advancing the outer frame, preserving the parent until the entire clear returns. No token cap, once-per-match summoning restriction, card text/configuration rewrite, or change to quest progress/rewards was added. Explicit multi-summon effects remain multi-summon effects.

## Validation

- New regression suite: **25 passed**. Both seats, every host slot, messenger combat kills, champion-ability kills, ordinary controls, serialized game state and repeated quest processing each produce one completion/cast/token entry. A generic two-listener board clear also verifies exact growth, two explicitly requested summons, and a gold follow-up applied once.
- Related engine, November 19 card updates and Belmort champion regressions: **792 passed**, no failure.
- Shared-library/API/frontend typechecks passed; both production builds and the deployment guard tests are checked before release.
- Latest production administrator UI work (`f9dd774`) was merged and preserved. Only the shared engine behavior and test/QA files are changed by this fix; no administrator-owned database record is written.

Live deployment verification follows below.

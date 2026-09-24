---
name: Generated card scope
description: Durable Generated identity and default target-scope rules for KO cards
---

Generated is an instance identity, not a card-definition or name property. Initial deck instances must remain non-generated; creation APIs and creation effects explicitly opt into `isGenerated: true`, and movement between zones must copy the same CardInstance rather than reconstructing it without the flag.

**Why:** Marking every instance created by a generic constructor as Generated makes ordinary deck cards match generated-only effects, while resetting the flag during a move makes the same card change meaning.

**How to apply:** Register Generated as a reusable target filter. Interpret Korean “어디에 있든”, “어디에 있는”, “모든 위치의”, and “손패·덱·필드” scopes as HAND + DECK + BOARD. Do not include GRAVEYARD, REMOVED_FROM_GAME, CAPTURED, or special storage unless a future effect explicitly adds those zones.

When card text names a specific definition, resolve it through a unique `CardDefinition` reference rather than assuming a matching tag. If the text also gives exact generated stats, set those stats on the generated instance instead of applying a delta to the definition's base stats.

**Why:** A named card can lack the corresponding tag, and additive modifiers depend on its current base stats; either assumption can make a valid effect select or create the wrong card.

**How to apply:** Use the stable definition ID for script filters and creation, fail analysis when the reference is missing or ambiguous, and use generic `SET_STATS` when the source specifies the generated card's exact stat line.
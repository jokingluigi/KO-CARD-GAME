---
name: Generated card scope
description: Durable Generated identity and default target-scope rules for KO cards
---

Generated is an instance identity, not a card-definition or name property. Initial deck instances must remain non-generated; creation APIs and creation effects explicitly opt into `isGenerated: true`, and movement between zones must copy the same CardInstance rather than reconstructing it without the flag.

**Why:** Marking every instance created by a generic constructor as Generated makes ordinary deck cards match generated-only effects, while resetting the flag during a move makes the same card change meaning.

**How to apply:** Register Generated as a reusable target filter. Interpret Korean “어디에 있든”, “어디에 있는”, “모든 위치의”, and “손패·덱·필드” scopes as HAND + DECK + BOARD. Do not include GRAVEYARD, REMOVED_FROM_GAME, CAPTURED, or special storage unless a future effect explicitly adds those zones.
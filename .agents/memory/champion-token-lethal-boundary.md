---
name: Champion Token lethal boundary
description: Rules separating direct Champion Token retirement from Champion defeat and protection.
---

Directly deployed Champion Tokens use only their CardDefinition attack/health. Their lethal combat, effect damage, and fatigue damage retire the token through the normal graveyard and leave-listener flow; they do not finish the match or transfer damage to the original Champion. The original Champion becomes targetable again once the token leaves the board. Direct deployment still preserves the existing SILENCE, DESTROY, and REMOVE_FROM_GAME immunity.

**Why:** The token is a protected board representative, not an extra pool of Champion health. Treating its retirement as Champion defeat made ordinary token damage unexpectedly end the match.

**How to apply:** Keep protection checks based on a live `isDirectDeployedChampion` board instance. Keep token deployment separate from generic SUMMON/GENERATE paths, and route every lethal token path through normal RETIRE/LEAVE_FIELD processing without setting terminal match state.
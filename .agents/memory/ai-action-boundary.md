AI opponents may use persisted AI Deck Definitions that store only CardDefinition and ChampionDefinition IDs. At match start, resolve those definitions into the GameState snapshot; never let later admin edits mutate an active match.

**Why:** AI decks need admin management and future card compatibility without duplicating card data, while active matches must remain deterministic.

**How to apply:** Validate AI decks against current PUBLISHED non-token definitions when listing/enabling/starting. Use the same legal-action dispatcher and generic evaluator after every AI action; do not add card-name branches.
---
name: AI action boundary
description: Rules for deterministic local AI turns and visibility-safe action selection.
---

The local AI must advance matches through `getLegalActions → chooseBestAction → executeAction`, never by mutating `GameState` directly or branching on card and Champion names. Pending `PLAYER_CHOICE` states are represented as legal target-selection actions from the engine’s `validTargetIds`. Evaluation may inspect the AI hand and both public boards, but must not use the opponent’s hand, deck order, or future random outcomes. Unknown structured effects receive neutral heuristic value while the normal game effect engine remains the execution authority.

**Why:** Keeping decision-making behind the same action boundary as human input prevents AI-only rule bypasses and makes target continuations, combat validation, and terminal results follow the existing engine rules.

**How to apply:** Add new AI behavior by extending the action union, legal-action generator, dispatcher, and generic heuristic together; keep presentation delays and cancellation in the UI layer.
---
name: Causal transform effects
description: Safety rule for effects that only execute when a preceding effect caused a specific state transition.
---

Conditional follow-up effects such as “transform only if this damage retired the target” must carry an explicit typed causal marker in structured data. Runtime resolution must verify the exact source effect, target instance, and resulting event before applying the follow-up.

**Why:** An unconditional second effect can transform or otherwise mutate state after a nonlethal hit, prevented hit, or unrelated retirement while the card text claims a causal condition.

**How to apply:** Keep the causal marker in the shared registry and server validator, emit it from the analyzer, and evaluate it from committed event history in the engine. Add both nonlethal/prevented and exact-lethal runtime tests; do not encode the condition as a card-name branch.
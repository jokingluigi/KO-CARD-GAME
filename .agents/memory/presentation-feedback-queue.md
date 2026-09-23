---
name: Presentation feedback queue
description: Rules for the KO client-side event feedback layer
---

KO presentation feedback is a client-only queue over the committed GameState event log. It may show damage, card movement status, quest, gold, and stat-change cues, but it must never delay or recalculate engine actions.

**Why:** Game actions already resolve synchronously and nested effects can append many events at once. A visual queue is needed for readability without risking duplicate triggers, partial state, or animation-dependent rules.

**How to apply:** Consume appended events with a cursor, clear cosmetic queues when the event log resets, preserve event order, and deduplicate by stable event identity rather than only array length. Use DOM refs or cached geometry for removed targets, and make reduced-motion completion advance by a short timer rather than normal travel duration. Keep queue completion callbacks stable so a parent state update cannot restart an active presentation timer. Prefer explicit effect events when the engine gains them; until then, infer untagged stat changes only when no damage/removal event explains the delta.

**Why:** An inline completion callback is a new dependency on every render; quest presentation effects that depend on it restart their timers when the AI commits another state, which can leave the scheduler waiting indefinitely.
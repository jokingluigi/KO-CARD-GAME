---
name: Attack target projection
description: How attack presentation chooses the target geometry in viewer-relative game projections
---

When an attack targets a player, presentation must inspect the event's target player ID and resolve the corresponding viewer-relative Champion DOM element. Do not infer the target from a fixed top/bottom board side.

**Why:** Online and shared match projections reorder players so the viewer is first, while event metadata retains canonical player IDs. A fixed Champion ref can animate an opponent's attack into the wrong Champion.

**How to apply:** Use card instance metadata for card targets, player IDs for Champion targets, and only use a side-specific fallback when the target metadata is unavailable.
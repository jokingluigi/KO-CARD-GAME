---
name: User-facing card display boundary
description: Rules for translating KO card labels and correcting visible card copy without changing game data or engine semantics
---

User-facing card labels and obvious copy corrections belong in shared display helpers and render components. Keep card type enums, currency values, effect parsing, API payloads, and stored text unchanged.

**Why:** Card data is also consumed by runtime effect logic, while the same values need Korean wording and occasional spacing/grammar cleanup in the UI. Editing source data to fix presentation risks changing gameplay semantics or breaking stable API contracts.

**How to apply:** Reuse the shared label/text normalizer anywhere player-facing card or effect text is rendered, and use the shared card detail dialog for Collection and Deck Editor views instead of creating page-specific detail markup.
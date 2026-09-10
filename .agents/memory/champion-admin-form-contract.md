---
name: Champion admin form contract
description: Durable rules for saving quest-enabled champions and displaying field-scoped effect analysis.
---

Quest-enabled champion forms must keep `questCondition.required` and `questProgressRequired` numerically aligned, including when the progress input only displays a default value. Analyzer results must be stored by source field and shown independently without replacing the rest of the form state.

**Why:** A displayed fallback value is not the same as a value in React state, so the server can receive null and reject an otherwise complete quest. Silent analyzer application also makes a successful request look broken and hides which field changed.

**How to apply:** Initialize progress when enabling a quest, allow a validated condition-required value to backfill it at the API boundary, wrap analyzer requests in loading/error handling, and render the returned structured effect beside the field that produced it.
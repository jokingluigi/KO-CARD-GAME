---
name: Champion full implementation prompt
description: Durable rules for generating the Champion-wide implementation prompt from Admin.
---

The Champion-wide implementation prompt must analyze the current unsaved Admin form snapshot, not refetch or overwrite the form. A linked Champion Token is resolved from Card Admin by CardDefinition ID and its card data remains the source of truth; do not duplicate Token effects into Champion data.

**Why:** Admin authors need to review and refine draft fields before saving, while Token behavior is maintained in Card Admin. Using persisted Champion data would silently discard unsaved edits or create two conflicting effect definitions.

**How to apply:** Run the live Effect Registry/Analyzer for each populated Champion effect area, include structured data and analyzer results in one deterministic internal-template prompt, and deduplicate repeated unsupported mechanics. Prompt generation must still return a useful generic prompt for ANALYSIS_FAILED sections and must not introduce Champion-name-specific runtime branches.
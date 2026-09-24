---
name: Tag target filters
description: Rules for composing generic card tag filters with structured effect targets.
---

Card tag target filters are metadata-based and generic: `tagsAny`, `tagsAll`, and `tagsNone` compose with zone, ownership, and card-type filters without knowing specific tag or card names.

Runtime tag predicates resolve each instance's `definitionId` against the match's `CardDefinition` snapshot. Do not fall back to copied `CardInstance.tags`; a missing definition fails closed, while an existing definition with no tag list has an empty tag set. Normalize NFC and whitespace, then compare exact tags only.

**Why:** Instance tags can be stale after persistence or generated/token transformations, while the match snapshot carries the authoritative metadata. Exact matching and fail-closed missing definitions prevent an unknown card from being selected by a tag predicate.

**How to apply:** Route structured targets, SCRIPT_V1 selection, and apply-time revalidation through the state-aware matcher. The analyzer may emit tags only from exact normalized server vocabulary or an explicit tag predicate; never add example-tag fallbacks. Preserve `filter → sort → take`, stable instance-ID tie-breaking, and the canonical anywhere scope `HAND + DECK + BOARD` (not GRAVEYARD).
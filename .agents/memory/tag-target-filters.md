---
name: Tag target filters
description: Rules for composing generic card tag filters with structured effect targets.
---

Card tag target filters are metadata-based and generic: `tagsAny`, `tagsAll`, and `tagsNone` compose with zone, ownership, and card-type filters without knowing specific tag or card names.

**Why:** Tags are reusable card-definition metadata, and generated/token instances must remain eligible when their definition carries the tag. Name-based inference or zone-specific branches would make the mechanic brittle.

**How to apply:** Keep one shared canonical matcher for ordinary targets and random generation candidates. Resolve `filter → sort → take`, using instance ID as the stable tie-breaker. Validate each nonempty filter list with the existing card-tag limits, and keep parser output, registry metadata, runtime types, and tests synchronized.
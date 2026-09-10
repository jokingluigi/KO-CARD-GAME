---
name: Reusable card effect workflow
description: Required workflow for implementing future KO card effects without one-off mechanics
---

Every new KO card effect must begin with an inspection of the active Effect Library, Trigger Registry, actions, targets, value resolvers, conditions, listeners, durations, and analyzer mappings. Reuse an existing composition whenever possible; only add a generic parameterized mechanism when the current system cannot express the effect.

**Why:** Card-by-card special cases create duplicated semantics and make later natural-language analysis and runtime behavior inconsistent.

**How to apply:** Never branch on a card name. New mechanisms need a stable id, human-readable name and description, validated config/schema, handler, supported trigger/target/value metadata, version/status, analyzer aliases or semantic mappings, and focused regression tests. Register the shared identifier at the authoritative registry source so the analyzer, Effect Library, and runtime stay aligned. After implementation, report reused mechanisms, new mechanisms, library registrations, analyzer expressions, and future similar effects covered.
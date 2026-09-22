---
name: Published catalog QA boundary
description: Rules for exhaustive QA against live published card and Champion definitions.
---

Published catalog QA must collect the current PUBLISHED API snapshot instead of trusting a historical card list or expected count. A successful Action/Event execution proves only the exercised engine path; it does not prove that the human-facing description, effect values, or product rule are semantically correct without an explicit oracle. A published description with no runtime ability is a FAIL, not a harmless no-op or an UNVERIFIED result. Catalog/spec mismatches must be reported as QA findings and must not be silently normalized by the runner.

**Why:** Live catalog data can rename or omit cards and can change quest thresholds independently of an attached QA document. Treating smoke execution as semantic PASS hides exactly the drift this QA is meant to find.

**How to apply:** Keep catalog collection read-only, use deterministic fixtures and seeded randomness, record invalid/valid target behavior and event invariants, assert source-exclusion filters and exact numeric deltas, and classify missing token-path coverage or absent semantic oracles as UNVERIFIED.

When the development snapshot contains an existing card or Champion with a stale structured definition, correct that development record before rerunning QA; do not invent missing cards or silently alter Production data. Existing disabled records may be restored only when their complete definition is already present and the QA scope identifies them as published.

**Why:** Runtime QA against an incomplete development catalog otherwise reports false engine failures, while manufacturing a missing definition or editing Production would hide catalog provenance and violate the QA boundary.

**How to apply:** Record the development-only data correction in the QA report, leave genuinely absent records as explicit missing-catalog findings, and keep semantic checks separate from Action/Event smoke coverage.
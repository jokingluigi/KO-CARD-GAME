---
name: Published catalog QA boundary
description: Rules for exhaustive QA against live published card and Champion definitions.
---

Published catalog QA must collect the current PUBLISHED API snapshot instead of trusting a historical card list or expected count. A successful Action/Event execution proves only the exercised engine path; it does not prove that the human-facing description, effect values, or product rule are semantically correct without an explicit oracle. Catalog/spec mismatches must be reported as QA findings and must not be silently normalized by the runner.

**Why:** Live catalog data can rename or omit cards and can change quest thresholds independently of an attached QA document. Treating smoke execution as semantic PASS hides exactly the drift this QA is meant to find.

**How to apply:** Keep catalog collection read-only, use deterministic fixtures and seeded randomness, record invalid/valid target behavior and event invariants, and classify missing token-path coverage or absent semantic oracles as UNVERIFIED.
---
name: Script engine boundary
description: The versioned declarative Script AST and its bounded first runtime slice.
---

`SCRIPT_V1` is a closed, validated data AST separate from `STRUCTURED_EFFECTS_V1`. The current interpreter supports bounded `SELECT`, `COUNT`/`SUM`/`MIN`/`MAX`, typed numeric comparisons, `IF`, result references, deterministic sort/take/random selection, adjacent empty-slot summons, revive, and existing effect leaves without runtime provider calls. PLAYER_CHOICE is serialized in authoritative targeting state and must clear its script continuation after resumption.

**Why:** Saved effects must be deterministic and safe to execute in matches, while the existing target-selection continuation is stateful and cannot be replaced by a synchronous first slice without changing click/reconnect semantics.

**How to apply:** Keep provider output, Admin save validation, published-card ingestion, and runtime dispatch on the same Script version and limits. Extend PLAYER_CHOICE through the existing continuation stack before allowing it in Script validation, and test both the paused JSON-safe state and settled post-selection state.
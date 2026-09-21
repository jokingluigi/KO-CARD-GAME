---
name: Script engine boundary
description: The versioned declarative Script AST and its bounded first runtime slice.
---

`SCRIPT_V1` is a closed, validated data AST separate from `STRUCTURED_EFFECTS_V1`. The current interpreter supports bounded `SELECT`, `COUNT`/`SUM`/`MIN`/`MAX`, typed numeric comparisons, `IF`, and existing effect leaves without runtime provider calls. Unsupported interactive target continuation must be rejected rather than approximated.

**Why:** Saved effects must be deterministic and safe to execute in matches, while the existing target-selection continuation is stateful and cannot be replaced by a synchronous first slice without changing click/reconnect semantics.

**How to apply:** Keep provider output, Admin save validation, published-card ingestion, and runtime dispatch on the same Script version and limits. Extend PLAYER_CHOICE through the existing continuation stack before allowing it in Script validation.
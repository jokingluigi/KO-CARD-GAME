---
name: Mechanic compiler boundary
description: How admin natural-language effects become safe executable KO rules
---

The admin compiler may use the provider for natural-language interpretation, but the server owns the final mechanic plan. It derives trigger, selection, filter, condition, memory, schedule, action, and result-reference metadata from the validated executable AST rather than trusting model reasoning.

**Why:** Provider explanations and plans are untrusted model output; only the validated Structured Effect or SCRIPT_V1 payload is safe to apply to a form and later execute in a match.

**How to apply:** Keep the form result executable and save-gated, let the shared analyzer rescue an unambiguous provider clarification, and keep runtime execution provider-free. Extend delayed/replacement semantics through a bounded versioned runtime instead of card-specific branches.
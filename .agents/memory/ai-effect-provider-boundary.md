---
name: AI effect provider boundary
description: Server-side provider fallback and strict AI draft validation for the admin effect generator.
---

The admin effect generator may use a server-only OpenAI-compatible provider when the managed provider is unavailable, but it must fail clearly when no server secret is configured. AI output is never auto-corrected into an effect: strict shape checks, current Registry validation, and CardDefinition reference resolution must reject wrappers, unknown fields, malformed values, and ambiguous names before the draft reaches form state. The server supplies the current definition identity; provider prompts and provider ASTs must not carry or trust sourceId. Representative provider labels must stay aligned with their actual natural-language fixtures.

**Why:** A live provider returned an `effectConfig` wrapper around an otherwise valid effect. Silently unwrapping model output would weaken the data-only boundary and could allow unsupported payloads into admin forms. A mislabeled canonical example can also steer a provider to the wrong valid DSL shape, so fixture identity is part of the contract.

**How to apply:** Keep provider credentials server-side, require an explicit JSON envelope, validate against the current shared DSL, attach trusted source context only after validation, and make the UI apply only local form state; the existing Admin save remains the only persistence path.
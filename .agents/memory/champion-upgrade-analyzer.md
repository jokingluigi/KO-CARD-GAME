---
name: Champion upgrade analyzer
description: Reliable parsing rules for Champion quest rewards that upgrade their own ability.
---

A Champion self-upgrade phrase is a structured marker even when it is the only reward text. Korean conjugation variants and trailing punctuation must be normalized before analyzing any remaining reward clauses.

**Why:** Treating punctuation-only remainder as an effect body turns a valid upgrade reward into a partial analysis failure.

**How to apply:** Recognize the supported upgrade endings, strip separator punctuation, accept an empty remainder as supported, then prepend the upgrade marker to any other validated effects.
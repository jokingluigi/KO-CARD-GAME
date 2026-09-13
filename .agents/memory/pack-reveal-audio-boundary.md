---
name: Pack reveal audio boundary
description: Temporary rare-reward music and shared user/admin pack opening presentation
---

Pack rare Reveal music is temporary presentation audio, not gameplay Base Music. Legendary cards use their card Entrance Music, Champions use Quest Completion Music, and both are capped at seven seconds with fade-in/fade-out and cleanup. A newer rare Reveal replaces the previous one and resumes the existing base BGM; SFX and gameplay Quest Base behavior remain independent.

**Why:** Pack opening must reuse the same asset without changing the meaning or persistence of Quest Completion Music during a match.

**How to apply:** Route both real user opening and admin preview through the shared PackOpening component and AudioManager pack-reveal method. Never create component-owned Audio elements or mutate user inventory/collection data from preview endpoints.
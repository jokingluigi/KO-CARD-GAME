---
name: Champion card presentation
description: The visual meaning of the CHAMPION card rarity and its frame treatment.
---

CHAMPION rarity represents a champion token card for presentation purposes. It uses the dedicated red-and-gold champion frame while keeping the shared card renderer and normal card data flow.

**Why:** The user clarified that “champion grade” means a champion token card, so it should not remain on the generic no-frame fallback.

**How to apply:** Keep the champion frame in the shared renderer mapping. Do not infer new champion gameplay rules or alter engine behavior from this visual classification alone.
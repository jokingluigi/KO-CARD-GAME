---
name: Artwork position precision
description: The card artwork editor preserves fractional X/Y percentages.
---

Artwork position values are a floating-point UI contract, not integer percentages.

**Why:** Crop and position controls can produce fractional values such as 39.5 or 75.4. Persisting them in integer columns makes an otherwise successful image upload fail during the card save request.

**How to apply:** Keep card and card-skin artwork position columns real-valued, and allow bounded numeric decimals through admin parsing and renderer settings.
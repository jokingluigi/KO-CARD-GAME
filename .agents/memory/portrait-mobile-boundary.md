---
name: Portrait mobile boundary
description: Responsive layout constraint for the KO game board.
---

Mobile-specific game layout rules belong inside the narrow portrait-phone breakpoint. Desktop, large tablets, and landscape views should retain their existing board geometry and interaction placement.

**Why:** The KO game uses precise board, champion, hand, and log placement for desktop play. Broad responsive rules can unintentionally resize or move those elements outside the intended mobile devices.

**How to apply:** Add mobile-only hooks and styles under the portrait media query, use DOM measurements for animations, and verify both phone portrait sizes and the 1920px desktop view after layout changes.
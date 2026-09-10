---
name: Mobile board density
description: Portrait-only density rules for the KO game board and hand.
---

On narrow portrait screens, preserve four readable board slots by moving deck/grave controls into compact horizontal row controls. Keep hand cards at a readable width and use controlled overlap, with selected cards raised above the stack.

**Why:** Reserving a vertical side column for zones makes four portrait board cards too narrow, while shrinking every hand card makes names and costs unreadable.

**How to apply:** Keep these rules inside the portrait breakpoint, preserve the CardRenderer and DOM refs, and do not alter desktop or landscape sizing.
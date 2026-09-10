---
name: Inspector viewport placement
description: Shared placement rule for KO card detail panels.
---

Card detail panels must be positioned from the live anchor element and the rendered panel size. Prefer the side with enough room, then clamp both coordinates to a viewport margin; do not use a fixed top/bottom direction.

**Why:** Hand cards sit near the bottom edge while board and history cards can be near any edge. A single fixed placement clips long explanations or makes edge cards unreadable.

**How to apply:** Keep placement in the shared inspector provider. Recalculate after opening and on viewport resize/scroll, cap the panel height, and allow the panel body to scroll without changing the game layout.
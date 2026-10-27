# Legendary dialogue by owner

Own legendary entrance dialogue now floats at the viewport bottom, entering upward and exiting downward. Opponent dialogue retains the upper-screen placement and motion. Both keep their existing artwork, equipped-skin handling, complete quote and queue-owned 2200/2800ms lifetime. No card, engine, server, data or audio changes.

Bottom placement respects the bottom safe-area inset. It shrinks or moves to leave turn controls, champion ability and emote buttons exposed, including during the existing summon camera movement. It temporarily covers part of the hand backdrop/cards as an entrance overlay; tapping it dismisses without triggering the card behind it, and outside input continues normally. Existing automatic expiry while hidden and no-replay behavior are retained.

Validation uses actual shared battle components and engine actions:

- Extended expiry browser suite summons on both sides at 360×740, 375×812, 390×844, 412×915, 1440×900, 844×390 and reduced-motion 390×844. It checks side identity and placement, complete quote, automatic removal, expiry while settings is open, no snapshot replay and unchanged authoritative state.
- Distinct-dialogue suite checks landing, artwork/modal priority, selection/cancel, two opponent speakers in FIFO order and no replay at mobile four sizes, desktop and reduced motion.
- Long-dialogue suite checks full Korean quote, touch inside/outside, no click-through, incoming attack dismissal and landscape bounds.
- Full workspace typecheck and build.

Screenshots: [own bottom](screenshots/20261027-legendary-sides/self-390.png), [opponent top](screenshots/20261027-legendary-sides/opponent-390.png).

All listed validation groups passed. Physical-device tests and exhaustive live PvP/draft/tower matches are not included. No user-study claims.

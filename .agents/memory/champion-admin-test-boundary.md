---
name: Champion admin test boundary
description: Rules for launching administrator-only matches from saved Champion definitions.
---

Admin Champion test matches use the saved DRAFT or PUBLISHED Champion row, not unsaved editor state. The match snapshot is built with administrator-visible non-disabled cards so structured references to draft cards can resolve, while the opponent still comes from the published Champion pool.

**Why:** A test match must reproduce the persisted definition that gameplay will load and must not expose draft-only content through public APIs.

**How to apply:** Keep the test route behind the server-side admin check, pass a stable Champion ID from the editor, and resolve all referenced cards into the test match snapshot before starting the game.
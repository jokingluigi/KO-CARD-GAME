---
name: Prism economy boundary
description: Server-authoritative card crafting, disenchanting, settings, and balance history
---

Prism is a separate user balance from shop currency. Crafting and disenchanting must resolve the current published card and persisted rarity setting on the server, then update the user balance, card collection quantity, and prism transaction ledger in one database transaction. Client-supplied costs, rewards, rarity, ownership, or balance are never authoritative.

**Why:** A missing or corrupted economy setting must not silently turn into a default price, and separate balance/collection writes would allow duplicate clicks or partial card loss.

**How to apply:** Only published non-token NORMAL/LEGENDARY cards are eligible. Treat absent or invalid settings as disabled, keep Champion and token paths outside prism, and resolve deck validity from current collection quantities after disenchanting.
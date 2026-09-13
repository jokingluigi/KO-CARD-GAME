---
name: Shop economy boundary
description: Server-owned currency, pack purchases, and administrator grants
---

Currency is server-owned account state. A pack purchase must validate the current published listing, conditionally debit the user's balance, increase pack inventory, and record a ledger entry in one database transaction. Administrator grants use the same ledger so balance changes remain auditable.

**Why:** Client prices and separate balance/inventory requests would allow stale-price purchases, duplicate rewards, or partial completion during retries and concurrent clicks.

**How to apply:** Keep shop and grant mutations keyed by server-resolved listing/user records; never trust client prices, roles, or balances, and preserve atomicity when adding new currency sinks or sources.
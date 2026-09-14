---
name: Shop economy boundary
description: Server-owned currency, pack purchases, and administrator grants
---

Shop currency is server-owned account state and must remain separate from match Gold and Prism. A pack purchase must validate the current published listing, conditionally debit the shop balance, increase pack inventory, and record a ledger entry in one database transaction. Administrator grants and the one-time starter grant use the same ledger so balance changes remain auditable.

**Why:** Client prices and separate balance/inventory requests would allow stale-price purchases, duplicate rewards, or partial completion during retries and concurrent clicks.

**How to apply:** Keep shop and grant mutations keyed by server-resolved listing/user records; never trust client prices, roles, quantities, or balances, and preserve atomicity when adding new currency sinks or sources. Starter credit must be guarded by a persisted per-user grant marker.
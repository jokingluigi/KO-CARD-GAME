---
name: Champion Prism economy
description: Champion crafting and duplicate pack conversion use a separate authoritative economy and replay-safe claim boundary.
---

Champion Prism must remain independent from normal card Prism: its balance, settings, and ledger are separate, and both crafting cost and duplicate reward come from the server-side Champion economy setting. Champion crafting claims unique ownership before debiting inside one transaction so concurrent requests cannot create a second unlock or leave a partial debit.

**Why:** Champion ownership is unique, while pack openings can be retried after the client has lost the response. Reusing the normal card balance or relying on reveal state would allow cross-currency changes or duplicate rewards.

**How to apply:** Any future Champion economy grant must write through the Champion Prism ledger and use the persisted balance/config. Any pack-opening mutation must reuse the user-scoped idempotency claim before spending inventory or applying rewards.
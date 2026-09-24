---
name: Pack idempotency recovery
description: Keep bulk pack opening intentions stable across uncertain network outcomes.
---

Pack opening is one atomic inventory debit plus all rewards under a user-scoped idempotency claim. A client that loses the response must keep its original pack, quantity, and key together across tab reloads, block new openings, and replay that exact request before allowing another.

**Why:** The server may have committed even when the browser sees a network error. Replacing the key or changing quantity at that point can spend another batch instead of retrieving the original rewards. A deterministic no-commit rejection can unlock the client, but a network or server error cannot prove that no commit occurred.

**How to apply:** Any pack-opening UI or retry layer must preserve unresolved intentions per account, reconcile them with the same request key, and clear the lock only after a confirmed response or a definitive rejection. Keep replay claims complete; never treat a partial stored bulk result as a successful response.
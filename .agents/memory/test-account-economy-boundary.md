---
name: Test account economy boundary
description: Security and behavior rules for the development-only KO test user.
---

KO development test accounts are identified server-side by the fixed test-user or test-admin email plus both `NODE_ENV !== production` and `ENABLE_TEST_AUTH === true`. In that mode, published non-token cards and published Champions are virtual-owned, card quantities and account balances are unlimited for validation/display, and shop pack inventory plus crafted collection changes still use the normal persistence flow. Token and Champion Token cards remain invalid deck references. General users and match-internal Gold use the existing persisted rules.

**Why:** A client-controlled flag or database-wide grant would let ordinary users bypass ownership and economy rules, while changing match Gold would make gameplay tests misleading.

**How to apply:** Reuse the server identity helper in every ownership, deck validation, Prism, and shop route. Keep the override out of production and represent infinity in the UI from the server-provided test-account flag rather than displaying the sentinel balance.
---
name: Browser auth smoke tests
description: Durable constraints for testing KO's authenticated user and admin flows through real browser sessions.
---

Browser smoke tests should create the fixed development test accounts through the normal session endpoint and then exercise the UI/API with the resulting HttpOnly cookie. Test-auth routes are development-only and must remain unavailable in production.

**Why:** Client-side role flags or bypass routes would not validate the real authorization boundary. The Pack API also exposes the published catalog with zero-quantity rows, so counting rows is not an ownership check.

**How to apply:** Assert the authenticated user role from `/api/auth/me`, verify admin pages reject USER sessions, and judge Pack ownership from positive quantities and open authorization rather than catalog presence. Prefer exact visible-control matching in browser scripts so `PUBLISH` does not accidentally match `PUBLISHED`.
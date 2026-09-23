---
name: KO authentication boundary
description: The first account system uses API-owned PostgreSQL users and server-side sessions, with roles controlled only by the server.
---

KO authentication is intentionally separate from the game engine: account records and hashed passwords live in PostgreSQL, session tokens are stored only as hashes behind HttpOnly cookies, and ADMIN promotion is controlled by the server's configured admin email.

**Why:** Clerk was not configured in this project, while KO needs a small email/password account model with a server-controlled USER/ADMIN role for the existing admin and test routes.

**How to apply:** Keep future account, profile, ownership, and authorization work behind the API auth layer; never infer roles from client requests or persist raw credentials.

Auth status checks must bound every session, user/profile, and starter-data dependency; infrastructure failure returns a controlled error without clearing a still-valid session, and clients distinguish that error from unauthenticated state with finite retry and stale-request protection.

**Why:** A production `/api/auth/me` request could remain pending while the frontend stayed on its authentication loading screen, and treating the failure as logout hid the infrastructure problem.

**How to apply:** Keep the server timeout around the complete `/me` response path, trace stage durations without credentials or user data, and render a temporary recovery state instead of silently switching to login.
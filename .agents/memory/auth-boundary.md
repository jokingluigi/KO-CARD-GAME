---
name: KO authentication boundary
description: The first account system uses API-owned PostgreSQL users and server-side sessions, with roles controlled only by the server.
---

KO authentication is intentionally separate from the game engine: account records and hashed passwords live in PostgreSQL, session tokens are stored only as hashes behind HttpOnly cookies, and ADMIN promotion is controlled by the server's configured admin email.

**Why:** Clerk was not configured in this project, while KO needs a small email/password account model with a server-controlled USER/ADMIN role for the existing admin and test routes.

**How to apply:** Keep future account, profile, ownership, and authorization work behind the API auth layer; never infer roles from client requests or persist raw credentials.
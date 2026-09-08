---
name: Mechanic request boundary
description: Safety boundary between unsupported-effect intake and any future coding-agent integration.
---

Creating a MechanicRequest only records a server-verified unsupported mechanic in `PENDING`; it never invokes a coding agent or changes game code.

**Why:** Intake must remain auditable and admin-controlled before any future source generation or execution is introduced.

**How to apply:** Re-run the current analyzer on the server, reject supported or unrecognized text, derive the requester from the admin session, and keep agent credentials and invocation behind a server-only port.
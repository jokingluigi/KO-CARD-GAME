---
name: External Render database boundary
description: Distinguishes Render's external PostgreSQL database from Replit-managed databases and prevents migrations from targeting the wrong environment.
---

For schema changes to Render's external PostgreSQL database, do not treat the workspace `DATABASE_URL` or Replit's production SQL tools as proof of the Render service's database target. Confirm the target explicitly, compare its read-only schema with the supplied Production inventory, and inspect the migration contents before applying DDL. Use only the authorized migration, keep credentials out of output, and remove any temporary secret through workspace settings after the operation.

**Why:** The workspace `DATABASE_URL` was present but unverified. Using it could have changed Development instead of the Render API database.

**How to apply:** Prefer a provider integration when one exists. Otherwise, after authorization, use a separately supplied secure connection, verify the target schema and exact migration contents, apply transactionally, then confirm schema and query behavior. Database success alone does not prove the Render service is healthy.
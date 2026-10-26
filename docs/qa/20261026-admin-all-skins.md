# Administrator skin access

All actual `ADMIN` accounts automatically acquire all active champion/card cosmetics and non-disabled legacy pack skins when opening cosmetics/collection or equipping a skin. New skins are picked up on the next such access. Other cosmetic types, original cards/champions, currency, and ordinary-user inventory are unaffected. Existing acquisition records are preserved via conflict-safe inserts. Token appearances follow the champion skin through the existing set resolver.

`ensureAdminSkins` reads the actual server-side role, rechecks it under a row lock inside the cosmetics write transaction, and uses existing ownership tables/FKs. No schema migration or production bulk SQL was executed. These application grants persist as acquired ownership; losing the administrator role stops future automatic acquisitions rather than removing previously acquired items.

Changed files:
- `artifacts/api-server/src/lib/admin-skin-access.ts`: role-guarded, idempotent skin acquisition in existing tables.
- `artifacts/api-server/src/lib/cosmetics.ts`: ensure access before inventory reads and equipment changes.
- `artifacts/api-server/src/routes/collection.ts`: include legacy skins when administrators open collection.
- `artifacts/api-server/src/routes/cosmetics.ts`: reject misleading attempts to revoke an active auto-unlocked administrator skin.
- `lib/db/qa/cosmetics.test.ts`: two distinct administrators, future skins, direct equip, token art, duplicate avoidance, ordinary-user isolation/body-role spoof rejection, inactive exclusion, and demotion behavior.

Validation: production build/typecheck and 17 isolated PostgreSQL-compatible authenticated HTTP/WS tests passed. Eight existing actual-browser regression groups also passed (administrator editor, ordinary-user equipment, two-user PvP, AI entry, reload, mobile and failed-image fallback). Real production accounts were not impersonated or manually edited. The broad CI's old impact-path/camera-cap failure and auth browser-tool installation timeout were disclosed in PR91; they are outside this change. No frontend or combat rules changed here.

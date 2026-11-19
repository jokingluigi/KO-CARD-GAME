# Current administrator content: release receipt

Implementation/source revision: `0c6d7bc54cdefb8dbe39ecb7e5faaa63763c73e1` (production branch).

- API deployment: `dep-dbuug0mk1f9s73annifg` — live; `/api/healthz` reports the exact source revision.
- Frontend deployment: `dep-dbuug8m1egvs739mrhrg` — live; actual HTML loads `/assets/index-BtEa6H6L.js`, whose JavaScript contains the exact source revision. `/version.json` also reports it.
- Claude's environment-based `APPROVED_PRODUCTION_COMMIT` build guard remains unchanged; only the approved value was updated for this release. Automatic Git deployments remain disabled.
- Authenticated post-release review verified all 9 reviewed card texts/publication states and all 12 champion versions/finisher conditions. Drafts remain drafts.
- Administrator edits were limited to the three user-approved text corrections recorded in [the implementation handoff](ADMIN_CONTENT_UPDATE_20261119.md).
- Validation: 289 selected regression tests passed (29 current-content cases); full workspace typecheck, frontend build and API build passed.

No production seed import, champion reset, schema migration or presentation rollback was performed. Existing running matches may retain their original catalog snapshot; refresh and start a new match to use the updated effects.

# Card description fixes — 2026-10-05

The published Jaeger quest describes eight wrestler generations but completes at seven. Migration 0042 updates both stored thresholds to eight, backs up the original record, preserves description and all base stats, and runs through the existing transactional startup installer. It targets only the existing ID with the known eight-generation description and seven-generation payload. Repeated startup does not bump the version again; customized descriptions are preserved.

The old draw tests now reflect the existing rule that deck-applied modifiers survive drawing. Hand-to-deck returns still reset. Frankenstein Mandrill checks use the published baseline rather than old hardcoded HP. The effect-generator test reflects the implemented single validation retry; invalid output still fails after two calls. Public Jaeger QA now expects eight rather than endorsing the incorrect seven.

Validation:
- 1,456 selected regression tests pass (including AI 100 full matches).
- 207 current-catalog checks pass with the current public 85-card snapshot.
- 3 new migration/quest boundary tests pass in isolated PGlite and the engine.
- Full-schema PGlite startup integration with the captured public Jaeger record passes: startup twice yields threshold 8 and a single version increment.
- Shared library, frontend and API TypeScript checks pass; git diff --check passes.

Environment: Node 24 with temporary TypeScript registerHooks loader, test-isolation=none because Windows sandbox prevents esbuild/test child-process spawning. The bundle build, authenticated UI and real two-client PvP remain unverified. No production database writes were made during QA. The data repair takes effect when this code is deployed and the API startup installer runs. Existing match snapshots are unchanged.

User preference is saved in .agents/memory/card-effect-fix-policy.md: preserve stored base cost/HP/attack; repair behavior to match card descriptions.

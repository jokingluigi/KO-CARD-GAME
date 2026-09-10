---
name: Effect registry declaration refresh
description: Workspace build-cache behavior after changing shared Effect Registry exports.
---

After changing exported identifiers in the shared Effect Registry, dependent API and game typechecks may still read stale declaration output until the Registry project is force-built.

**Why:** The API and game packages use project-reference declaration output, so an otherwise correct source edit can appear to have missing exports until the shared package is refreshed.

**How to apply:** Run a forced TypeScript build for `lib/effect-registry` before dependent typechecks, then run the API and KO checks again.
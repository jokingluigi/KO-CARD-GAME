---
name: TypeScript engine tests
description: How to run isolated TypeScript engine tests without adding a project test dependency.
---

The KO package has no direct TypeScript test runner command. An artifact-local `tsx --test` binary may still be available even when it is not declared in package manifests; use it when present. Otherwise, bundle the test to a temporary ESM file with the workspace's esbuild binary and execute that bundle with Node's test runner.

**Why:** Node's TypeScript stripping does not resolve the project's extensionless TypeScript imports. Test-runner availability varies by workspace environment; this workspace exposed `tsx` locally while root-level `esbuild` was unavailable.

**How to apply:** Check for an artifact-local `tsx` binary first, then fall back to esbuild if available. Use this only for focused engine tests, keep generated bundles under `/tmp`, and do not add a runtime dependency just for tests.
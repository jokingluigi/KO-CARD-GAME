---
name: TypeScript engine tests
description: How to run isolated TypeScript engine tests without adding a project test dependency.
---

The KO package has no direct TypeScript test runner command. For isolated engine regression tests, bundle the test to a temporary ESM file with the workspace's existing esbuild binary, then execute that bundle with Node's test runner.

**Why:** Node's TypeScript stripping does not resolve the project's extensionless TypeScript imports, and `tsx` is not installed. Bundling matches the application's module resolution without adding a runtime dependency.

**How to apply:** Use this only for focused engine tests. Keep the generated bundle under `/tmp`; do not commit it.
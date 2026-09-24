---
name: TypeScript engine tests
description: How to run isolated TypeScript engine tests without adding a project test dependency.
---

Check for a package-local `tsx --test` binary first. If unavailable, bundle focused TypeScript tests with package-local esbuild and run the result with Node's test runner.

For database-backed API tests, keep `pg` and `drizzle-orm` external in a CommonJS bundle and place the temporary bundle under the database package so Node resolves runtime dependencies from the package that owns them. A bundle in `/tmp` or under the API artifact may not resolve those dependencies.

**Why:** Test-runner availability varies by workspace environment. In one workspace, `tsx` was unavailable, ESM bundling hit `pg`'s dynamic `require`, and a CommonJS bundle under the API artifact could not resolve `pg`.

**How to apply:** Use this for focused TypeScript tests when no runner is installed; externalize packages that rely on CommonJS and place the bundle where their workspace dependencies resolve. Keep generated bundles temporary and do not add a runtime dependency just for tests.
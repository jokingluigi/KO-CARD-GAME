import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthDependencyTimeoutError,
  getAuthenticatedUser,
  withAuthTimeout,
} from "./auth";

test("unauthenticated auth lookup completes without touching the database", async () => {
  const trace: string[] = [];
  const user = await getAuthenticatedUser(
    { headers: {} } as never,
    { onStage: (stage) => trace.push(stage) },
  );
  assert.equal(user, null);
  assert.deepEqual(trace, ["SESSION_VERIFY_START", "SESSION_VERIFY_END"]);
});

test("auth dependency timeout rejects with a controlled typed error", async () => {
  await assert.rejects(
    withAuthTimeout("SESSION_VERIFY", () => new Promise<null>(() => {}), { timeoutMs: 5 }),
    (error: unknown) => error instanceof AuthDependencyTimeoutError && error.stage === "SESSION_VERIFY",
  );
});

test("auth dependency completion cancels its timeout", async () => {
  const result = await withAuthTimeout("USER_LOOKUP", async () => "ready", { timeoutMs: 50 });
  assert.equal(result, "ready");
});
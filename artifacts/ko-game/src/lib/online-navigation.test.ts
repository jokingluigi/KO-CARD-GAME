import assert from "node:assert/strict";
import test from "node:test";
import { ONLINE_MODE_SELECT_BACK_ROUTE, ROUTES } from "./routes";

test("A1/A2/A3: online mode select opens from and returns to Main without stale route state", () => {
  assert.equal(ROUTES.ONLINE, "/online");
  assert.equal(ONLINE_MODE_SELECT_BACK_ROUTE, ROUTES.MAIN_MENU);
  assert.deepEqual(
    [ROUTES.MAIN_MENU, ROUTES.ONLINE, ONLINE_MODE_SELECT_BACK_ROUTE, ROUTES.ONLINE],
    ["/", "/online", "/", "/online"],
  );
});

test("A4/A5: mode select keeps the existing Quick Match and Friendly Match destinations", () => {
  assert.equal(ROUTES.ONLINE_QUICK, "/online/quick");
  assert.equal(ROUTES.ONLINE_FRIENDLY, "/online/friendly");
});
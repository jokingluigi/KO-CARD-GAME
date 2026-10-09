import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_GROUPS,
  ADMIN_PAGES,
  adminPageForPath,
  searchAdminPages,
  validAdminPageIds,
} from "./admin-navigation";
test("all management tools have unique URLs and a valid category", () => {
  assert.equal(
    new Set(ADMIN_PAGES.map((p) => p.path)).size,
    ADMIN_PAGES.length,
  );
  assert.equal(new Set(ADMIN_PAGES.map((p) => p.id)).size, ADMIN_PAGES.length);
  for (const p of ADMIN_PAGES) {
    assert(ADMIN_GROUPS.some((g) => g.id === p.group));
    assert.equal(adminPageForPath(p.path)?.id, p.id);
  }
});
test("direct links, queries and trailing slash restore the same tool", () => {
  assert.equal(adminPageForPath("/admin/cards/?q=test")?.id, "cards");
  assert.equal(adminPageForPath("/admin/dashboard")?.id, "dashboard");
  assert.equal(adminPageForPath("/admin/tower#boss")?.id, "tower");
  assert.equal(adminPageForPath("/admin/unknown"), undefined);
});
test("menu search matches labels, descriptions and all query words", () => {
  assert(searchAdminPages("타워 유물").some((p) => p.id === "tower"));
  assert(searchAdminPages("일일").some((p) => p.id === "quests"));
  assert.equal(searchAdminPages("no-such-management-tool").length, 0);
  assert.equal(searchAdminPages(" ").length, ADMIN_PAGES.length);
});
test("saved navigation preferences reject stale keys and duplicates", () => {
  assert.deepEqual(
    validAdminPageIds(["cards", "cards", "obsolete", null, 4, "tower"]),
    ["cards", "tower"],
  );
  assert.deepEqual(validAdminPageIds({ id: "cards" }), []);
  assert.equal(validAdminPageIds(ADMIN_PAGES.map((p) => p.id)).length, 10);
});

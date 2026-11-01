import test from "node:test";
import assert from "node:assert/strict";
import {
  claimableHomeRewards,
  latestHomeNotice,
  homeNoticeVersion,
} from "./home-lobby-policy";
import {
  defaultHomeMenuLayout,
  parseHomeMenuLayout,
  defaultHomeBackgroundPlacement,
  parseHomeBackgroundPlacement,
} from "../../../../lib/cosmetics/src/home-menu";
test("home counts only claimable results, deduplicates receipts and omits disabled/claimed rewards", () => {
  const q = {
    assignments: [
      { id: "a", status: "COMPLETED" },
      { id: "a", status: "COMPLETED" },
      { id: "b", status: "CLAIMED" },
      { id: "c", status: "IN_PROGRESS" },
    ],
    completionBonus: { enabled: true, status: "COMPLETED" },
  };
  const a = {
    definitions: [
      { dayIndex: 1, enabled: true, state: "AVAILABLE" },
      { dayIndex: 1, enabled: true, state: "AVAILABLE" },
      { dayIndex: 2, enabled: false, state: "AVAILABLE" },
      { dayIndex: 3, enabled: true, state: "LOCKED" },
    ],
  };
  assert.deepEqual(claimableHomeRewards(q, a), {
    quests: 2,
    attendance: 1,
    total: 3,
  });
  assert.equal(claimableHomeRewards(q, null), null);
  assert.equal(claimableHomeRewards({}, a), null);
  assert.deepEqual(
    claimableHomeRewards(
      {
        assignments: [],
        completionBonus: { enabled: false, status: "COMPLETED" },
      },
      { definitions: [] },
    ),
    { quests: 0, attendance: 0, total: 0 },
  );
});
test("latest notice is chronological, version changes when edited, missing dates preserve server order", () => {
  const notice = {
    id: "old",
    title: "고정 공지",
    body: "",
    displayOrder: 999,
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
  };
  const recent = {
    ...notice,
    id: "new",
    displayOrder: 0,
    createdAt: "2026-11-01",
    updatedAt: "2026-11-01",
  };
  assert.equal(latestHomeNotice([notice, recent])?.id, "new");
  assert.notEqual(
    homeNoticeVersion(recent),
    homeNoticeVersion({ ...recent, updatedAt: "2026-11-02" }),
  );
  assert.equal(latestHomeNotice([]), undefined);
});
test("existing menu layouts stay valid; independent desktop/mobile crop survives serialization; unsafe values rejected", () => {
  const old = defaultHomeMenuLayout();
  assert.deepEqual(parseHomeMenuLayout(old), old);
  const background = { desktop: { x: 20, y: 70 }, mobile: { x: 81, y: 12 } };
  const saved = parseHomeMenuLayout(
    JSON.parse(JSON.stringify({ ...old, background })),
  );
  assert.deepEqual(saved?.background, background);
  assert.deepEqual(defaultHomeBackgroundPlacement(), {
    desktop: { x: 50, y: 50 },
    mobile: { x: 50, y: 50 },
  });
  for (const bad of [-1, 101, NaN, Infinity, "50", null])
    assert.equal(
      parseHomeMenuLayout({
        ...old,
        background: { ...background, mobile: { x: bad, y: 50 } },
      }),
      null,
    );
  assert.equal(
    parseHomeBackgroundPlacement({ desktop: { x: 50, y: 50 } }),
    null,
  );
});

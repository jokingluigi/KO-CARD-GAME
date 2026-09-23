import assert from "node:assert/strict";
import test from "node:test";
import {
  filterAndSortPublicNotices,
  selectActiveMainMedia,
  validateNoticeInput,
} from "./main-content-policy";

test("공지 public filtering은 활성 공지만 최신 우선으로 반환한다", () => {
  const notices = filterAndSortPublicNotices([
    { id: "old", title: "old", body: "old", displayOrder: 0, enabled: true, createdAt: "2026-09-20", updatedAt: "2026-09-20" },
    { id: "priority", title: "priority", body: "priority", displayOrder: 2, enabled: true, createdAt: "2026-09-19", updatedAt: "2026-09-19" },
    { id: "disabled", title: "disabled", body: "disabled", displayOrder: 9, enabled: false, createdAt: "2026-09-23", updatedAt: "2026-09-23" },
  ]);
  assert.deepEqual(notices.map((notice) => notice.id), ["priority", "old"]);
});

test("공지 입력은 plain text를 보존하고 유효하지 않은 범위를 거부한다", () => {
  const input = validateNoticeInput({
    title: "안내",
    body: "<script>alert('xss')</script>",
    displayOrder: 1,
    enabled: true,
  });
  assert.equal(input?.body, "<script>alert('xss')</script>");
  assert.equal(validateNoticeInput({ title: " ", body: "내용" }), null);
  assert.equal(validateNoticeInput({ title: "제목", body: "내용", displayOrder: 1.5 }), null);
});

test("메인 미디어는 titleEnabled 중 최신 항목 하나만 선택한다", () => {
  const selected = selectActiveMainMedia([
    { id: "not-title", titleEnabled: false, createdAt: "2026-09-23", updatedAt: "2026-09-23" },
    { id: "old", titleEnabled: true, createdAt: "2026-09-20", updatedAt: "2026-09-20" },
    { id: "new", titleEnabled: true, createdAt: "2026-09-21", updatedAt: "2026-09-22" },
  ]);
  assert.equal(selected?.id, "new");
  assert.equal(selectActiveMainMedia([]), null);
});

test("기존 mainEnabled만 있는 미디어는 title 설정으로 안전하게 대체한다", () => {
  const selected = selectActiveMainMedia([
    { id: "legacy", titleEnabled: false, mainEnabled: true, createdAt: "2026-09-20", updatedAt: "2026-09-20" },
  ]);
  assert.equal(selected?.id, "legacy");
});
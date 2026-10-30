import test from "node:test";
import assert from "node:assert/strict";
import { cosmeticsRequest, CosmeticsTimeoutError } from "./cosmetics-client";
import { defaultSpritePlacement } from "@workspace/cosmetics";
import { sameSavedSprite } from "./sprite-save-policy";
test("bounded request labels timeout and never retries a mutation", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) =>
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      ),
    );
  };
  try {
    await assert.rejects(
      cosmeticsRequest(
        "/admin/battle-sprites/default/a",
        { method: "PATCH" },
        { timeoutMs: 10, label: "설정 저장" },
      ),
      (e) =>
        e instanceof CosmeticsTimeoutError && e.message.includes("설정 저장"),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("explicit cancellation remains cancellation; successful slow requests obey their own budget", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(
          () => resolve(new Response('{"ok":true}', { status: 200 })),
          25,
        );
        init?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            reject(new DOMException("Cancelled", "AbortError"));
          },
          { once: true },
        );
      });
    assert.deepEqual(
      await cosmeticsRequest(
        "/admin/cosmetics/uploads/complete",
        {},
        { timeoutMs: 100 },
      ),
      { ok: true },
    );
    const controller = new AbortController(),
      pending = cosmeticsRequest(
        "/anything",
        { signal: controller.signal },
        { timeoutMs: 100 },
      );
    controller.abort();
    await assert.rejects(
      pending,
      (e) => e instanceof DOMException && e.name === "AbortError",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("save acknowledgement requires same normalized sprite, not a successful read alone", () => {
  const url = "/api/storage/objects/uploads/cosmetics/a.png",
    a = {
      version: 1,
      frames: {
        default: {
          url,
          self: { ...defaultSpritePlacement },
          opponent: { ...defaultSpritePlacement },
        },
      },
      reactions: {},
    };
  assert.equal(
    sameSavedSprite(a, {
      reactions: {},
      frames: {
        default: {
          url,
          self: { ...defaultSpritePlacement },
          opponent: { ...defaultSpritePlacement },
        },
      },
      version: 1,
    }),
    true,
  );
  assert.equal(
    sameSavedSprite(a, {
      ...a,
      frames: {
        default: { ...a.frames.default, url: url.replace("a.png", "b.png") },
      },
    }),
    false,
  );
  assert.equal(sameSavedSprite(a, null), false);
  assert.equal(sameSavedSprite({}, {}), false);
  assert.equal(sameSavedSprite(null, null), true);
});

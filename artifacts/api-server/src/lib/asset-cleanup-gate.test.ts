import { test } from "node:test";
import assert from "node:assert/strict";
import { AssetCleanupGate } from "./asset-cleanup-gate";
test("upload bursts share a cleanup sweep and defer another scan until cooldown", async () => {
  const original = Date.now;
  let time = 1000,
    calls = 0;
  Date.now = () => time;
  try {
    const gate = new AssetCleanupGate(300000);
    const task = async () => {
      calls++;
    };
    await Promise.all(Array.from({ length: 100 }, () => gate.run(task)));
    assert.equal(calls, 1);
    time += 299999;
    await gate.run(task);
    assert.equal(calls, 1);
    time++;
    await gate.run(task);
    assert.equal(calls, 2);
  } finally {
    Date.now = original;
  }
});
test("failed sweeps recover after short backoff and do not run on every upload", async () => {
  const original = Date.now;
  let time = 1000,
    calls = 0;
  Date.now = () => time;
  try {
    const gate = new AssetCleanupGate(300000, 30000);
    await assert.rejects(
      gate.run(async () => {
        calls++;
        throw new Error("unavailable");
      }),
    );
    await gate.run(async () => {
      calls++;
    });
    assert.equal(calls, 1);
    time += 30000;
    await gate.run(async () => {
      calls++;
    });
    assert.equal(calls, 2);
  } finally {
    Date.now = original;
  }
});

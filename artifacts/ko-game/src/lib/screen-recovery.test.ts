import assert from "node:assert/strict";
import { test } from "node:test";
import { isScreenAssetFailure } from "./screen-recovery";

test("recognizes browser and bundler asset failures", () => {
  for (const message of [
    "Failed to fetch dynamically imported module: /assets/settings-old.js",
    "Importing a module script failed.",
    "error loading dynamically imported module",
    "Loading chunk 42 failed.",
    "Unable to preload CSS for /assets/style.css",
  ]) assert.equal(isScreenAssetFailure(new Error(message)), true, message);
});

test("does not classify application or business errors as asset failures", () => {
  for (const message of ["Cannot read properties of undefined", "구매 결과를 확인하지 못했어요.", "Network request failed", "권한이 없습니다."])
    assert.equal(isScreenAssetFailure(new Error(message)), false, message);
});

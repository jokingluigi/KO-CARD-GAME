import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requestChampionSave,
  ChampionSaveUncertainError,
} from "./champion-save-client";
import { championSaveValuesMatch } from "../../../../lib/game-engine/src/champion-save-values";
const payload = { name: "검증 챔피언", abilityText: "피해 1", version: 4 },
  saved = { id: "hero", ...payload, version: 5 };
const options = {
  base: "/api/admin",
  id: "hero",
  version: 4,
  creationId: "12ba5d8d-526a-4003-af6e-b8de831d479a",
  payload,
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("normal save returns immediately with no list/intro/catalog refresh", async () => {
  const calls: string[] = [];
  const request = async (url: any) => {
    calls.push(String(url));
    return json({ champion: saved });
  };
  assert.equal(
    (await requestChampionSave({ ...options, request: request as any })).status,
    200,
  );
  assert.deepEqual(calls, ["/api/admin/champions/hero"]);
});
for (const reason of ["503", "network", "timeout", "invalid response"])
  test(
    "recover committed save after " +
      reason +
      " using one read and no second write",
    async () => {
      const calls: string[] = [];
      const request = async (url: any, init: any) => {
        calls.push(init.method ?? "GET");
        if (calls.length === 1) {
          if (reason === "network") throw TypeError("connection closed");
          if (reason === "timeout")
            throw new DOMException("timeout", "TimeoutError");
          if (reason === "invalid response") return new Response("not-json");
          return json({}, 503);
        }
        return json({ champion: saved });
      };
      const r = await requestChampionSave({
        ...options,
        request: request as any,
      });
      assert.equal((await r.json()).recovered, true);
      assert.deepEqual(calls, ["PATCH", "GET"]);
    },
  );
test("unchanged or different saved values cannot masquerade as a successful write", async () => {
  for (const champion of [
    { ...saved, version: 4 },
    { ...saved, abilityText: "다른 변경" },
  ]) {
    let n = 0;
    const request = async () =>
      ++n === 1 ? json({}, 503) : json({ champion });
    await assert.rejects(
      requestChampionSave({ ...options, request: request as any }),
      ChampionSaveUncertainError,
    );
  }
});
test("validation and genuine conflicts remain errors", async () => {
  for (const status of [400, 401, 403, 409, 422]) {
    const request = async () =>
      json({ champion: { ...saved, name: "다른 수정" } }, status);
    assert.equal(
      (await requestChampionSave({ ...options, request: request as any }))
        .status,
      status,
    );
  }
});
test("new champion requests keep a stable idempotency key and recover by that exact id", async () => {
  const calls: any[] = [];
  const request = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return calls.length === 1
      ? json({}, 504)
      : json({ champion: { ...saved, id: options.creationId, version: 1 } });
  };
  const r = await requestChampionSave({
    ...options,
    id: undefined,
    version: undefined,
    request: request as any,
  });
  assert.equal(r.status, 200);
  assert.equal(calls[0].init.headers["Idempotency-Key"], options.creationId);
  assert.equal(calls[1].url, "/api/admin/champions/" + options.creationId);
});
test("confirmation compares nested values and normalizes saved asset URLs without trusting a name alone", () => {
  assert.ok(
    championSaveValuesMatch(
      {
        ...payload,
        presentationLines: { A: { b: 1, c: 2 } },
        imageAssetId: "/objects/uploads/x.png",
        imageUrl: null,
      },
      {
        ...saved,
        presentationLines: { A: { c: 2, b: 1 } },
        imageAssetId: "/objects/uploads/x.png",
        imageUrl: "/api/storage/objects/uploads/x.png",
      },
    ),
  );
  assert.equal(
    championSaveValuesMatch({ ...payload, abilityText: "다른 효과" }, saved),
    false,
  );
});

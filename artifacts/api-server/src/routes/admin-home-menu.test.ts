import assert from "node:assert/strict";
import { test, mock } from "node:test";
import express from "express";
import { once } from "node:events";
import { defaultHomeMenuLayout } from "@workspace/cosmetics";
test("real HTTP route checks administrator permission and rejects invalid placement before saving", async () => {
  let saves = 0;
  mock.module("@workspace/db", {
    namedExports: {
      db: {
        select: () => ({
          from: () => ({ where: () => ({ orderBy: async () => [] }) }),
        }),
      },
      gameMediaTable: { mediaType: "type", createdAt: "created" },
    },
  });
  mock.module("../lib/auth.ts", {
    namedExports: {
      getAuthenticatedUser: async (req: any) =>
        req.headers["x-test-role"]
          ? { id: "fixture", role: req.headers["x-test-role"] }
          : null,
    },
  });
  mock.module("../lib/home-menu-media.ts", {
    namedExports: {
      readHomeMenuLayout: async () => defaultHomeMenuLayout(),
      saveHomeMenuLayout: async () => {
        saves++;
      },
    },
  });
  const { default: router } = await import("./admin-home-menu");
  const app = express();
  app.use(express.json());
  app.use("/test", router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("no port");
  const url = `http://127.0.0.1:${address.port}/test`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal(
      (await fetch(url, { headers: { "x-test-role": "USER" } })).status,
      403,
    );
    const get = await fetch(url, { headers: { "x-test-role": "ADMIN" } });
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("cache-control"), "no-store");
    assert.deepEqual(
      ((await get.json()) as { layout: unknown }).layout,
      defaultHomeMenuLayout(),
    );
    const put = (body: unknown, role = "ADMIN") =>
      fetch(url, {
        method: "PUT",
        headers: { "x-test-role": role, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await put({ ...defaultHomeMenuLayout(), mobile: { scale: 99 } })).status,
      400,
    );
    assert.equal((await put({...defaultHomeMenuLayout(),background:{desktop:{x:50,y:50},mobile:{x:101,y:50}}})).status,400);
    assert.equal(saves, 0);
    assert.equal((await put(defaultHomeMenuLayout(), "USER")).status, 403);
    assert.equal(saves, 0);
    assert.equal((await put(defaultHomeMenuLayout())).status, 200);
    assert.equal(saves, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    mock.restoreAll();
  }
});

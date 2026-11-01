import assert from "node:assert/strict";
import { test, mock } from "node:test";
import {
  defaultHomeMenuLayout,
  parseHomeMenuLayout,
} from "@workspace/cosmetics";

test("presentation limits reject malformed input without changing defaults", () => {
  const layout = defaultHomeMenuLayout();
  assert.deepEqual(parseHomeMenuLayout(layout), layout);
  for (const scale of [0, 4, NaN, Infinity])
    assert.equal(
      parseHomeMenuLayout({ ...layout, mobile: { ...layout.mobile, scale } }),
      null,
    );
  assert.equal(parseHomeMenuLayout({ ...layout, imageId: "" }), null);
  assert.equal(
    parseHomeMenuLayout({ ...layout, desktop: { ...layout.desktop, x: -1 } }),
    null,
  );
  layout.mobile.scale = 2;
  assert.equal(defaultHomeMenuLayout().mobile.scale, 1);
});

test("managed media save, reload, rollback, type isolation and active deletion", async () => {
  const rows = new Map<string, any>(),
    objects = new Map<string, Buffer>();
  let failInsert = false;
  const database: any = {
    select: () => ({
      from: () => ({
        where: (where: any) => ({
          limit: async () =>
            rows.has(where.value) ? [rows.get(where.value)] : [],
        }),
      }),
    }),
    execute: async () => {},
    insert: () => ({
      values: (record: any) => ({
        onConflictDoUpdate: async () => {
          if (failInsert) throw Error("transaction failure");
          rows.set(record.id, record);
        },
      }),
    }),
    delete: () => ({
      where: async (where: any) => {
        rows.delete(where.value);
      },
    }),
    transaction: async (fn: any) => fn(database),
  };
  mock.module("@workspace/db", {
    namedExports: { db: database, gameMediaTable: { id: "id" } },
  });
  mock.module("drizzle-orm", {
    namedExports: {
      eq: (_field: any, value: any) => ({ value }),
      sql: (parts: any, ...args: any[]) => ({ parts, args }),
    },
  });
  mock.module("./object-storage.ts", {
    namedExports: {
      BackgroundImageStorage: class {
        async save(path: string, buffer: Buffer) {
          objects.set(path, buffer);
        }
        async download(path: string) {
          const buffer = objects.get(path);
          return buffer ? { buffer } : null;
        }
        async remove(path: string) {
          objects.delete(path);
        }
      },
    },
  });
  const service = await import("./home-menu-media");
  assert.deepEqual(await service.readHomeMenuLayout(), defaultHomeMenuLayout());
  const layout = { ...defaultHomeMenuLayout(), imageId: "image" };
  rows.set("image", {
    id: "image",
    mediaType: "HOME_MENU_ART",
    assetId: "/objects/uploads/game-backgrounds/image.png",
    assetUrl: "/api/storage/image.png",
  });
  await service.saveHomeMenuLayout(layout);
  assert.equal(objects.size, 1);
  const savedPath = rows.get("home-battle-menu-layout").assetId;
  assert.equal(rows.get("home-battle-menu-layout").enabled, false);
  const read = await service.readHomeMenuLayout();
  read.mobile.scale = 3;
  assert.equal((await service.readHomeMenuLayout()).mobile.scale, 1);
  assert.equal(
    (await service.publicHomeMenuArtwork()).imageUrl,
    "/api/storage/image.png",
  );
  await assert.rejects(service.removeHomeMenuImage("image"), /사용 중/);
  assert.ok(rows.has("image"));
  failInsert = true;
  await assert.rejects(
    service.saveHomeMenuLayout(defaultHomeMenuLayout()),
    /transaction failure/,
  );
  failInsert = false;
  assert.equal(objects.size, 1);
  assert.equal(rows.get("home-battle-menu-layout").assetId, savedPath);
  await assert.rejects(
    service.saveHomeMenuLayout({ ...layout, imageId: "foreign" }),
    /등록된 메뉴/,
  );
  assert.equal(objects.size, 1);
  await service.saveHomeMenuLayout(defaultHomeMenuLayout());
  assert.equal(objects.size, 1);
  assert.ok(!objects.has(savedPath));
  await service.removeHomeMenuImage("image");
  assert.ok(!rows.has("image"));
  rows.set("home-battle-menu-layout", {
    mediaType: "HOME_MENU_LAYOUT",
    assetId: "https://untrusted.invalid/config.json",
  });
  await assert.rejects(service.readHomeMenuLayout(), /파일 경로/);
  mock.restoreAll();
});

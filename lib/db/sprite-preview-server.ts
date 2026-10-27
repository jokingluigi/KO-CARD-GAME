/** Isolated, disposable preview deployment. Never imported by the production entry point. */
import { createRequire } from "node:module";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, mkdir, access, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "./src/schema";

if (process.env.KO_ISOLATED_SPRITE_PREVIEW !== "1")
  throw Error("Preview must be explicitly enabled");
// Fail closed: no production database URL or storage credentials can be inherited.
if (
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes("127.0.0.1:1/preview-disabled")
)
  throw Error("Preview refuses an external database");
for (const key of [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
])
  if (process.env[key])
    throw Error("Preview refuses inherited storage configuration");
process.env.DATABASE_URL = "postgresql://unused@127.0.0.1:1/preview-disabled";
process.env.NODE_ENV = "production";
process.env.ENABLE_TEST_AUTH = "false";
const port = Number(process.env.PORT || 10000);
const origin =
  process.env.RENDER_EXTERNAL_URL ||
  process.env.PREVIEW_ORIGIN ||
  `http://127.0.0.1:${port}`;
const root = resolve(process.env.PREVIEW_DATA_DIR || "/tmp/ko-sprite-preview");
await mkdir(root, { recursive: true });
try {
  await access(resolve(root, "database/PG_VERSION"));
} catch {
  await cp(
    resolve("artifacts/api-server/dist-sprite-preview/database-template"),
    resolve(root, "database"),
    { recursive: true },
  );
}

const dbRequire = createRequire(resolve("lib/db/package.json"));
const { PGlite } = dbRequire("@electric-sql/pglite");
const pg = new PGlite(resolve(root, "database"), {
  initialMemory: 128 * 1024 * 1024,
  postgresqlconf: [
    "shared_buffers=16MB",
    "work_mem=2MB",
    "maintenance_work_mem=16MB",
  ],
});
await pg.waitReady;
const database = drizzle(pg, { schema });
await pg.exec(
  "CREATE TABLE IF NOT EXISTS preview_objects (key text PRIMARY KEY, bytes bytea NOT NULL, mime text NOT NULL)",
);
const { db } = await import("./src/index");
for (const method of [
  "select",
  "insert",
  "update",
  "delete",
  "transaction",
  "execute",
] as const)
  Object.assign(db, { [method]: database[method].bind(database) });
if (
  !process.env.ADMIN_EMAIL ||
  !process.env.ADMIN_PASSWORD ||
  !process.env.ADMIN_USERNAME
)
  throw Error("Dedicated preview administrator credentials required");
const firstStart = !(
  await database
    .select({ id: schema.usersTable.id })
    .from(schema.usersTable)
    .where(eq(schema.usersTable.email, process.env.ADMIN_EMAIL))
).length;
const { ensureProductionAdmin } =
  await import("../../artifacts/api-server/src/lib/production-admin");
await ensureProductionAdmin();
const [admin] = await database
  .select()
  .from(schema.usersTable)
  .where(eq(schema.usersTable.email, process.env.ADMIN_EMAIL));
if (!admin) throw Error("Preview administrator missing");
if (firstStart) {
  const cards = await database.select().from(schema.cardsTable),
    champions = await database.select().from(schema.championsTable);
  await database
    .insert(schema.userCardCollectionsTable)
    .values(
      cards.map((c) => ({
        userId: admin.id,
        cardDefinitionId: c.id,
        quantity: 3,
      })),
    )
    .onConflictDoNothing();
  await database
    .insert(schema.userChampionCollectionsTable)
    .values(
      champions.map((c) => ({
        userId: admin.id,
        championDefinitionId: c.id,
        owned: true,
      })),
    )
    .onConflictDoNothing();
  const pool = cards.filter(
    (c) =>
      c.status === "PUBLISHED" &&
      c.cardType === "WRESTLER" &&
      c.rarity === "NORMAL" &&
      !c.isToken &&
      !c.isChampionToken,
  );
  const deck = pool.flatMap((c) => [c.id, c.id, c.id]).slice(0, 25);
  if (deck.length !== 25) throw Error("Cannot seed a valid preview deck");
  for (const [i, champion] of champions
    .filter((c) => c.status === "PUBLISHED")
    .entries()) {
    await database.insert(schema.aiDecksTable).values({
      id: `preview-ai-${i}`,
      name: champion.name + " 테스트 덱",
      championDefinitionId: champion.id,
      cardDefinitionIds: deck,
      enabled: true,
    });
    if (i < 2)
      await database.insert(schema.decksTable).values({
        id: `preview-deck-${i}`,
        userId: admin.id,
        name: champion.name + " 테스트 덱",
        championDefinitionId: champion.id,
        cardDefinitionIds: deck,
        isSelected: i === 0,
      });
  }
}
const secret = randomBytes(32).toString("hex");
process.env.STORAGE_PROVIDER = "supabase";
process.env.SUPABASE_URL = origin;
process.env.SUPABASE_SECRET_KEY = secret;
process.env.SUPABASE_STORAGE_BUCKET = "preview";
const apiRequire = createRequire(resolve("artifacts/api-server/package.json"));
const express = apiRequire("express");
const app = express();
app.disable("x-powered-by");
app.use((_req: any, res: any, next: any) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});
function service(req: any, res: any, next: any) {
  if (
    req.headers.authorization !== `Bearer ${secret}` &&
    req.headers.apikey !== secret
  )
    return res.sendStatus(401);
  next();
}
function key(req: any) {
  return req.params.key.join("/");
}
function sign(path: string, expires: number) {
  return createHmac("sha256", secret)
    .update(path + ":" + expires)
    .digest("hex");
}
async function save(req: any, res: any) {
  const k = key(req);
  if (!k.startsWith("preview/uploads/") || k.includes(".."))
    return res.sendStatus(400);
  await pg.query(
    "INSERT INTO preview_objects(key,bytes,mime) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET bytes=excluded.bytes,mime=excluded.mime",
    [k, req.body, req.headers["content-type"] || "application/octet-stream"],
  );
  res.json({ Key: k });
}
app.post(
  "/storage/v1/object/upload/sign/*key",
  service,
  (req: any, res: any) => {
    const path = key(req),
      expires = Date.now() + 900000;
    res.json({
      url: `/object/upload/sign/${path}?expires=${expires}&token=${sign(path, expires)}`,
    });
  },
);
app.put(
  "/storage/v1/object/upload/sign/*key",
  express.raw({ type: "*/*", limit: "25mb" }),
  (req: any, res: any, next: any) => {
    const expires = Number(req.query.expires),
      actual = String(req.query.token || ""),
      expected = sign(key(req), expires);
    if (
      expires < Date.now() ||
      expires > Date.now() + 900001 ||
      actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      return res.sendStatus(403);
    save(req, res).catch(next);
  },
);
app.get(
  ["/storage/v1/object/authenticated/*key", "/storage/v1/object/*key"],
  service,
  async (req: any, res: any) => {
    const result = await pg.query(
      "SELECT bytes,mime FROM preview_objects WHERE key=$1",
      [key(req)],
    );
    const item = result.rows[0];
    if (!item) return res.status(404).json({ message: "Object not found" });
    res.type(item.mime).send(Buffer.from(item.bytes));
  },
);
app.post("/storage/v1/object/list/:bucket", service, (_req: any, res: any) =>
  res.json([]),
);
app.post(
  "/storage/v1/object/*key",
  service,
  express.raw({ type: "*/*", limit: "25mb" }),
  (req: any, res: any, next: any) => save(req, res).catch(next),
);
app.delete(
  "/storage/v1/object/:bucket",
  service,
  express.json(),
  async (req: any, res: any) => {
    for (const p of req.body.prefixes || [])
      await pg.query("DELETE FROM preview_objects WHERE key=$1", [
        req.params.bucket + "/" + p,
      ]);
    res.json([]);
  },
);
// Original public artwork can be read from the existing site. No account/session,
// API data, upload or database requests are ever proxied to production.
app.get("/api/storage/objects/*key", async (req: any, res: any, next: any) => {
  const path = key(req);
  const r = await pg.query(
    "SELECT bytes,mime FROM preview_objects WHERE key=$1",
    ["preview/" + path],
  );
  if (r.rows[0]) {
    res.type(r.rows[0].mime).send(Buffer.from(r.rows[0].bytes));
    return;
  }
  if (/^uploads\/[a-z-]+\/[a-zA-Z0-9_.-]+$/.test(path))
    return res.redirect(
      302,
      "https://ko-card-game.onrender.com/api/storage/objects/" + path,
    );
  next();
});
const { default: api } = await import("../../artifacts/api-server/src/app");
app.use(api);
const web = resolve("artifacts/ko-game/dist/public");
app.use(express.static(web, { index: false }));
const html = (await readFile(resolve(web, "index.html"), "utf8")).replace(
  "</body>",
  `<aside style="position:fixed;bottom:0;left:0;z-index:9999;pointer-events:none;background:#111;color:#ddd;font:10px sans-serif;padding:3px 6px">스프라이트 테스트 서버 · 운영과 분리 · 초기화 시 테스트 데이터 삭제</aside></body>`,
);
app.get("/{*path}", (req: any, res: any) =>
  req.path.startsWith("/api/")
    ? res.sendStatus(404)
    : res.type("html").send(html),
);
app.use((error: any, _req: any, res: any, _next: any) => {
  console.error("Preview request failed:", error.message);
  if (!res.headersSent)
    res.status(500).json({ message: "테스트 서버 처리 오류" });
});
const server = createServer(app);
const { attachOnlineMatchWebSocket } =
  await import("../../artifacts/api-server/src/online/websocket");
attachOnlineMatchWebSocket(server);
server.listen(port, "0.0.0.0", () =>
  console.log("SPRITE_PREVIEW_READY " + origin),
);

process.on("SIGTERM", () => {
  server.close(async () => {
    await pg.close();
    process.exit(0);
  });
});

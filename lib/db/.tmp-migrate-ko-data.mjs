import pg from "pg";
const { Client } = pg;

const SOURCE = process.env.SOURCE_DATABASE_URL;
const TARGET = process.env.TARGET_DATABASE_URL;
const APPLY = process.env.APPLY_KO_MIGRATION === "YES";

if (!SOURCE || !TARGET) {
  throw new Error("SOURCE_DATABASE_URL 또는 TARGET_DATABASE_URL이 없습니다.");
}

const sourceUrl = new URL(SOURCE);
const targetUrl = new URL(TARGET);

if (sourceUrl.hostname !== "helium") {
  throw new Error(`SOURCE가 helium이 아닙니다: ${sourceUrl.hostname}`);
}

if (!targetUrl.hostname.includes("supabase.com")) {
  throw new Error(`TARGET이 Supabase가 아닙니다: ${targetUrl.hostname}`);
}

targetUrl.searchParams.delete("sslmode");
targetUrl.searchParams.delete("uselibpqcompat");

const source = new Client({
  connectionString: SOURCE,
});

const target = new Client({
  connectionString: targetUrl.toString(),
  ssl: { rejectUnauthorized: false },
});

const keepEmails = [
  "jokingluigi@gmail.com",
  "joondr01@naver.com",
  "ko-test-admin@localhost.test",
];

const staticTables = [
  "card_frame_definitions",
  "game_media",
  "cards",
  "champions",
  "pack_definitions",
  "prism_economy_settings",
  "ai_decks",
  "shop_listings",
];

const userTables = [
  "decks",
  "user_card_collections",
  "user_champion_collections",
  "user_pack_inventory",
];

const columnCache = new Map();

function qi(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

async function getTargetColumns(table) {
  if (columnCache.has(table)) return columnCache.get(table);

  const r = await target.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position`,
    [table]
  );

  const cols = r.rows.map(x => x.column_name);
  columnCache.set(table, cols);
  return cols;
}

async function insertRow(table, row, overrides = {}) {
  const targetCols = await getTargetColumns(table);

  const merged = { ...row, ...overrides };

  const cols = targetCols.filter(c =>
    Object.prototype.hasOwnProperty.call(merged, c)
  );

  const values = cols.map(c => merged[c]);
  const params = cols.map((_, i) => `$${i + 1}`).join(", ");

  const sql = `
    insert into ${qi(table)}
      (${cols.map(qi).join(", ")})
    values (${params})
    on conflict do nothing
  `;

  const r = await target.query(sql, values);
  return r.rowCount;
}

async function findUserColumn(table) {
  const r = await target.query(
    `
    select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.constraint_schema = kcu.constraint_schema
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name
       and tc.constraint_schema = ccu.constraint_schema
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public'
       and tc.table_name = $1
       and ccu.table_name = 'users'
       and ccu.column_name = 'id'
     limit 1
    `,
    [table]
  );

  if (r.rows[0]) return r.rows[0].column_name;

  const cols = await getTargetColumns(table);

  return ["user_id", "owner_id", "owner_user_id"]
    .find(c => cols.includes(c));
}

async function count(client, table) {
  const r = await client.query(
    `select count(*)::int as count from ${qi(table)}`
  );
  return r.rows[0].count;
}

try {
  await source.connect();
  await target.connect();

  console.log("SOURCE:", sourceUrl.hostname);
  console.log("TARGET:", targetUrl.hostname);
  console.log(APPLY ? "\n=== 실제 이전 모드 ===" : "\n=== DRY RUN / 아직 수정 안 함 ===");

  const srcUsers = await source.query(
    `select id, email, nickname, role
       from users
      where email = any($1::text[])`,
    [keepEmails]
  );

  const dstUsers = await target.query(
    `select id, email, nickname, role
       from users
      where email = any($1::text[])`,
    [keepEmails]
  );

  const dstByEmail = new Map(
    dstUsers.rows.map(u => [u.email, u])
  );

  const userIdMap = new Map();

  console.log("\n=== 사용자 연결 ===");

  for (const oldUser of srcUsers.rows) {
    const newUser = dstByEmail.get(oldUser.email);

    if (!newUser) {
      throw new Error(
        `Supabase에 대응 계정이 없습니다: ${oldUser.email}`
      );
    }

    userIdMap.set(String(oldUser.id), String(newUser.id));

    console.log(
      `${oldUser.email}: ${oldUser.id} -> ${newUser.id}`
    );
  }

  for (const email of keepEmails) {
    if (!dstByEmail.has(email)) {
      throw new Error(`TARGET 사용자 누락: ${email}`);
    }
  }

  console.log("\n=== 게임 데이터 ===");

  for (const table of staticTables) {
    console.log(
      `${table}: helium=${await count(source, table)} / supabase=${await count(target, table)}`
    );
  }

  console.log("\n=== 사용자 데이터 ===");

  for (const table of userTables) {
    const userCol = await findUserColumn(table);

    if (!userCol) {
      throw new Error(`${table}의 사용자 ID 컬럼을 찾지 못했습니다.`);
    }

    const rows = (await source.query(
      `select * from ${qi(table)}`
    )).rows;

    const matched = rows.filter(row =>
      userIdMap.has(String(row[userCol]))
    );

    console.log(
      `${table}: 전체 ${rows.length}개 중 이전 대상 ${matched.length}개 / 사용자컬럼=${userCol}`
    );
  }

  if (!APPLY) {
    console.log("\nDRY RUN 완료.");
    console.log("아직 Supabase 데이터는 변경되지 않았습니다.");
    process.exit(0);
  }

  await target.query("BEGIN");

  let insertedStatic = 0;
  let insertedUser = 0;

  for (const table of staticTables) {
    const rows = (await source.query(
      `select * from ${qi(table)}`
    )).rows;

    let added = 0;

    for (const row of rows) {
      added += await insertRow(table, row);
    }

    insertedStatic += added;
    console.log(`COPY ${table}: ${added}`);
  }

  for (const table of userTables) {
    const userCol = await findUserColumn(table);

    const rows = (await source.query(
      `select * from ${qi(table)}`
    )).rows;

    let added = 0;

    for (const row of rows) {
      const newUserId = userIdMap.get(String(row[userCol]));

      if (!newUserId) continue;

      added += await insertRow(
        table,
        row,
        { [userCol]: newUserId }
      );
    }

    insertedUser += added;
    console.log(`COPY ${table}: ${added}`);
  }

  await target.query(
    `update users
        set role = 'ADMIN'
      where email = 'ko-test-admin@localhost.test'`
  );

  await target.query("COMMIT");

  console.log("\n==============================");
  console.log("KO DATA MIGRATION SUCCESS");
  console.log("게임 데이터:", insertedStatic);
  console.log("사용자 데이터:", insertedUser);
  console.log("==============================");

} catch (e) {
  try {
    await target.query("ROLLBACK");
  } catch {}

  console.error("\nMIGRATION FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await source.end().catch(() => {});
  await target.end().catch(() => {});
}

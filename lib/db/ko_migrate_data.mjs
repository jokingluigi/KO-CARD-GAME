import pg from "pg";
const { Client } = pg;

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;
const APPLY = process.env.APPLY_KO_MIGRATION === "YES";

if (!SOURCE_URL || !TARGET_URL) {
  throw new Error("SOURCE_DATABASE_URL 또는 TARGET_DATABASE_URL이 없습니다.");
}

const sourceUrl = new URL(SOURCE_URL);
const targetUrl = new URL(TARGET_URL);

if (sourceUrl.hostname !== "helium") {
  throw new Error(`SOURCE가 helium이 아닙니다: ${sourceUrl.hostname}`);
}

if (!targetUrl.hostname.includes("supabase.com")) {
  throw new Error(`TARGET이 Supabase가 아닙니다: ${targetUrl.hostname}`);
}

targetUrl.searchParams.delete("sslmode");
targetUrl.searchParams.delete("uselibpqcompat");

const source = new Client({
  connectionString: SOURCE_URL,
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

function quote(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

async function getColumns(table) {
  if (columnCache.has(table)) {
    return columnCache.get(table);
  }

  const result = await target.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name = $1
     order by ordinal_position`,
    [table]
  );

  const columns = result.rows.map(row => row.column_name);
  columnCache.set(table, columns);

  return columns;
}

async function insertRow(table, row, overrides = {}) {
  const merged = { ...row, ...overrides };
  const targetColumns = await getColumns(table);

  const columns = targetColumns.filter(column =>
    Object.prototype.hasOwnProperty.call(merged, column)
  );

  const values = columns.map(column => merged[column]);
  const parameters = columns.map((_, index) => `$${index + 1}`).join(", ");

  const sql = `
    insert into ${quote(table)}
      (${columns.map(quote).join(", ")})
    values
      (${parameters})
    on conflict do nothing
  `;

  const result = await target.query(sql, values);

  return result.rowCount;
}
async function findUserColumn(table) {
  const result = await target.query(
    `select kcu.column_name
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
     limit 1`,
    [table]
  );

  if (result.rows[0]) {
    return result.rows[0].column_name;
  }

  const columns = await getColumns(table);

  return ["user_id", "owner_id", "owner_user_id"]
    .find(name => columns.includes(name));
}

async function countRows(client, table) {
  const result = await client.query(
    `select count(*)::int as count from ${quote(table)}`
  );

  return result.rows[0].count;
}

async function main() {
  await source.connect();
  await target.connect();

  try {
    console.log("SOURCE:", sourceUrl.hostname);
    console.log("TARGET:", targetUrl.hostname);

    console.log(
      APPLY
        ? "\n=== 실제 데이터 이전 모드 ==="
        : "\n=== DRY RUN / 아직 데이터 변경 없음 ==="
    );

    const oldUsers = (
      await source.query(
        `select id, email, nickname, role
         from users
         where email = any($1::text[])`,
        [keepEmails]
      )
    ).rows;

    const newUsers = (
      await target.query(
        `select id, email, nickname, role
         from users
         where email = any($1::text[])`,
        [keepEmails]
      )
    ).rows;

    const targetUsersByEmail =
      new Map(newUsers.map(user => [user.email, user]));

    const userIdMap = new Map();

    console.log("\n=== 사용자 연결 ===");

    for (const oldUser of oldUsers) {
      const newUser = targetUsersByEmail.get(oldUser.email);

      if (!newUser) {
        throw new Error(
          `Supabase에 대응하는 사용자가 없습니다: ${oldUser.email}`
        );
      }

      userIdMap.set(
        String(oldUser.id),
        String(newUser.id)
      );

      console.log(
        `${oldUser.email}: ${oldUser.id} -> ${newUser.id}`
      );
    }

    for (const email of keepEmails) {
      if (!targetUsersByEmail.has(email)) {
        throw new Error(
          `Supabase 사용자 누락: ${email}`
        );
      }
    }

    console.log("\n=== KO 게임 데이터 ===");

    for (const table of staticTables) {
      const sourceCount = await countRows(source, table);
      const targetCount = await countRows(target, table);

      console.log(
        `${table}: helium=${sourceCount} | supabase=${targetCount}`
      );
    }

    console.log("\n=== 사용자 소유 데이터 ===");

    for (const table of userTables) {
      const userColumn = await findUserColumn(table);

      if (!userColumn) {
        throw new Error(
          `${table}에서 사용자 ID 컬럼을 찾지 못했습니다.`
        );
      }

      const rows = (
        await source.query(
          `select * from ${quote(table)}`
        )
      ).rows;

      const migrationRows = rows.filter(row =>
        userIdMap.has(String(row[userColumn]))
      );

      console.log(
        `${table}: 전체=${rows.length}, 이전대상=${migrationRows.length}, 사용자컬럼=${userColumn}`
      );
    }
    if (!APPLY) {
      console.log(
        "\nDRY RUN 완료. Supabase 데이터는 변경되지 않았습니다."
      );

      return;
    }

    await target.query("BEGIN");

    try {
      console.log("\n=== 게임 데이터 복사 ===");

      for (const table of staticTables) {
        const rows = (
          await source.query(
            `select * from ${quote(table)}`
          )
        ).rows;

        let copied = 0;

        for (const row of rows) {
          copied += await insertRow(table, row);
        }

        console.log(`COPY ${table}: ${copied}`);
      }

      console.log("\n=== 사용자 데이터 복사 ===");

      for (const table of userTables) {
        const userColumn = await findUserColumn(table);

        const rows = (
          await source.query(
            `select * from ${quote(table)}`
          )
        ).rows;

        let copied = 0;

        for (const row of rows) {
          const newUserId =
            userIdMap.get(String(row[userColumn]));

          if (!newUserId) {
            continue;
          }

          copied += await insertRow(
            table,
            row,
            {
              [userColumn]: newUserId,
            }
          );
        }

        console.log(`COPY ${table}: ${copied}`);
      }

      await target.query(
        `update users
         set role = 'ADMIN'
         where email = 'ko-test-admin@localhost.test'`
      );

      await target.query("COMMIT");

      console.log("\n==============================");
      console.log("KO DATA MIGRATION SUCCESS");
      console.log("==============================");

    } catch (error) {
      await target.query("ROLLBACK");
      throw error;
    }

    } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
    }
    }

    main().catch(error => {
    console.error(
    "\nMIGRATION FAILED:",
    error.message
    );

    process.exitCode = 1;
    });
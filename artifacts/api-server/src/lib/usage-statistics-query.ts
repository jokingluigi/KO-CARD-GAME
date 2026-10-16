import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { queryRows, type StatisticsDatabase } from "./usage-statistics-store";
export type StatisticsKind = "cards" | "champions";
export const CARD_FIELDS = [
  "adoptions",
  "copies",
  "plays",
  "played_matches",
  "wins",
  "losses",
  "draws",
  "generated",
  "summons",
] as const;
export const CHAMPION_FIELDS = [
  "selections",
  "wins",
  "losses",
  "draws",
  "ability_uses",
  "ability_matches",
  "quest_eligible",
  "quest_completed",
  "quest_turn_sum",
  "quest_turn_samples",
  "completed_wins",
  "completed_losses",
  "completed_draws",
  "incomplete_wins",
  "incomplete_losses",
  "incomplete_draws",
] as const;
export function statisticsQuery(input: Record<string, unknown>) {
  if (
    Object.keys(input).some(
      (k) => !["period", "sort", "direction", "page", "q"].includes(k),
    ) ||
    Object.values(input).some(
      (v) => typeof v !== "string" && typeof v !== "number",
    )
  )
    throw new Error("INVALID_STATISTICS_QUERY");
  const period = input.period ?? "30",
    sort = input.sort ?? "uses",
    direction = input.direction ?? "desc";
  const page = Number(input.page ?? 1),
    q = input.q ?? "";
  if (
    !["7", "30", "90", "all"].includes(String(period)) ||
    ![
      "uses",
      "rate",
      "winRate",
      "name",
      "cost",
      "rarity",
      "playRate",
      "users",
      "ability_uses",
      "questRate",
    ].includes(String(sort)) ||
    !["asc", "desc"].includes(String(direction)) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    typeof q !== "string" ||
    q.length > 100
  )
    throw new Error("INVALID_STATISTICS_QUERY");
  return {
    period: String(period),
    sort: String(sort),
    direction: String(direction),
    page,
    q,
  };
}
const configuredVerySmall = Number(
  process.env.USAGE_STATS_VERY_SMALL_SAMPLE ?? 10,
);
const configuredSmall = Number(process.env.USAGE_STATS_SMALL_SAMPLE ?? 30);
export const SAMPLE_THRESHOLDS = {
  verySmall:
    Number.isInteger(configuredVerySmall) && configuredVerySmall > 0
      ? configuredVerySmall
      : 10,
  small:
    Number.isInteger(configuredSmall) && configuredSmall >= configuredVerySmall
      ? configuredSmall
      : 30,
};
const rate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);
export function decorateStatistics(
  kind: StatisticsKind,
  row: Record<string, unknown>,
  participants: number,
  knownDecks: number,
) {
  const fields = kind === "cards" ? CARD_FIELDS : CHAMPION_FIELDS;
  const item: Record<string, any> = { ...row };
  for (const key of fields) item[key] = Number(item[key] ?? 0);
  item.users = Number(item.users ?? 0);
  item.samples = item.wins + item.losses;
  item.winRate = rate(item.wins, item.samples);
  item.sampleLabel =
    item.samples < SAMPLE_THRESHOLDS.verySmall
      ? "표본 매우 적음"
      : item.samples < SAMPLE_THRESHOLDS.small
        ? "표본 적음"
        : null;
  if (kind === "cards") {
    item.adoptionRate = rate(item.adoptions, knownDecks);
    item.playRate = rate(item.played_matches, participants);
  } else {
    item.selectionRate = rate(item.selections, participants);
    item.averageAbilityUses = item.selections
      ? item.ability_uses / item.selections
      : null;
    item.abilityMatchRate = rate(item.ability_matches, item.selections);
    item.questRate = rate(item.quest_completed, item.quest_eligible);
    item.averageQuestTurn = item.quest_turn_samples
      ? item.quest_turn_sum / item.quest_turn_samples
      : null;
    item.completedSamples = item.completed_wins + item.completed_losses;
    item.incompleteSamples = item.incomplete_wins + item.incomplete_losses;
    item.completedWinRate = rate(item.completed_wins, item.completedSamples);
    item.incompleteWinRate = rate(item.incomplete_wins, item.incompleteSamples);
  }
  return item;
}
async function readUsageStatisticsSnapshot(
  kind: StatisticsKind,
  input: ReturnType<typeof statisticsQuery>,
  id?: string,
  database: Pick<StatisticsDatabase, "execute"> = db,
  now = new Date(),
) {
  const [meta] = await queryRows<{
    started_at: Date | string;
    refreshed_at: Date | string | null;
    last_error_at: Date | string | null;
  }>(database, sql`SELECT * FROM usage_collection WHERE id='global'`);
  if (!meta) throw new Error("STATISTICS_NOT_INITIALIZED");
  // UTC calendar days including today; end is exclusive and no later than server now.
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const first =
    input.period === "all"
      ? new Date(meta.started_at)
      : new Date(
          Math.max(
            new Date(meta.started_at).getTime(),
            today - (Number(input.period) - 1) * 86400000,
          ),
        );
  const from = first.toISOString().slice(0, 10),
    to = now.toISOString().slice(0, 10);
  const fields = kind === "cards" ? CARD_FIELDS : CHAMPION_FIELDS;
  const table = sql.raw(
      kind === "cards" ? "usage_card_daily" : "usage_champion_daily",
    ),
    key = sql.raw(kind === "cards" ? "card_id" : "champion_id");
  const filter = id ? sql`AND ${key}=${id}` : sql``;
  const catalog =
    kind === "cards"
      ? sql`SELECT id,name,COALESCE(NULLIF(image_url,''),CASE WHEN image_asset_id LIKE '/objects/%' THEN '/api/storage'||image_asset_id END) AS "imageUrl",rarity,cost,text,NULL::text AS "abilityText",NULL::text AS "questText",NULL::text AS "questRewardText",NULL::boolean AS "hasQuest",NULL::text AS "abilityName",NULL::text AS "questName",NULL::text AS "upgradedAbilityText" FROM cards`
      : sql`SELECT id,name,COALESCE(NULLIF(image_url,''),CASE WHEN image_asset_id LIKE '/objects/%' THEN '/api/storage'||image_asset_id END) AS "imageUrl",NULL::text AS rarity,ability_cost AS cost,description AS text,ability_text AS "abilityText",quest_text AS "questText",quest_reward_text AS "questRewardText",has_quest AS "hasQuest",ability_name AS "abilityName",quest_name AS "questName",upgraded_ability_text AS "upgradedAbilityText" FROM champions`;
  const sums = sql.join(
    fields.map((f) => sql`SUM(${sql.raw(f)})::float8 AS ${sql.identifier(f)}`),
    sql`, `,
  );
  const cols = sql.join(
    fields.map(
      (f) => sql`COALESCE(a.${sql.identifier(f)},0) AS ${sql.identifier(f)}`,
    ),
    sql`, `,
  );
  const distinct =
    kind === "cards"
      ? sql`SELECT card_id AS id,COUNT(DISTINCT subject_key)::int AS users FROM usage_card_users_daily WHERE day BETWEEN ${from}::date AND ${to}::date ${id ? sql`AND card_id=${id}` : sql``} GROUP BY card_id`
      : sql`SELECT champion_id AS id,COUNT(DISTINCT subject_key)::int AS users FROM usage_champion_users_daily WHERE day BETWEEN ${from}::date AND ${to}::date ${id ? sql`AND champion_id=${id}` : sql``} GROUP BY champion_id`;
  const [cohort] = await queryRows<{ participants: number; known: number }>(
    database,
    sql`SELECT COALESCE(SUM(participations),0)::float8 AS participants,COALESCE(SUM(deck_known),0)::float8 AS known FROM usage_daily_totals WHERE day BETWEEN ${from}::date AND ${to}::date`,
  );
  const raw = await queryRows(
    database,
    sql`WITH a AS (SELECT ${key} AS id,${sums} FROM ${table} WHERE day BETWEEN ${from}::date AND ${to}::date ${filter} GROUP BY ${key}),u AS (${distinct}),catalog AS (${catalog}),ids AS (SELECT id FROM catalog UNION SELECT id FROM a ${id ? sql`UNION SELECT ${key} AS id FROM ${table} WHERE ${key}=${id}` : sql``}) SELECT ids.id,c.id IS NOT NULL AS "definitionAvailable",COALESCE(c.name,ids.id||' (삭제된 콘텐츠)') AS name,c."imageUrl",c.rarity,c.cost,c.text,c."abilityText",c."questText",c."questRewardText",c."hasQuest",c."abilityName",c."questName",c."upgradedAbilityText",${cols},COALESCE(u.users,0) AS users FROM ids LEFT JOIN catalog c USING(id) LEFT JOIN a USING(id) LEFT JOIN u USING(id) ${id ? sql`WHERE ids.id=${id}` : sql``}`,
  );
  const all = raw.map((r) =>
    decorateStatistics(
      kind,
      r,
      Number(cohort?.participants ?? 0),
      Number(cohort?.known ?? 0),
    ),
  );
  const searched = all.filter(
    (r) =>
      String(r.name)
        .toLocaleLowerCase()
        .includes(input.q.toLocaleLowerCase()) ||
      String(r.id).includes(input.q),
  );
  const sortKey =
    input.sort === "uses"
      ? kind === "cards"
        ? "plays"
        : "selections"
      : input.sort === "rate"
        ? kind === "cards"
          ? "adoptionRate"
          : "selectionRate"
        : input.sort;
  searched.sort((a, b) => {
    const x = a[sortKey],
      y = b[sortKey];
    if (x === null || x === undefined)
      return y == null ? String(a.id).localeCompare(String(b.id)) : 1;
    if (y === null || y === undefined) return -1;
    const order =
      typeof x === "string"
        ? x.localeCompare(String(y), "ko")
        : Number(x) - Number(y);
    return (
      (input.direction === "asc" ? order : -order) ||
      String(a.id).localeCompare(String(b.id))
    );
  });
  let daily: Record<string, any>[] = [];
  let comparison: null | Record<string, number | null> = null;
  if (id) {
    const days = await queryRows(
      database,
      sql`SELECT day::text AS day,${sums} FROM ${table} WHERE ${key}=${id} AND day BETWEEN ${from}::date AND ${to}::date GROUP BY day ORDER BY day`,
    );
    daily = days.map((r) => decorateStatistics(kind, r, 0, 0));
    const fourteen = await queryRows<{ recent: number; previous: number }>(
      database,
      sql`SELECT COALESCE(SUM(${sql.raw(kind === "cards" ? "plays" : "selections")}) FILTER (WHERE day>=${new Date(today - 6 * 86400000).toISOString().slice(0, 10)}::date),0)::float8 AS recent,COALESCE(SUM(${sql.raw(kind === "cards" ? "plays" : "selections")}) FILTER (WHERE day<${new Date(today - 6 * 86400000).toISOString().slice(0, 10)}::date),0)::float8 AS previous FROM ${table} WHERE ${key}=${id} AND day BETWEEN ${new Date(today - 13 * 86400000).toISOString().slice(0, 10)}::date AND ${to}::date`,
    );
    const c = fourteen[0];
    const completeBaseline =
      new Date(meta.started_at).getTime() <= today - 13 * 86400000;
    comparison = {
      recent: Number(c?.recent ?? 0),
      previous: completeBaseline ? Number(c?.previous ?? 0) : null,
      changePercent:
        completeBaseline && Number(c?.previous) > 0
          ? ((Number(c!.recent) - Number(c!.previous)) / Number(c!.previous)) *
            100
          : null,
    };
  }
  return {
    kind,
    period: input.period,
    timezone: "UTC",
    from: first.toISOString(),
    to: now.toISOString(),
    collectionStartedAt: meta.started_at,
    lastAggregatedAt: meta.refreshed_at,
    lastErrorAt: meta.last_error_at,
    policy:
      "서버 확정 종료 경기만 포함 · 종료일 UTC 기준 · 무승부는 승률 분모 제외",
    totals: {
      participants: Number(cohort?.participants ?? 0),
      knownDecks: Number(cohort?.known ?? 0),
    },
    items: searched.slice((input.page - 1) * 50, input.page * 50),
    total: searched.length,
    page: input.page,
    pageSize: 50,
    ...(id ? { detail: all[0] ?? null, daily, comparison } : {}),
  };
}

/** One MVCC snapshot keeps numerators, denominators and unique users consistent during collection. */
export async function readUsageStatistics(
  kind: StatisticsKind,
  input: ReturnType<typeof statisticsQuery>,
  id?: string,
  database: StatisticsDatabase = db,
  now = new Date(),
) {
  return database.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      return readUsageStatisticsSnapshot(kind, input, id, tx, now);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

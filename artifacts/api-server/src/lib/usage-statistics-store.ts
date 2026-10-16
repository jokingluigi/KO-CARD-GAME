import { matchTurnNumber } from "@workspace/game-engine/rules";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { TEST_ADMIN_EMAIL, TEST_USER_EMAIL } from "./test-account";
import {
  summarizeUsage,
  type UsageSummary,
  type UsageStart,
} from "./usage-statistics-events";
import type { GameState } from "@workspace/game-engine";

export type StatisticsDatabase = Pick<typeof db, "execute" | "transaction">;
type Executor = Pick<typeof db, "execute">;
export async function queryRows<T = Record<string, unknown>>(
  database: Executor,
  query: ReturnType<typeof sql>,
): Promise<T[]> {
  const result = await database.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const reserved = new Set([TEST_ADMIN_EMAIL, TEST_USER_EMAIL]);
export async function ingestUsage(
  sourceKey: string,
  summary: UsageSummary,
  bindings: Record<string, string | null>,
  database: StatisticsDatabase = db,
) {
  return database.transaction(async (tx) => {
    const [collection] = await queryRows<{ started_at: Date | string }>(
      tx,
      sql`SELECT started_at FROM usage_collection WHERE id='global'`,
    );
    if (
      !collection ||
      Date.parse(summary.startedAt) < new Date(collection.started_at).getTime()
    )
      return false;
    const claim = await queryRows(
      tx,
      sql`INSERT INTO usage_processed_sources(source_key) VALUES(${sourceKey}) ON CONFLICT DO NOTHING RETURNING source_key`,
    );
    if (!claim.length) return false;
    if (!summary.diagnostic && summary.unresolvedEvents)
      throw new Error("USAGE_UNRESOLVED_EVENT_ID");

    const ids = [
      ...new Set(
        Object.values(bindings).filter((id): id is string => Boolean(id)),
      ),
    ];
    const eligible = new Set<string>();
    if (!summary.diagnostic && ids.length) {
      const users = await queryRows<{
        id: string;
        email: string;
        excluded: boolean;
      }>(
        tx,
        sql`SELECT u.id,u.email,EXISTS(SELECT 1 FROM usage_excluded_accounts x WHERE x.user_id=u.id) AS excluded FROM users u WHERE u.id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`,`,
        )})`,
      );
      for (const user of users)
        if (!user.excluded && !reserved.has(user.email.trim().toLowerCase()))
          eligible.add(user.id);
    }
    // One UTC day is the SERVER-confirmed end date. All metrics share this cohort.
    const day = new Date(summary.endedAt).toISOString().slice(0, 10);
    for (const p of summary.participants) {
      const userId = bindings[p.seat];
      if (!userId || !eligible.has(userId)) continue;
      const subject = hash("ko-usage-user:" + userId).slice(0, 32),
        id = hash(sourceKey + ":" + subject).slice(0, 32);
      const w = Number(p.outcome === "WIN"),
        l = Number(p.outcome === "LOSS"),
        d = Number(p.outcome === "DRAW"),
        q = Number(p.questEligible && p.questCompleted),
        n = Number(p.questEligible && !p.questCompleted);
      await tx.execute(
        sql`WITH saved AS (INSERT INTO usage_participations(id,source_key,subject_key,champion_id,started_at,ended_at,day,outcome,deck_known,ability_uses,quest_eligible,quest_completed,quest_turn) VALUES(${id},${sourceKey},${subject},${p.championId},${summary.startedAt}::timestamptz,${summary.endedAt}::timestamptz,${day}::date,${p.outcome},${p.deckKnown},${p.abilityUses},${p.questEligible},${Boolean(q)},${p.questTurn}) RETURNING day,champion_id,subject_key) INSERT INTO usage_champion_users_daily(day,champion_id,subject_key) SELECT day,champion_id,subject_key FROM saved ON CONFLICT DO NOTHING`,
      );
      await tx.execute(
        sql`INSERT INTO usage_daily_totals(day,participations,deck_known) VALUES(${day}::date,1,${Number(p.deckKnown)}) ON CONFLICT(day) DO UPDATE SET participations=usage_daily_totals.participations+1,deck_known=usage_daily_totals.deck_known+EXCLUDED.deck_known`,
      );
      await tx.execute(
        sql`INSERT INTO usage_champion_daily(day,champion_id,selections,wins,losses,draws,ability_uses,ability_matches,quest_eligible,quest_completed,quest_turn_sum,quest_turn_samples,completed_wins,completed_losses,completed_draws,incomplete_wins,incomplete_losses,incomplete_draws) VALUES(${day}::date,${p.championId},1,${w},${l},${d},${p.abilityUses},${Number(p.abilityUses > 0)},${Number(p.questEligible)},${q},${q && p.questTurn !== null ? matchTurnNumber(p.questTurn) : 0},${Number(Boolean(q) && p.questTurn !== null)},${q * w},${q * l},${q * d},${n * w},${n * l},${n * d}) ON CONFLICT(day,champion_id) DO UPDATE SET selections=usage_champion_daily.selections+1,wins=usage_champion_daily.wins+EXCLUDED.wins,losses=usage_champion_daily.losses+EXCLUDED.losses,draws=usage_champion_daily.draws+EXCLUDED.draws,ability_uses=usage_champion_daily.ability_uses+EXCLUDED.ability_uses,ability_matches=usage_champion_daily.ability_matches+EXCLUDED.ability_matches,quest_eligible=usage_champion_daily.quest_eligible+EXCLUDED.quest_eligible,quest_completed=usage_champion_daily.quest_completed+EXCLUDED.quest_completed,quest_turn_sum=usage_champion_daily.quest_turn_sum+EXCLUDED.quest_turn_sum,quest_turn_samples=usage_champion_daily.quest_turn_samples+EXCLUDED.quest_turn_samples,completed_wins=usage_champion_daily.completed_wins+EXCLUDED.completed_wins,completed_losses=usage_champion_daily.completed_losses+EXCLUDED.completed_losses,completed_draws=usage_champion_daily.completed_draws+EXCLUDED.completed_draws,incomplete_wins=usage_champion_daily.incomplete_wins+EXCLUDED.incomplete_wins,incomplete_losses=usage_champion_daily.incomplete_losses+EXCLUDED.incomplete_losses,incomplete_draws=usage_champion_daily.incomplete_draws+EXCLUDED.incomplete_draws`,
      );
      if (p.cards.length) {
        await tx.execute(
          sql`WITH saved AS (INSERT INTO usage_card_matches(participation_id,card_id,deck_copies,plays,generated,summons) VALUES ${sql.join(
            p.cards.map(
              (c) =>
                sql`(${id},${c.id},${c.deckCopies},${c.plays},${c.generated},${c.summons})`,
            ),
            sql`,`,
          )} RETURNING card_id,plays) INSERT INTO usage_card_users_daily(day,card_id,subject_key) SELECT ${day}::date,card_id,${subject}::uuid FROM saved WHERE plays>0 ON CONFLICT DO NOTHING`,
        );
        await tx.execute(
          sql`INSERT INTO usage_card_daily(day,card_id,adoptions,copies,plays,played_matches,wins,losses,draws,generated,summons) VALUES ${sql.join(
            p.cards.map(
              (c) =>
                sql`(${day}::date,${c.id},${Number(c.deckCopies > 0)},${c.deckCopies},${c.plays},${Number(c.plays > 0)},${c.deckCopies ? w : 0},${c.deckCopies ? l : 0},${c.deckCopies ? d : 0},${c.generated},${c.summons})`,
            ),
            sql`, `,
          )} ON CONFLICT(day,card_id) DO UPDATE SET adoptions=usage_card_daily.adoptions+EXCLUDED.adoptions,copies=usage_card_daily.copies+EXCLUDED.copies,plays=usage_card_daily.plays+EXCLUDED.plays,played_matches=usage_card_daily.played_matches+EXCLUDED.played_matches,wins=usage_card_daily.wins+EXCLUDED.wins,losses=usage_card_daily.losses+EXCLUDED.losses,draws=usage_card_daily.draws+EXCLUDED.draws,generated=usage_card_daily.generated+EXCLUDED.generated,summons=usage_card_daily.summons+EXCLUDED.summons`,
        );
      }
    }
    await tx.execute(
      sql`UPDATE usage_collection SET refreshed_at=now() WHERE id='global'`,
    );
    return true;
  });
}

/** Recovers from durable GAME records. No client-facing ingestion endpoint exists. */
export async function collectUsageBatch(database: StatisticsDatabase = db) {
  let processed = 0;
  const attempt = async (key: string, work: () => Promise<unknown>) => {
    try {
      await work();
      await database.execute(
        sql`DELETE FROM usage_collection_failures WHERE source_key=${key}`,
      );
      return true;
    } catch (error) {
      const code =
        error instanceof Error && error.message === "USAGE_UNRESOLVED_EVENT_ID"
          ? "UNRESOLVED_EVENT_ID"
          : "COLLECTION_FAILED";
      console.error("[KO usage statistics] source retained for retry", {
        source: hash(key).slice(0, 12),
        code,
      });
      await database.execute(
        sql`INSERT INTO usage_collection_failures(source_key,next_retry_at,last_code) VALUES(${key},now()+interval '10 seconds',${code}) ON CONFLICT(source_key) DO UPDATE SET attempts=usage_collection_failures.attempts+1,next_retry_at=now()+LEAST(300,5*power(2,LEAST(usage_collection_failures.attempts,6)))*interval '1 second',last_failed_at=now(),last_code=EXCLUDED.last_code`,
      );
      return false;
    }
  };
  const online = await queryRows<{
    id: string;
    snapshot: {
      usageStart?: UsageStart;
      player1UserId: string;
      player2UserId: string;
    };
    state: GameState;
    ended: Date;
  }>(
    database,
    sql`SELECT id,serialized_snapshot AS snapshot,serialized_game_state AS state,ended_at AS ended FROM online_matches m WHERE status='ENDED' AND usage_recorded_at IS NULL AND ended_at>=(SELECT started_at FROM usage_collection WHERE id='global') AND serialized_snapshot->'usageStart' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM usage_collection_failures f WHERE f.source_key='pvp:'||m.id AND f.next_retry_at>now()) ORDER BY ended_at LIMIT 20`,
  );
  for (const row of online)
    await attempt("pvp:" + row.id, async () => {
      const summary = summarizeUsage(
        row.state,
        row.snapshot.usageStart,
        new Date(row.ended),
      );
      if (
        summary &&
        (await ingestUsage(
          "pvp:" + row.id,
          summary,
          {
            PLAYER_ONE: row.snapshot.player1UserId,
            PLAYER_TWO: row.snapshot.player2UserId,
          },
          database,
        ))
      )
        processed++;
      await database.execute(
        sql`UPDATE online_matches SET usage_recorded_at=now() WHERE id=${row.id}`,
      );
    });
  const ai = await queryRows<{
    id: string;
    user_id: string;
    summary: UsageSummary;
  }>(
    database,
    sql`SELECT id,user_id,usage_summary AS summary FROM ai_quest_matches m WHERE usage_summary IS NOT NULL AND usage_recorded_at IS NULL AND created_at>=(SELECT started_at FROM usage_collection WHERE id='global') AND NOT EXISTS(SELECT 1 FROM usage_collection_failures f WHERE f.source_key='ai:'||m.id AND f.next_retry_at>now()) ORDER BY created_at LIMIT 20`,
  );
  for (const row of ai)
    await attempt("ai:" + row.id, async () => {
      if (
        await ingestUsage(
          "ai:" + row.id,
          row.summary,
          { [row.summary.participants[0]!.seat]: row.user_id },
          database,
        )
      )
        processed++;
      await database.execute(
        sql`UPDATE ai_quest_matches SET usage_recorded_at=now(),usage_summary=NULL WHERE id=${row.id}`,
      );
    });
  const tower = await queryRows<{
    id: string;
    user_id: string;
    summary: UsageSummary;
  }>(
    database,
    sql`SELECT t.id,t.user_id,j.value AS summary FROM tower_runs t CROSS JOIN LATERAL jsonb_array_elements(t.usage_pending) j WHERE t.usage_pending<>'[]'::jsonb AND NOT EXISTS(SELECT 1 FROM usage_collection_failures f WHERE f.source_key='tower:'||(j.value->>'matchId') AND f.next_retry_at>now()) ORDER BY t.updated_at LIMIT 20`,
  );
  for (const row of tower)
    await attempt("tower:" + row.summary.matchId, async () => {
      const key = "tower:" + row.summary.matchId;
      await ingestUsage(
        key,
        row.summary,
        { "player-1": row.user_id },
        database,
      );
      await database.execute(
        sql`UPDATE tower_runs SET usage_pending=(SELECT COALESCE(jsonb_agg(j.value),'[]'::jsonb) FROM jsonb_array_elements(usage_pending) j WHERE j.value->>'matchId'<>${row.summary.matchId}) WHERE id=${row.id}`,
      );
      processed++;
    });
  const draft = await queryRows<{
    id: string;
    start: UsageStart;
    state: { battle: GameState; seats: { userId: string | null }[] };
    ended: Date;
  }>(
    database,
    sql`SELECT id,usage_start AS start,state,updated_at AS ended FROM draft_sessions s WHERE usage_start IS NOT NULL AND usage_recorded_at IS NULL AND state->'battle'->>'status'='FINISHED' AND NOT EXISTS(SELECT 1 FROM usage_collection_failures f WHERE f.source_key='draft:'||s.id AND f.next_retry_at>now()) ORDER BY updated_at LIMIT 20`,
  );
  for (const row of draft)
    await attempt("draft:" + row.id, async () => {
      const summary = summarizeUsage(
        row.state.battle,
        row.start,
        new Date(row.ended),
      );
      if (
        summary &&
        (await ingestUsage(
          "draft:" + row.id,
          summary,
          {
            PLAYER_ONE: row.state.seats[0]?.userId ?? null,
            PLAYER_TWO: row.state.seats[1]?.userId ?? null,
          },
          database,
        ))
      )
        processed++;
      await database.execute(
        sql`UPDATE draft_sessions SET usage_recorded_at=now() WHERE id=${row.id}`,
      );
    });
  // If a source checkpoint committed but its response was lost, its totals are already safe.
  await database.execute(
    sql`DELETE FROM usage_collection_failures f USING usage_processed_sources p WHERE f.source_key=p.source_key`,
  );
  await database.execute(
    sql`UPDATE usage_collection SET refreshed_at=now(),last_error_at=(SELECT MAX(last_failed_at) FROM usage_collection_failures) WHERE id='global'`,
  );
  // Only our new raw summaries expire. Exact period/all-time unique users survive separately.
  await database.execute(
    sql`WITH removed AS (DELETE FROM usage_participations WHERE id IN (SELECT id FROM usage_participations WHERE day < (now() AT TIME ZONE 'UTC')::date - 30 AND EXISTS(SELECT 1 FROM usage_collection WHERE id='global' AND (last_pruned_at IS NULL OR last_pruned_at < date_trunc('day',now()))) ORDER BY day LIMIT 100) RETURNING id) UPDATE usage_collection SET last_pruned_at=CASE WHEN (SELECT count(*) FROM removed)<100 THEN now() ELSE last_pruned_at END WHERE id='global' AND (last_pruned_at IS NULL OR last_pruned_at < date_trunc('day',now()))`,
  );
  return processed;
}
let running = false;
export function startUsageStatisticsWorker() {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await collectUsageBatch();
    } catch (error) {
      console.error(
        "[KO usage statistics] collection failed; durable sources will retry",
        { code: (error as { code?: string }).code ?? "COLLECTION_FAILED" },
      );
      try {
        await db.execute(
          sql`UPDATE usage_collection SET last_error_at=now() WHERE id='global'`,
        );
      } catch {}
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 30000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

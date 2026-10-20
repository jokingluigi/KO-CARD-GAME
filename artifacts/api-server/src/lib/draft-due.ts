import { sql } from "drizzle-orm";
import { draftSessionsTable } from "@workspace/db";
/** Same persisted due predicate for the worker and read-only game-state polling. */
export function draftSessionDue(now = Date.now()) {
  const state = draftSessionsTable.state;
  return sql`(
    ${state}->>'phase' IN ('FINISHED','ABORTED') OR
    (${state}->>'phase'='DRAFT' AND (
      (${state}->>'mode'='PVP' AND (
        (NOT coalesce((${state}->'seats'->0->>'ready')::boolean,false) AND (${state}->'seats'->0->>'deadline')::bigint <= ${now}) OR
        (NOT coalesce((${state}->'seats'->1->>'ready')::boolean,false) AND (${state}->'seats'->1->>'deadline')::bigint <= ${now})
      )) OR
      ((${state}->'seats'->0->>'ready')::boolean AND (${state}->'seats'->1->>'ready')::boolean)
    )) OR
    (${state}->>'phase'='BATTLE' AND (
      ${state}->'battle'->>'status'='FINISHED' OR
      (${state}->'seats'->0->>'userId' IS NOT NULL AND (${state}->'lastSeen'->>0)::bigint < ${now - 60000}) OR
      (${state}->'seats'->1->>'userId' IS NOT NULL AND (${state}->'lastSeen'->>1)::bigint < ${now - 60000}) OR
      (${now} >= coalesce((${state}->>'gameplayStartsAt')::bigint,0) AND (
        (${state}->>'turnDeadline')::bigint <= ${now} OR
        (${state}->>'mode'='AI' AND (
          (coalesce((${state}->'battle'->>'openingMulligan')::boolean,false) AND NOT coalesce((${state}->'battle'->'players'->1->>'mulliganUsed')::boolean,false)) OR
          (NOT coalesce((${state}->'battle'->>'openingMulligan')::boolean,false) AND ${state}->'battle'->>'activePlayerId'='PLAYER_TWO')
        ))
      ))
    ))
  )`;
}

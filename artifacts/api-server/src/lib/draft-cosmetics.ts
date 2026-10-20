import { db, draftSessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { DraftSnapshot } from "@workspace/game-engine";
import type { MatchCosmetics, CosmeticLoadout } from "@workspace/cosmetics";
import { CosmeticError } from "./cosmetics";
import { CosmeticEmoteChannel } from "./cosmetic-emotes";
export type CosmeticDraftSnapshot = DraftSnapshot & {
  cosmetics?: MatchCosmetics;
};
const channels = new Map<string, CosmeticEmoteChannel>();
function channel(id: string) {
  let value = channels.get(id);
  if (!value) {
    value = new CosmeticEmoteChannel();
    channels.set(id, value);
    setTimeout(() => channels.delete(id), 10 * 60_000).unref();
  }
  return value;
}
export const latestDraftCosmeticEmotes = (id: string) =>
  channels.get(id)?.latest() ?? [];
export async function sendDraftCosmeticEmote(
  userId: string,
  id: string,
  body: unknown,
) {
  const input = body as { requestId?: unknown; slot?: unknown } | null;
  if (
    !input ||
    typeof input.requestId !== "string" ||
    !input.requestId.trim() ||
    input.requestId.length > 128 ||
    !Number.isInteger(input.slot) ||
    Number(input.slot) < 1 ||
    Number(input.slot) > 4
  )
    throw new CosmeticError(400, "이모티콘 요청을 확인해 주세요.");
  if (channels.get(id)?.maySend(userId, input.requestId) === false) return null;
  // Read only: select participant IDs and four emotes, without loading the card catalog,
  // advancing AI, changing timers/quests, writing heartbeat or touching combat state.
  const [row] = await db
    .select({
      phase: sql<string>`${draftSessionsTable.state}->>'phase'`,
      status: sql<string>`${draftSessionsTable.state}->'battle'->>'status'`,
      owner: sql<string>`${draftSessionsTable.state}->'seats'->0->>'userId'`,
      opponent: sql<string>`${draftSessionsTable.state}->'seats'->1->>'userId'`,
      firstEmotes: sql<
        CosmeticLoadout["emotes"]
      >`${draftSessionsTable.snapshot}->'cosmetics'->'PLAYER_ONE'->'emotes'`,
      secondEmotes: sql<
        CosmeticLoadout["emotes"]
      >`${draftSessionsTable.snapshot}->'cosmetics'->'PLAYER_TWO'->'emotes'`,
    })
    .from(draftSessionsTable)
    .where(eq(draftSessionsTable.id, id));
  const seat = row?.owner === userId ? 0 : row?.opponent === userId ? 1 : -1;
  if (!row || seat < 0)
    throw new CosmeticError(403, "참가 중인 드래프트만 이용할 수 있습니다.");
  if (row.phase !== "BATTLE" || row.status === "FINISHED")
    throw new CosmeticError(409, "진행 중인 전투가 없습니다.");
  const playerId = seat === 0 ? "PLAYER_ONE" : "PLAYER_TWO";
  return channel(id).send({
    matchId: id,
    userId,
    playerId,
    requestId: input.requestId,
    slot: Number(input.slot),
    loadout: {
      emotes: (seat === 0 ? row.firstEmotes : row.secondEmotes) ?? [],
    },
  });
}

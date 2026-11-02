import { z } from "zod";
const safeImage = z
  .string()
  .max(2048)
  .refine((v) => /^(https?:\/\/|\/(?!\/))/.test(v));
const wish = z.object({
  id: z.string().min(1).max(160),
  kind: z.enum(["card", "skin"]),
  name: z.string().max(160),
  image: safeImage.nullish(),
  acquired: z.boolean().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
});
const match = z.object({
  id: z.string().min(1).max(160),
  mode: z.enum(["AI", "QUICK", "FRIENDLY", "OTHER"]).optional(),
  deckId: z.string().max(160).optional(),
  deckName: z.string().max(160).optional(),
  opponent: z.string().max(160),
  result: z.enum(["승리", "패배", "무승부"]),
  at: z.number().int().nonnegative().max(8640000000000000),
});
export const journalSchema = z.object({
  wishes: z.array(wish).max(500),
  matches: z.array(match).max(200),
  removedWishes: z
    .array(
      z.object({ id: z.string().max(160), at: z.number().int().nonnegative() }),
    )
    .max(1000)
    .default([]),
});
export type JournalDocument = z.infer<typeof journalSchema>;
export function mergeJournal(
  current: JournalDocument,
  incoming: JournalDocument,
): JournalDocument {
  const removed = new Map(current.removedWishes.map((v) => [v.id, v]));
  for (const item of incoming.removedWishes)
    if (item.at >= (removed.get(item.id)?.at ?? 0)) removed.set(item.id, item);
  const wishes = new Map(current.wishes.map((v) => [v.id, v]));
  for (const item of incoming.wishes)
    if ((item.updatedAt ?? 0) >= (wishes.get(item.id)?.updatedAt ?? 0))
      wishes.set(item.id, item);
  for (const [id, item] of wishes)
    if ((removed.get(id)?.at ?? -1) >= (item.updatedAt ?? 0)) wishes.delete(id);
  const matches = new Map(current.matches.map((v) => [v.id, v]));
  for (const item of incoming.matches) {
    const old = matches.get(item.id);
    if (!old) matches.set(item.id, item);
    else if (!old.deckId && item.deckId)
      matches.set(item.id, {
        ...old,
        deckId: item.deckId,
        deckName: item.deckName,
        mode: item.mode ?? old.mode,
      });
  }
  return {
    wishes: [...wishes.values()].slice(-500),
    matches: [...matches.values()].sort((a, b) => b.at - a.at).slice(0, 200),
    removedWishes: [...removed.values()]
      .sort((a, b) => a.at - b.at)
      .slice(-1000),
  };
}

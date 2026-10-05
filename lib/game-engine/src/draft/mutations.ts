import {
  applicableDraftMutations,
  DRAFT_MUTATIONS,
} from "../../../../artifacts/ko-game/src/game/cards/draft-mutation";
import type { DraftSnapshot, DraftSeat } from "./domain";
import { draftRandom } from "./domain";
export function ensureDraftCopies(seat: DraftSeat, prefix: string) {
  seat.cards ??= seat.deck.map((definitionId, i) => ({
    instanceId: `${prefix}:${i}`,
    definitionId,
  }));
}
export function mutationTargets(snapshot: DraftSnapshot, seat: DraftSeat) {
  return (seat.cards ?? []).filter(
    (copy) =>
      !copy.mutation &&
      snapshot.cards.some(
        (c) => c.id === copy.definitionId && c.cardType !== "TECHNIQUE",
      ),
  );
}
export function beginDraftMutation(
  snapshot: DraftSnapshot,
  seat: DraftSeat,
  seed: string,
) {
  if (
    !snapshot.config.mutationEnabled ||
    seat.deck.length === 25 ||
    seat.deck.length % snapshot.config.mutationInterval ||
    !mutationTargets(snapshot, seat).length
  )
    return;
  const grand =
    snapshot.config.grandMutationEnabled &&
    !seat.grandMutationUsed &&
    draftRandom(`${seed}:grand`)() < snapshot.config.grandMutationChance;
  seat.mutationEvent = { targetId: null, offers: [], grand };
}
export function chooseMutationTarget(
  snapshot: DraftSnapshot,
  seat: DraftSeat,
  id: string,
  seed: string,
) {
  const event = seat.mutationEvent;
  if (
    !event ||
    event.targetId ||
    !mutationTargets(snapshot, seat).some((c) => c.instanceId === id)
  )
    throw new Error("개조 대상을 확인해 주세요.");
  const copy = seat.cards!.find((c) => c.instanceId === id)!;
  const def = snapshot.cards.find((c) => c.id === copy.definitionId)!;
  let choices = applicableDraftMutations(def, event.grand);
  if (!choices.length) {
    event.grand = false;
    choices = applicableDraftMutations(def);
  }
  if (choices.length < 3)
    choices = [
      ...choices,
      ...applicableDraftMutations(def).filter(
        (m) => !choices.some((c) => c.id === m.id),
      ),
    ];
  const random = draftRandom(`${seed}:mutation:${id}`);
  event.targetId = id;
  event.offers = [];
  while (choices.length && event.offers.length < 3)
    event.offers.push(
      choices.splice(Math.floor(random() * choices.length), 1)[0].id,
    );
}
export function chooseDraftMutation(seat: DraftSeat, id: string) {
  const e = seat.mutationEvent;
  if (!e?.targetId || !e.offers.includes(id))
    throw new Error("현재 개조 후보에서 선택해 주세요.");
  const copy = seat.cards?.find((c) => c.instanceId === e.targetId);
  if (!copy || copy.mutation) throw new Error("개조 대상을 확인해 주세요.");
  copy.mutation = structuredClone(DRAFT_MUTATIONS.find((m) => m.id === id)!);
  if (copy.mutation.grand) seat.grandMutationUsed = true;
  seat.mutationEvent = null;
}
export { DRAFT_MUTATIONS };

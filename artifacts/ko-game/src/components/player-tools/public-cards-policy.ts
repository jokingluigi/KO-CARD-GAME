import type { GameState } from "../../game";
/** Only visible board instances and explicit public disclosures. Never read hands/decks. */
export function observePublicCards(
  state: GameState,
  seen: Map<string, string>,
  start = 0,
) {
  const opp = state.players[1];
  for (const c of opp.board) if (c) seen.set(c.instanceId, c.definitionId);
  for (const e of state.events.slice(start)) {
    if (e.playerId !== opp.id || !e.cardInstanceId) continue;
    if (e.revealedCard) seen.set(e.cardInstanceId, e.revealedCard.definitionId);
    else if (
      ["CARD_PLAYED", "TECHNIQUE_PLAYED", "ENTER_FIELD"].includes(e.type)
    ) {
      const c = [...opp.board, ...opp.graveyard].find(
        (c) => c?.instanceId === e.cardInstanceId,
      );
      const id = e.cardDefinitionId ?? c?.definitionId;
      if (id) seen.set(e.cardInstanceId, id);
    }
  }
  return [...new Set(seen.values())];
}

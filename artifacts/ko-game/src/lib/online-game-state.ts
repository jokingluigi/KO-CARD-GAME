import type { CardInstance } from "@/game";
import type { GameState, PlayerState } from "@/game";

type HiddenZone = {
  hidden: true;
  count: number;
};

type SanitizedPlayer = Omit<PlayerState, "hand" | "deck"> & {
  hand: PlayerState["hand"] | HiddenZone;
  deck: PlayerState["deck"] | HiddenZone;
};

type SanitizedState = Omit<GameState, "players"> & {
  players: SanitizedPlayer[];
};

function hiddenCard(ownerId: string, zone: "hand" | "deck", index: number): CardInstance {
  return {
    instanceId: `__hidden__:${ownerId}:${zone}:${index}`,
    definitionId: "__hidden__",
    cardType: "WRESTLER",
    currentCost: 0,
    baseCost: 0,
    currentAttack: 0,
    baseAttack: 0,
    currentHealth: 0,
    baseHealth: 0,
    maxHealth: 0,
    boardSlot: null,
    enteredThisTurn: false,
    attacksUsedThisTurn: 0,
    isGenerated: false,
    isToken: false,
    isChampionToken: false,
    entranceAudioAssetId: null,
    entranceAudioUrl: null,
    entranceAudioVolume: 0,
    entranceAudioEnabled: false,
    keywords: [],
    abilities: [],
    isSilenced: false,
    isAbilityDisabled: false,
    isSilenceImmune: false,
    dodgeAvailable: false,
    dodgeCharges: 0,
    isStunned: false,
    activeUsedThisTurn: false,
    isDirectDeployedChampion: false,
  };
}

function visibleOrHidden(
  value: PlayerState["hand"] | PlayerState["deck"] | HiddenZone,
  ownerId: string,
  zone: "hand" | "deck",
): PlayerState["hand"] {
  if (Array.isArray(value)) return value;
  return Array.from({ length: Math.max(0, value.count) }, (_, index) =>
    hiddenCard(ownerId, zone, index),
  );
}

/**
 * GameStatePreview intentionally assumes that players[0] is the viewer.
 * The server keeps its canonical player order, so reorder only this render
 * projection. Hidden zones become stable card-back placeholders; no private
 * card fields are invented or copied into the browser.
 */
export function projectOnlineGameState(
  value: unknown,
  viewerId: string,
): GameState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SanitizedState>;
  if (!Array.isArray(candidate.players) || candidate.players.length < 2) return null;

  const orderedPlayers = [...candidate.players].sort((left, right) =>
    left.id === viewerId ? -1 : right.id === viewerId ? 1 : 0,
  );
  if (orderedPlayers[0]?.id !== viewerId) return null;

  const players = orderedPlayers.map((player) => ({
    ...player,
    hand: visibleOrHidden(player.hand, player.id, "hand"),
    deck: visibleOrHidden(player.deck, player.id, "deck"),
  })) as [PlayerState, PlayerState, ...PlayerState[]];

  return {
    ...candidate,
    players,
  } as GameState;
}
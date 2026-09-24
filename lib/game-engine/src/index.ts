/**
 * Server-safe adapter for the existing KO rules engine.
 *
 * The implementation remains in the KO game source tree so the browser AI
 * match and Online Match cannot drift into separate rules engines. This
 * package deliberately exports only the DOM-free engine surface needed by the
 * API server.
 */
export {
  executeAction,
  getLegalActions,
} from "../../../artifacts/ko-game/src/game/actions/engine-actions";
export type {
  ActionErrorCode,
  ActionResult,
  GameAction,
} from "../../../artifacts/ko-game/src/game/actions/types";
export {
  createInitialGameState,
} from "../../../artifacts/ko-game/src/game/engine/create-initial-game-state";
export {
  validateCardDefinitionReferences,
} from "../../../artifacts/ko-game/src/game/engine/card-definition-validation";
export {
  normalizeHiddenZoneCards,
} from "../../../artifacts/ko-game/src/game/cards/zone-state";
export {
  startGame,
  endTurn,
} from "../../../artifacts/ko-game/src/game/engine/turn-system";
export { surrender } from "../../../artifacts/ko-game/src/game/engine/surrender";
export {
  createDeterministicRandom,
  type RandomSource,
} from "../../../artifacts/ko-game/src/game/random/random";
export type {
  Board,
  GameState,
  PendingCardEffect,
  PlayerState,
} from "../../../artifacts/ko-game/src/game/types/game-state";
export type {
  CardDefinition,
  CardInstance,
  CardRarity,
} from "../../../artifacts/ko-game/src/game/cards/types";
export {
  canonicalCardTags,
  hasCardTag,
  matchesCardTagFilter,
  sharesCardTag,
} from "../../../artifacts/ko-game/src/game/cards/tags";
export type { BoardSlot } from "../../../artifacts/ko-game/src/game/engine/board-position";
export type { AttackTarget } from "../../../artifacts/ko-game/src/game/engine/combat";
export {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../../../artifacts/ko-game/src/game/cards/published-cards";
export type {
  ChampionDefinition,
  ChampionState,
} from "../../../artifacts/ko-game/src/game/champions/types";
export {
  DECK_SIZE,
  MAX_LEGENDARY_CARDS,
  validateDeckCounts,
} from "./rules";
export {
  championRecordToDefinition,
  type PublishedChampionRecord,
} from "../../../artifacts/ko-game/src/game/champions/published-champions";
export type {
  GameEvent,
  GameEventType,
} from "../../../artifacts/ko-game/src/game/events/types";
export type { GameMediaCatalog } from "../../../artifacts/ko-game/src/game/media";
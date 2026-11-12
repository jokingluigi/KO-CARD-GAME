import type { CardDefinition, GameState } from "./index";
type Catalog = Pick<GameState, "cardPool" | "minionACardPool">;
type Patch = { upsert: CardDefinition[]; remove: string[]; order?: string[] };
export type CatalogWire = {
  base: number;
  revision: number;
  cardPool?: Patch;
  minionACardPool?: Patch;
};
const frozen = new WeakSet<object>();
function freeze(value: unknown): void {
  if (!value || typeof value !== "object" || frozen.has(value)) return;
  frozen.add(value);
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}
export function cloneBattleState(state: GameState): GameState {
  const { cardPool, minionACardPool, ...dynamic } = state;
  freeze(cardPool);
  freeze(minionACardPool);
  return {
    ...structuredClone(dynamic),
    ...(cardPool ? { cardPool } : {}),
    ...(minionACardPool ? { minionACardPool } : {}),
  };
}
function patch(
  before: CardDefinition[] | undefined,
  after: CardDefinition[] | undefined,
): Patch | undefined {
  if (before === after) return undefined;
  const previous = new Map((before ?? []).map((c) => [c.id, c]));
  const current = new Set((after ?? []).map((c) => c.id));
  const upsert = (after ?? []).filter((c) => {
    const old = previous.get(c.id);
    return !old || (old !== c && JSON.stringify(old) !== JSON.stringify(c));
  });
  const remove = [...previous.keys()].filter((id) => !current.has(id));
  const expected = [
      ...(before ?? []).filter((c) => current.has(c.id)).map((c) => c.id),
      ...upsert.filter((c) => !previous.has(c.id)).map((c) => c.id),
    ],
    order = (after ?? []).map((c) => c.id);
  const reordered = expected.some((id, index) => id !== order[index]);
  return upsert.length || remove.length || reordered
    ? { upsert, remove, ...(reordered ? { order } : {}) }
    : undefined;
}
export class CatalogEncoder {
  private catalog: Catalog = {};
  private revision = 0;
  private matchId: string | null = null;
  encode<T extends { type: string; matchId?: string; state?: unknown }>(
    message: T,
  ): T & { catalogWire?: CatalogWire } {
    if (
      !message.state ||
      ![
        "MATCH_SNAPSHOT",
        "RESYNC_REQUIRED",
        "ACTION_ACCEPTED",
        "MATCH_ENDED",
      ].includes(message.type)
    )
      return message;
    const state = message.state as GameState;
    const full =
      message.type === "MATCH_SNAPSHOT" ||
      message.type === "RESYNC_REQUIRED" ||
      this.matchId !== message.matchId ||
      !this.revision;
    const base = this.revision,
      cardPool = patch(this.catalog.cardPool, state.cardPool),
      minionACardPool = patch(
        this.catalog.minionACardPool,
        state.minionACardPool,
      );
    if (full || cardPool || minionACardPool) this.revision++;
    this.catalog = {
      cardPool: state.cardPool,
      minionACardPool: state.minionACardPool,
    };
    this.matchId = message.matchId ?? null;
    if (full)
      return { ...message, catalogWire: { base: 0, revision: this.revision } };
    const { cardPool: _cards, minionACardPool: _minion, ...dynamic } = state;
    return {
      ...message,
      state: dynamic,
      catalogWire: {
        base,
        revision: this.revision,
        ...(cardPool ? { cardPool } : {}),
        ...(minionACardPool ? { minionACardPool } : {}),
      },
    };
  }
}
export class CatalogDecoder {
  private catalog: Catalog = {};
  private revision = 0;
  private matchId: string | null = null;
  decode<
    T extends {
      type: string;
      matchId?: string;
      state?: unknown;
      catalogWire?: CatalogWire;
    },
  >(message: T): T | null {
    if (!message.catalogWire || !message.state) return message;
    const wire = message.catalogWire,
      state = message.state as GameState;
    if (wire.base === 0) {
      this.catalog = {
        cardPool: state.cardPool,
        minionACardPool: state.minionACardPool,
      };
      this.revision = wire.revision;
      this.matchId = message.matchId ?? null;
      return message;
    }
    if (this.matchId !== message.matchId || this.revision !== wire.base)
      return null;
    const apply = (old: CardDefinition[] | undefined, change?: Patch) => {
      if (!change) return old;
      const removed = new Set(change.remove),
        replaced = new Map(change.upsert.map((c) => [c.id, c]));
      const result = (old ?? [])
        .filter((c) => !removed.has(c.id))
        .map((c) => {
          const next = replaced.get(c.id);
          replaced.delete(c.id);
          return next ?? c;
        });
      const merged = [...result, ...replaced.values()];
      return change.order
        ? change.order
            .map((id) => merged.find((c) => c.id === id)!)
            .filter(Boolean)
        : merged;
    };
    this.catalog = {
      cardPool: apply(this.catalog.cardPool, wire.cardPool),
      minionACardPool: apply(
        this.catalog.minionACardPool,
        wire.minionACardPool,
      ),
    };
    this.revision = wire.revision;
    return { ...message, state: { ...state, ...this.catalog } };
  }
}

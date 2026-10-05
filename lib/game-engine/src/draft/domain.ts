import type { CardDefinition, ChampionDefinition } from "../index";
import { DECK_SIZE, MAX_LEGENDARY_CARDS, maxCardCopies } from "../rules";
export type DraftConfig = {
  mutationEnabled: boolean;
  specialPickEnabled: boolean;
  synergyPickEnabled: boolean;
  rerollCount: number;
  mutationInterval: number;
  grandMutationEnabled: boolean;
  grandMutationChance: number;
  excludedCardIds: string[];
  excludedChampionIds: string[];
  techniquePicks: number[];
  legendaryPicks: number[];
  costTargets: number[];
  championSeconds: number;
  pickSeconds: number;
  reviewSeconds: number;
  championTagWeight: number;
  deckTagWeight: number;
  supportWeight: number;
  cardScores: Record<string, number>;
  championTags: Record<string, string[]>;
};
export const DEFAULT_DRAFT_CONFIG: DraftConfig = {
  mutationEnabled: true,
  specialPickEnabled: true,
  synergyPickEnabled: true,
  rerollCount: 2,
  mutationInterval: 5,
  grandMutationEnabled: true,
  grandMutationChance: 0.1,
  excludedCardIds: [],
  excludedChampionIds: [],
  techniquePicks: [5, 10, 15, 20, 25],
  legendaryPicks: [8, 18],
  costTargets: [7, 10, 8],
  championSeconds: 45,
  pickSeconds: 25,
  reviewSeconds: 30,
  championTagWeight: 1.5,
  deckTagWeight: 1.5,
  supportWeight: 1.25,
  cardScores: {},
  championTags: {},
};
export type DraftSnapshot = {
  cards: CardDefinition[];
  champions: ChampionDefinition[];
  config: DraftConfig;
  media?: import("../index").GameMediaCatalog;
  interactions?: {
    championOneId: string;
    championTwoId: string;
    lineOne: string | null;
    lineTwo: string | null;
    firstSpeaker: string;
    status: string;
  }[];
};
export type SpecialPick =
  "EPIC" | "HIGH_COST" | "LOW_COST" | "SYNERGY" | "CHAOS";
export type DraftCardCopy = {
  instanceId: string;
  definitionId: string;
  mutation?: import("../../../../artifacts/ko-game/src/game/cards/draft-mutation").DraftMutation;
};
export type DraftSeat = {
  cards?: DraftCardCopy[];
  rerollsUsed?: number;
  lockedOfferId?: string | null;
  specialPick?: SpecialPick | null;
  grandMutationUsed?: boolean;
  mutationEvent?: {
    targetId: string | null;
    offers: string[];
    grand: boolean;
  } | null;
  userId: string | null;
  name: string;
  championId: string | null;
  deck: string[];
  offers: string[];
  deadline: number | null;
  ready: boolean;
  history: { id: string; automatic: boolean }[];
};
export type DraftState = {
  id: string;
  mode: "AI" | "PVP";
  phase: "WAITING" | "DRAFT" | "BATTLE" | "FINISHED" | "ABORTED";
  seed: string;
  seats: [DraftSeat, DraftSeat];
  requests: Record<string, string>;
  battle: import("../index").GameState | null;
  turnDeadline: number | null;
  gameplayStartsAt: number | null;
  lastSeen?: [number, number];
  forfeitedSeat?: number;
};
export function parseDraftConfig(value: unknown): DraftConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("드래프트 설정을 확인해 주세요.");
  const c = { ...DEFAULT_DRAFT_CONFIG, ...(value as Partial<DraftConfig>) };
  for (const key of ["excludedCardIds", "excludedChampionIds"] as const)
    if (!Array.isArray(c[key]) || !c[key].every((id) => typeof id === "string"))
      throw new Error("제외 목록을 확인해 주세요.");
  for (const key of ["techniquePicks", "legendaryPicks"] as const)
    if (
      !Array.isArray(c[key]) ||
      !c[key].every((n) => Number.isInteger(n) && n >= 1 && n <= DECK_SIZE) ||
      new Set(c[key]).size !== c[key].length
    )
      throw new Error("선택 순서는 1~25의 중복 없는 숫자여야 합니다.");
  if (
    !Array.isArray(c.costTargets) ||
    c.costTargets.length !== 3 ||
    !c.costTargets.every((n) => Number.isFinite(n) && n >= 0) ||
    c.costTargets.reduce((a, b) => a + b, 0) !== DECK_SIZE
  )
    throw new Error("비용 구간 목표의 합은 25여야 합니다.");
  for (const key of [
    "championSeconds",
    "pickSeconds",
    "reviewSeconds",
  ] as const)
    if (!Number.isInteger(c[key]) || c[key] < 5 || c[key] > 300)
      throw new Error("제한 시간은 5~300초입니다.");
  for (const key of [
    "championTagWeight",
    "deckTagWeight",
    "supportWeight",
  ] as const)
    if (!Number.isFinite(c[key]) || c[key] < 1 || c[key] > 3)
      throw new Error("가중치는 1~3입니다.");
  if (
    !c.cardScores ||
    Array.isArray(c.cardScores) ||
    typeof c.cardScores !== "object" ||
    !Object.values(c.cardScores).every(
      (n) => Number.isFinite(n) && Math.abs(n) <= 100,
    )
  )
    throw new Error("AI 카드 점수는 -100~100입니다.");
  if (
    !c.championTags ||
    Array.isArray(c.championTags) ||
    typeof c.championTags !== "object" ||
    !Object.values(c.championTags).every(
      (v) => Array.isArray(v) && v.every((t) => typeof t === "string"),
    )
  )
    throw new Error("챔피언 태그를 확인해 주세요.");
  for (const key of [
    "mutationEnabled",
    "specialPickEnabled",
    "synergyPickEnabled",
    "grandMutationEnabled",
  ] as const)
    if (typeof c[key] !== "boolean")
      throw new Error("드래프트 기능 설정을 확인해 주세요.");
  if (
    !Number.isInteger(c.rerollCount) ||
    c.rerollCount < 0 ||
    c.rerollCount > 10 ||
    !Number.isInteger(c.mutationInterval) ||
    c.mutationInterval < 1 ||
    c.mutationInterval > 25 ||
    !Number.isFinite(c.grandMutationChance) ||
    c.grandMutationChance < 0 ||
    c.grandMutationChance > 1
  )
    throw new Error("리롤/개조/대변이 설정을 확인해 주세요.");
  return structuredClone(c);
}
export function selectableCards(s: DraftSnapshot) {
  return s.cards.filter(
    (c) =>
      c.status === "PUBLISHED" &&
      !c.isToken &&
      !c.isChampionToken &&
      ["NORMAL", "EPIC", "LEGENDARY"].includes(c.rarity ?? "NORMAL") &&
      !s.config.excludedCardIds.includes(c.id),
  );
}
/** Wider published, playable catalog only: private drafts and invalid records stay hidden. */
export function chaosCards(s: DraftSnapshot) {
  return s.cards.filter(
    (c) =>
      c.status === "PUBLISHED" &&
      !s.config.excludedCardIds.includes(c.id) &&
      Number.isFinite(c.cost) &&
      c.cost >= 0 &&
      c.cost <= 6 &&
      Number.isFinite(c.attack) &&
      c.attack >= 0 &&
      Number.isFinite(c.health) &&
      (c.cardType === "TECHNIQUE" || c.health >= 1) &&
      Array.isArray(c.keywords) &&
      Array.isArray(c.abilities) &&
      !/training-dummy|admin-dummy/i.test(c.id),
  );
}
export function selectableChampions(s: DraftSnapshot) {
  return s.champions.filter(
    (c) =>
      c.status === "PUBLISHED" && !s.config.excludedChampionIds.includes(c.id),
  );
}
const count = (deck: string[], id: string) =>
  deck.filter((d) => d === id).length;
export function canComplete(s: DraftSnapshot, deck: string[]): boolean {
  const pool = selectableCards(s),
    map = new Map(
      [...pool, ...chaosCards(s).filter((c) => deck.includes(c.id))].map(
        (c) => [c.id, c],
      ),
    );
  if (
    deck.length > DECK_SIZE ||
    deck.some(
      (id) =>
        !map.has(id) || count(deck, id) > maxCardCopies(map.get(id)?.rarity),
    )
  )
    return false;
  const legendary = deck.filter(
    (id) => map.get(id)?.rarity === "LEGENDARY",
  ).length;
  if (legendary > MAX_LEGENDARY_CARDS) return false;
  let requiredLegends = 0;
  for (const type of ["TECHNIQUE", "WRESTLER"]) {
    const remaining = Array.from(
      { length: DECK_SIZE - deck.length },
      (_, i) => deck.length + i + 1,
    ).filter(
      (n) =>
        (s.config.techniquePicks.includes(n) ? "TECHNIQUE" : "WRESTLER") ===
        type,
    ).length;
    const eligible = pool.filter((c) => (c.cardType ?? "WRESTLER") === type);
    const capacity = eligible
      .filter((c) => c.rarity !== "LEGENDARY")
      .reduce(
        (n, c) => n + Math.max(0, maxCardCopies(c.rarity) - count(deck, c.id)),
        0,
      );
    const needed = Math.max(0, remaining - capacity);
    if (
      needed >
      eligible.filter((c) => c.rarity === "LEGENDARY" && !deck.includes(c.id))
        .length
    )
      return false;
    requiredLegends += needed;
  }
  return requiredLegends <= MAX_LEGENDARY_CARDS - legendary;
}
// Technique slots are preferred slots. A published pool without enough legal
// techniques still drafts 25 cards, using wrestlers in the remaining slots.
// Freeze the resolved schedule in the session, without rewriting admin settings.
export function prepareDraftSnapshot(s: DraftSnapshot): DraftSnapshot {
  const slots = [...s.config.techniquePicks].sort((a, b) => a - b);
  for (let n = slots.length; n >= 0; n--) {
    const candidate = {
      ...s,
      config: { ...s.config, techniquePicks: slots.slice(0, n) },
    };
    if (canComplete(candidate, [])) return candidate;
  }
  return s;
}
export function validateDraftPool(s: DraftSnapshot) {
  if (selectableChampions(s).length < 3)
    throw new Error("공개된 선택 가능 챔피언이 최소 3명 필요합니다.");
  for (const champion of selectableChampions(s))
    if (champion.championTokenDefinitionId) {
      const token = s.cards.find(
        (c) => c.id === champion.championTokenDefinitionId,
      );
      if (!token || token.status === "DISABLED" || !token.isChampionToken)
        throw new Error(`${champion.name}: 챔피언 토큰 참조를 확인해 주세요.`);
    }
  if (!canComplete(prepareDraftSnapshot(s), []))
    throw new Error(
      "중복/등급 제한과 카드 종류별 선택 횟수를 충족하는 25장 카드 풀이 필요합니다.",
    );
}
export function draftRandom(seed: string) {
  let x = 2166136261;
  for (const c of seed) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
export function cardDraftScore(
  s: DraftSnapshot,
  seat: DraftSeat,
  c: CardDefinition,
) {
  const tags = s.config.championTags[seat.championId ?? ""] ?? [];
  const map = new Map(s.cards.map((c) => [c.id, c]));
  const group = c.cost <= 2 ? 0 : c.cost <= 4 ? 1 : 2;
  const used = seat.deck.filter((id) => {
    const cost = map.get(id)?.cost ?? 0;
    return (cost <= 2 ? 0 : cost <= 4 ? 1 : 2) === group;
  }).length;
  const synergy = (c.tags ?? []).filter(
    (t) =>
      tags.includes(t) ||
      seat.deck.filter((id) => map.get(id)?.tags?.includes(t)).length >= 3,
  ).length;
  return (
    (s.config.cardScores[c.id] ?? 0) +
    c.attack +
    c.health * 0.7 -
    c.cost * 0.8 +
    synergy * 3 +
    (s.config.costTargets[group] - used) * 0.5
  );
}
export function specialDraftPick(
  s: DraftSnapshot,
  seat: DraftSeat,
  seed: string,
): SpecialPick | null {
  if (
    !seat.championId ||
    !s.config.specialPickEnabled ||
    (seat.deck.length + 1) % 5
  )
    return null;
  return (["EPIC", "HIGH_COST", "LOW_COST", "SYNERGY", "CHAOS"] as const)[
    Math.floor(draftRandom(seed)() * 5)
  ];
}
export function draftOffers(
  s: DraftSnapshot,
  seat: DraftSeat,
  seed: string,
): string[] {
  const random = draftRandom(seed);
  if (!seat.championId) {
    const pool = selectableChampions(s).map((c) => c.id),
      result: string[] = [];
    while (pool.length && result.length < 3)
      result.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return result;
  }
  const pick = seat.deck.length + 1;
  const type = s.config.techniquePicks.includes(pick)
    ? "TECHNIQUE"
    : "WRESTLER";
  let pool = (
    seat.specialPick === "CHAOS" ? chaosCards(s) : selectableCards(s)
  ).filter(
    (c) =>
      (c.cardType ?? "WRESTLER") === type &&
      canComplete(s, [...seat.deck, c.id]),
  );
  const legends = pool.filter((c) => c.rarity === "LEGENDARY");
  if (s.config.legendaryPicks.includes(pick) && legends.length >= 3)
    pool = legends;
  const map = new Map(s.cards.map((c) => [c.id, c]));
  const tags = seat.deck.flatMap((id) => map.get(id)?.tags ?? []);
  const championTags = s.config.championTags[seat.championId] ?? [];
  const weight = (c: CardDefinition) => {
    const group = c.cost <= 2 ? 0 : c.cost <= 4 ? 1 : 2;
    const used = seat.deck.filter((id) => {
      const n = map.get(id)?.cost ?? 0;
      return (n <= 2 ? 0 : n <= 4 ? 1 : 2) === group;
    }).length;
    const overlap = (c.tags ?? []).reduce(
      (n, t) => n + tags.filter((tag) => tag === t).length,
      0,
    );
    return (
      (1 +
        Math.min(6, overlap) * s.config.deckTagWeight +
        (c.tags?.some((t) => championTags.includes(t))
          ? (s.config.championTagWeight - 1) * 0.5
          : 0)) *
      Math.max(
        0.25,
        1 +
          (s.config.costTargets[group] - used) /
            Math.max(1, s.config.costTargets[group]),
      )
    );
  };
  const special = seat.specialPick;
  const result: string[] = [];
  if (seat.lockedOfferId && pool.some((c) => c.id === seat.lockedOfferId))
    result.push(seat.lockedOfferId);
  const take = (eligible: CardDefinition[], weighted: boolean) => {
    const available = eligible.filter((c) => !result.includes(c.id));
    if (!available.length) return false;
    let cursor =
        random() *
        available.reduce((n, c) => n + (weighted ? weight(c) : 1), 0),
      index = 0;
    while (
      index < available.length - 1 &&
      (cursor -= weighted ? weight(available[index]) : 1) > 0
    )
      index++;
    result.push(available[index].id);
    return true;
  };
  while (result.length < 3) {
    let preferred = pool;
    if (
      special === "EPIC" &&
      !result.some((id) => map.get(id)?.rarity === "EPIC")
    )
      preferred = pool.filter((c) => c.rarity === "EPIC");
    if (special === "HIGH_COST")
      preferred = pool.filter((c) => c.cost >= 4 && c.cost <= 6);
    if (special === "LOW_COST")
      preferred = pool.filter((c) => c.cost >= 1 && c.cost <= 2);
    // Chaos widens rarity/token eligibility while preserving slot type and copy caps.
    const weighted =
      special === "SYNERGY" ||
      (!special && s.config.synergyPickEnabled && result.length === 2);
    if (!take(preferred, weighted) && !take(pool, weighted)) break;
  }
  return result;
}
export function bestDraftPick(s: DraftSnapshot, seat: DraftSeat): string {
  if (!seat.championId) return seat.offers[0];
  return [...seat.offers].sort(
    (a, b) =>
      cardDraftScore(
        s,
        seat,
        s.cards.find((c) => c.id === b)!,
      ) -
      cardDraftScore(
        s,
        seat,
        s.cards.find((c) => c.id === a)!,
      ),
  )[0];
}

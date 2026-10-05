import type { CardDefinition, CardInstance, CardKeyword } from "./types";

/** Immutable per-copy Draft baseline; never written into a catalog definition. */
export type DraftMutation = {
  id: string;
  name: string;
  attack: number;
  health: number;
  cost: number;
  keywords: CardKeyword[];
  armor?: number;
  grand?: boolean;
};
const mutation = (
  id: string,
  name: string,
  attack = 0,
  health = 0,
  cost = 0,
  keywords: CardKeyword[] = [],
  grand = false,
): DraftMutation => ({
  id,
  name,
  attack,
  health,
  cost,
  keywords,
  ...(keywords.includes("ARMOR") ? { armor: 1 } : {}),
  ...(grand ? { grand } : {}),
});
export const DRAFT_MUTATIONS: readonly DraftMutation[] = [
  mutation("strength", "근력 강화", 1),
  mutation("body", "육체 강화", 0, 2),
  mutation("balance", "균형 강화", 1, 1),
  mutation("light", "경량화", -1, 0, -1),
  mutation("berserk", "광전사", 2, -1),
  mutation("heavy", "중장갑", -1, 2, 0, ["ARMOR"]),
  mutation("vampire", "흡혈종", 0, 0, 0, ["LIFESTEAL"]),
  mutation("regen", "재생체", 0, 0, 0, ["REGEN"]),
  mutation("armor", "철갑", 0, 0, 0, ["ARMOR"]),
  mutation("defense", "선봉대", 0, 0, 0, ["DEFENSE"]),
  mutation("unstable", "불완전한 개조", 2, 2, 1),
  mutation("glass", "유리대포", 3, -2),
  mutation("grand-vampire", "흡혈 강화체", 0, 0, -1, ["LIFESTEAL"], true),
  mutation("grand-fort", "요새화", 2, 2, 0, ["DEFENSE"], true),
  mutation("grand-combat", "전투 개조", 2, 0, 0, ["ARMOR"], true),
];
export function applicableDraftMutations(def: CardDefinition, grand = false) {
  if (def.cardType === "TECHNIQUE") return [];
  return DRAFT_MUTATIONS.filter(
    (m) =>
      Boolean(m.grand) === grand &&
      def.attack + m.attack >= 0 &&
      def.health + m.health >= 1 &&
      def.cost + m.cost <= 6 &&
      (!m.keywords.length ||
        m.attack !== 0 ||
        m.health !== 0 ||
        m.cost !== 0 ||
        m.keywords.some(
          (k) =>
            !def.keywords.includes(k) ||
            (k === "ARMOR" && Number(def.effectConfig?.armor ?? 0) < 1),
        )),
  );
}
export function draftBaseline(card: CardInstance, def?: CardDefinition) {
  const m = card.draftMutation;
  return {
    attack: Math.max(
      0,
      (card.draftCatalogBase?.attack ??
        def?.attack ??
        card.baseAttack ??
        card.currentAttack) + (m?.attack ?? 0),
    ),
    health: Math.max(
      1,
      (card.draftCatalogBase?.health ??
        def?.health ??
        card.baseHealth ??
        card.maxHealth) + (m?.health ?? 0),
    ),
    cost: Math.max(
      0,
      (card.draftCatalogBase?.cost ??
        def?.cost ??
        card.baseCost ??
        card.currentCost) + (m?.cost ?? 0),
    ),
    keywords: [
      ...new Set([
        ...(card.draftCatalogBase?.keywords ?? def?.keywords ?? card.keywords),
        ...(m?.keywords ?? []),
      ]),
    ],
    armor: Math.max(
      Number(
        card.draftCatalogBase?.armor ??
          def?.effectConfig?.armor ??
          card.armor ??
          0,
      ),
      m?.armor ?? 0,
    ),
  };
}
export function applyDraftMutation(
  card: CardInstance,
  m: DraftMutation,
): CardInstance {
  if (card.cardType === "TECHNIQUE")
    throw new Error("기술 카드는 개조할 수 없습니다.");
  const next: CardInstance = {
    ...card,
    draftMutation: structuredClone(m),
    draftCatalogBase: {
      cost: card.baseCost ?? card.currentCost,
      attack: card.baseAttack ?? card.currentAttack,
      health: card.baseHealth ?? card.maxHealth,
      keywords: [...card.keywords],
      armor: card.armor ?? 0,
    },
  };
  const b = draftBaseline(next);
  return {
    ...next,
    currentAttack: b.attack,
    currentHealth: b.health,
    maxHealth: b.health,
    currentCost: b.cost,
    keywords: b.keywords,
    armor: b.armor,
  };
}

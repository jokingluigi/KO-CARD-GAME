import type { CardAbility } from "../effects/types";
import type { CardDefinition } from "./types";

export type PublishedCardRecord = {
  id: string;
  name: string;
  cardType: "WRESTLER" | "TECHNIQUE";
  cost: number;
  attack: number;
  health: number;
  text: string;
  keywords: CardDefinition["keywords"];
  isToken: boolean;
  isChampionToken: boolean;
  effectId: string | null;
  effectConfig: Record<string, unknown>;
  status: "PUBLISHED" | "DRAFT";
  version: number;
  createdAt: string;
  updatedAt: string;
  imageAssetId: string | null;
  imageUrl: string | null;
  imageDisplayMode?: "COVER" | "CONTAIN" | "CUSTOM";
  imageScale?: number;
  imagePositionX?: number;
  imagePositionY?: number;
};

function amount(config: Record<string, unknown>): number {
  const value = config.amount;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function abilitiesFor(
  effectId: string | null,
  config: Record<string, unknown>,
): CardAbility[] {
  if (effectId === "STRUCTURED_EFFECTS_V1" && Array.isArray(config.effects)) {
    const byTrigger = new Map<string, Extract<CardAbility, { trigger: "ENTER_FIELD" | "LEAVE_FIELD" | "ACTIVE" }>["effects"]>();
    for (const raw of config.effects) {
      if (!raw || typeof raw !== "object") continue;
      const effect = raw as Record<string, unknown>;
      const trigger = effect.trigger;
      const action = effect.action;
      const target = effect.target;
      if (!["ENTER_FIELD", "LEAVE_FIELD", "ACTIVE"].includes(trigger as string) ||
           !["BUFF", "DAMAGE", "HEAL", "SILENCE", "DESTROY", "ADD_GOLD", "ADD_NEXT_TURN_GOLD", "DRAW", "REDUCE_COST", "INCREASE_COST", "STUN", "ADD_KEYWORD", "REMOVE_KEYWORD"].includes(action as string) ||
           (target !== undefined && (!target || typeof target !== "object"))) continue;
      const list = byTrigger.get(trigger as string) ?? [];
       list.push({ type: "STRUCTURED", action: action as Extract<typeof list[number], { type: "STRUCTURED" }>["action"], target: target as Extract<typeof list[number], { type: "STRUCTURED" }>["target"], values: effect.values as Extract<typeof list[number], { type: "STRUCTURED" }>["values"] });
      byTrigger.set(trigger as string, list);
    }
    return [...byTrigger.entries()].map(([trigger, effects]) =>
      trigger === "LEAVE_FIELD"
        ? { trigger: "LEAVE_FIELD" as const, reasons: ["RETIRE" as const], effects }
        : { trigger: trigger as "ENTER_FIELD" | "ACTIVE", effects },
    );
  }
  if (effectId === "ACTIVE_GAIN_GOLD") {
    return [{ trigger: "ACTIVE", effects: [{ type: "GAIN_GOLD", amount: amount(config) }] }];
  }
  if (effectId === "ENTER_FIELD_GAIN_GOLD") {
    return [{ trigger: "ENTER_FIELD", effects: [{ type: "GAIN_GOLD", amount: amount(config) }] }];
  }
  if (effectId === "ENTER_FIELD_DAMAGE_OPPONENT_CHAMPION") {
    return [{
      trigger: "ENTER_FIELD",
      effects: [{ type: "DAMAGE_OPPONENT_CHAMPION", amount: amount(config) }],
    }];
  }
  if (effectId === "LEAVE_FIELD_GAIN_GOLD") {
    return [{
      trigger: "LEAVE_FIELD",
      reasons: ["RETIRE"],
      effects: [{ type: "GAIN_GOLD", amount: amount(config) }],
    }];
  }
  if (effectId === "ACTIVE_MODIFY_SELF_ATTACK") {
    return [{ trigger: "ACTIVE", effects: [{ type: "MODIFY_SELF_ATTACK", amount: amount(config) }] }];
  }
  return [];
}

export async function fetchPublishedWrestlerCards(): Promise<CardDefinition[]> {
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const response = await fetch(`${apiBase}/cards`);
  if (!response.ok) return [];

  const body = (await response.json()) as { cards?: PublishedCardRecord[] };
  return (body.cards ?? [])
    .filter(
      (card) =>
        card.status === "PUBLISHED" &&
        card.cardType === "WRESTLER" &&
        !card.isToken &&
        !card.isChampionToken,
    )
    .map(cardRecordToDefinition);
}

export function cardRecordToDefinition(card: PublishedCardRecord): CardDefinition {
  return {
      id: card.id,
      name: card.name,
      cardType: card.cardType,
      cost: card.cost,
      attack: card.attack,
      health: card.health,
      rulesText: card.text,
      imageAssetId: card.imageAssetId,
      imageUrl: card.imageUrl,
       imageDisplayMode: card.imageDisplayMode,
       imageScale: card.imageScale,
       imagePositionX: card.imagePositionX,
       imagePositionY: card.imagePositionY,
      isToken: card.isToken,
      isChampionToken: card.isChampionToken,
      keywords: card.keywords,
      abilities: abilitiesFor(card.effectId, card.effectConfig),
      status: card.status,
      version: card.version,
      effectId: card.effectId,
      effectConfig: card.effectConfig,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
  };
}
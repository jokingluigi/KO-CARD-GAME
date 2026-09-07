import type { CardAbility } from "../effects/types";
import type { CardDefinition } from "./types";

type PublishedCardRecord = {
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
  status: "PUBLISHED";
  version: number;
  createdAt: string;
  updatedAt: string;
  imageAssetId: string | null;
  imageUrl: string | null;
};

function amount(config: Record<string, unknown>): number {
  const value = config.amount;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function abilitiesFor(
  effectId: string | null,
  config: Record<string, unknown>,
): CardAbility[] {
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
    .map((card) => ({
      id: card.id,
      name: card.name,
      cardType: card.cardType,
      cost: card.cost,
      attack: card.attack,
      health: card.health,
      rulesText: card.text,
      imageAssetId: card.imageAssetId,
      imageUrl: card.imageUrl,
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
    }));
}
import type { CardAbility, CardEffect } from "../effects/types";
import type { CardDefinition, CardRarity } from "./types";
import { ACTIONS, TRIGGERS, isEffectScript, type EffectScript } from "@workspace/effect-registry";

type StructuredCardEffect = Extract<CardEffect, { type: "STRUCTURED" }>;

export type PublishedCardRecord = {
  id: string;
  name: string;
  cardType: "WRESTLER" | "TECHNIQUE";
  rarity?: CardRarity;
  cost: number;
  attack: number;
  health: number;
  text: string;
  keywords: CardDefinition["keywords"];
  tags?: string[];
  isToken: boolean;
  isChampionToken: boolean;
  effectId: string | null;
  effectConfig: Record<string, unknown>;
  status: "PUBLISHED" | "DRAFT" | "DISABLED";
  version: number;
  createdAt: string;
  updatedAt: string;
  imageAssetId: string | null;
  imageUrl: string | null;
  imageDisplayMode?: "COVER" | "CONTAIN" | "CUSTOM";
  imageScale?: number;
  imagePositionX?: number;
  imagePositionY?: number;
  entranceAudioAssetId?: string | null;
  entranceAudioUrl?: string | null;
  entranceAudioVolume?: number;
  entranceAudioEnabled?: boolean;
};

function amount(config: Record<string, unknown>): number {
  const value = config.amount;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function abilitiesFor(
  effectId: string | null,
  config: Record<string, unknown>,
): CardAbility[] {
  if (effectId === "SCRIPT_V1" && Array.isArray(config.scripts)) {
    return config.scripts
      .filter((script): script is EffectScript => isEffectScript(script))
      .map((script) => ({
        trigger: script.trigger as Exclude<CardAbility["trigger"], "POSITION" | "LEAVE_FIELD">,
        effects: [{ type: "SCRIPT" as const, script }],
      }));
  }
  if (effectId === "STRUCTURED_EFFECTS_V1" && Array.isArray(config.effects)) {
    const byTrigger = new Map<string, CardEffect[]>();
    for (const raw of config.effects) {
      if (!raw || typeof raw !== "object") continue;
      const effect = raw as Record<string, unknown>;
      const trigger = effect.trigger;
      const action = effect.action;
      const target = effect.target;
       if (!TRIGGERS.includes(trigger as typeof TRIGGERS[number]) ||
            !ACTIONS.includes(action as typeof ACTIONS[number]) ||
           (target !== undefined && (!target || typeof target !== "object"))) continue;
      const list = byTrigger.get(trigger as string) ?? [];
       list.push({ type: "STRUCTURED", action: action as StructuredCardEffect["action"], target: target as StructuredCardEffect["target"], values: effect.values as StructuredCardEffect["values"] });
      byTrigger.set(trigger as string, list);
    }
     return [...byTrigger.entries()].map(([trigger, effects]) => {
       const rawConditions = (config.effects as Array<Record<string, unknown>>)
         .filter((item) => item.trigger === trigger)
         .flatMap((item) => Array.isArray(item.conditions) ? item.conditions : []);
        const condition = rawConditions.some((item) => (item as Record<string, unknown>).type === "SOURCE_IS_ONLY_WRESTLER")
          ? { type: "BOARD_COUNT" as const, compare: "EQ" as const, amount: 1 }
          : rawConditions.some((item) => (item as Record<string, unknown>).type === "FIRST_ATTACK_GAIN")
            ? { type: "FIRST_ATTACK_GAIN" as const }
            : undefined;
       return trigger === "LEAVE_FIELD"
         ? { trigger: "LEAVE_FIELD" as const, reasons: ["RETIRE" as const], effects, ...(condition ? { condition } : {}) }
         : { trigger: trigger as Exclude<CardAbility["trigger"], "LEAVE_FIELD" | "POSITION">, effects, ...(condition ? { condition } : {}) };
     });
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

async function fetchPublishedCardRecords(): Promise<PublishedCardRecord[]> {
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const response = await fetch(`${apiBase}/cards`);
  if (!response.ok) return [];

  const body = (await response.json()) as { cards?: PublishedCardRecord[] };
  return (body.cards ?? []).filter((card) => card.status === "PUBLISHED");
}

let publicTagCatalogPromise: Promise<CardDefinition[]> | null = null;
let publicTagCatalogFetchedAt = 0;
const PUBLIC_TAG_CATALOG_TTL_MS = 5 * 60 * 1000;

/**
 * Loads the public catalog for tag browsing. Unlike match setup's fail-closed
 * loader, this rejects on API errors so the UI can distinguish an unavailable
 * catalog from a tag with no matching cards.
 */
export function fetchPublicCardTagCatalog(): Promise<CardDefinition[]> {
  if (
    publicTagCatalogPromise &&
    (publicTagCatalogFetchedAt === 0 ||
      Date.now() - publicTagCatalogFetchedAt < PUBLIC_TAG_CATALOG_TTL_MS)
  ) {
    return publicTagCatalogPromise;
  }
  publicTagCatalogFetchedAt = 0;
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  publicTagCatalogPromise = fetch(`${apiBase}/cards`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`공개 카드 목록을 불러오지 못했습니다. (${response.status})`);
      }
      const body = await response.json() as { cards?: unknown };
      if (!Array.isArray(body.cards)) {
        throw new Error("공개 카드 목록 응답 형식이 올바르지 않습니다.");
      }
      return (body.cards as PublishedCardRecord[])
        .filter((card) => card?.status === "PUBLISHED")
        .map(cardRecordToDefinition);
    })
    .then((cards) => {
      publicTagCatalogFetchedAt = Date.now();
      return cards;
    })
    .catch((error: unknown) => {
      publicTagCatalogPromise = null;
      publicTagCatalogFetchedAt = 0;
      throw error;
    });
  return publicTagCatalogPromise;
}

export async function fetchPublishedWrestlerCards(): Promise<CardDefinition[]> {
  return (await fetchPublishedCardRecords())
    .filter((card) => card.cardType === "WRESTLER" && !card.isToken && !card.isChampionToken)
    .map(cardRecordToDefinition);
}

export async function fetchPublishedChampionTokenCards(): Promise<CardDefinition[]> {
  return (await fetchPublishedCardRecords())
    .filter((card) => card.isChampionToken)
    .map(cardRecordToDefinition);
}

/** All published definitions are kept in the match snapshot so explicit
 * structured references can resolve by stable ID, including cards outside a deck. */
export async function fetchPublishedCardDefinitions(): Promise<CardDefinition[]> {
  return (await fetchPublishedCardRecords()).map(cardRecordToDefinition);
}

/** Admin-only AI test pool: PUBLISHED plus DRAFT, never DISABLED. */
export async function fetchAiTestCardDefinitions(): Promise<CardDefinition[]> {
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const response = await fetch(`${apiBase}/admin/cards`, { credentials: "include" });
  if (!response.ok) throw new Error("AI 테스트 카드 풀을 불러오지 못했습니다.");
  const body = (await response.json()) as { cards?: PublishedCardRecord[] };
  return (body.cards ?? [])
    .filter((card) => card.status !== "DISABLED")
    .map(cardRecordToDefinition);
}

export function cardRecordToDefinition(card: PublishedCardRecord): CardDefinition {
  return {
      id: card.id,
      name: card.name,
      cardType: card.cardType,
       rarity: card.rarity,
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
       entranceAudioAssetId: card.entranceAudioAssetId,
       entranceAudioUrl: card.entranceAudioUrl,
       entranceAudioVolume: card.entranceAudioVolume,
       entranceAudioEnabled: card.entranceAudioEnabled,
      isToken: card.isToken,
      isChampionToken: card.isChampionToken,
      keywords: card.keywords,
       tags: Array.isArray(card.tags) ? [...card.tags] : [],
      abilities: abilitiesFor(card.effectId, card.effectConfig),
      status: card.status,
      version: card.version,
      effectId: card.effectId,
      effectConfig: card.effectConfig,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
  };
}

import { ZOMBIE_RULES } from '../engine/zombie-token';
import type { CardAbility, CardEffect } from "../effects/types";
import type { CardDefinition, CardRarity } from "./types";
import { ACTIONS, TRIGGERS, isEffectScript, type EffectScript } from "@workspace/effect-registry";
import { repairedLegacyCardAbilities } from './legacy-card-effect-repair';

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
  summonLine?: string | null;
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
          : rawConditions.some((item) => (item as Record<string, unknown>).type === "SOURCE_IN_HAND")
            ? { type: "SOURCE_IN_HAND" as const }
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
  if (card.isToken && card.name.trim() === '좀비') card = { ...card, cost: 1, attack: 1, health: 1, text: ZOMBIE_RULES, keywords: [], effectId: 'STRUCTURED_EFFECTS_V1', effectConfig: { effects: [] } };
  const zombieAbsorption = /필드에\s*있는\s*['‘]?좀비['’]?\s*중[^.!?]*가장\s*수치의\s*합/.test(card.text) &&
    /좀비['’]?가\s*없다면[^.!?]*2\s*\/\s*2/.test(card.text);
  // Older published snapshots stored only an entrance-time attack gain for a
  // card that says it absorbs every wrestler it personally removes. Upgrade
  // the stale configuration by its rule wording, independent of card identity.
  const causalRemoval = /(?:이\s*카드|자신)[^.!?]{0,80}?(?:리타이어|퇴장|파괴)[^.!?]{0,50}?(?:선수|대상)[^.!?]{0,50}?공격력[^.!?]{0,50}?(?:이\s*카드의|자신의)\s*공격력[^.!?]{0,30}?(?:더|추가|증가)/.test(card.text);
  const configuredEffects = Array.isArray(card.effectConfig.effects) ? card.effectConfig.effects as Array<Record<string, unknown>> : [];
  const needsRemovalListener = causalRemoval && card.effectId === 'STRUCTURED_EFFECTS_V1' &&
    !configuredEffects.some((effect) => effect.action === 'REGISTER_LISTENER' && (effect.values as { listener?: { trigger?: string } } | undefined)?.listener?.trigger === 'SOURCE_CAUSED_TARGET_REMOVAL');
  const listener = { trigger: 'ENTER_FIELD', action: 'REGISTER_LISTENER', values: {
    listener: { trigger: 'SOURCE_CAUSED_TARGET_REMOVAL', cardType: 'WRESTLER', effect: {
      action: 'ADD_AGGREGATED_ATTACK', target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
      values: { aggregateStats: { source: 'LAST_CAUSED_TARGET_REMOVALS', attack: 'CURRENT_ATTACK_SUM' } },
    } },
  } };
  const runtimeConfig = needsRemovalListener ? { ...card.effectConfig, effects: [
    listener,
    ...configuredEffects.filter((effect) => !(effect.action === 'ADD_AGGREGATED_ATTACK' &&
      (effect.values as { aggregateStats?: { source?: string } } | undefined)?.aggregateStats?.source === 'LAST_DESTROYED_TARGETS')),
  ] } : /덱[^.!?]{0,35}(?:맨\s*위[^.!?]{0,20})?파괴/.test(card.text) && configuredEffects.some((effect) => effect.action === 'MILL')
    ? { ...card.effectConfig, effects: configuredEffects.map((effect) => effect.action === 'MILL'
      ? { ...effect, values: { ...(effect.values as Record<string, unknown> | undefined), destroyInstead: true } }
      : effect) }
    : card.effectConfig;
  const originGroupSize = card.name === '디 오리진'
    ? Number(card.text.match(/선수(?:\s*카드)?\s*(\d+)\s*장당\s*1씩/u)?.[1] ?? 0) : 0;
  const originEffect = { trigger: 'ENTER_FIELD', action: 'BUFF',
    target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
    values: { attackReference: 'GRAVEYARD_WRESTLER_COUNT', healthReference: 'GRAVEYARD_WRESTLER_COUNT', referenceDivisor: originGroupSize } };
  const finalRuntimeConfig = originGroupSize > 0 && card.effectId === 'STRUCTURED_EFFECTS_V1'
    ? { ...runtimeConfig, effects: [
        ...((Array.isArray(runtimeConfig.effects) ? runtimeConfig.effects : []) as Array<Record<string, unknown>>)
          .filter((effect) => !(effect.trigger === 'ENTER_FIELD' && effect.action === 'BUFF' &&
            ['amountReference', 'attackReference', 'healthReference'].some((key) =>
              (effect.values as Record<string, unknown> | undefined)?.[key] === 'GRAVEYARD_WRESTLER_COUNT'))),
        originEffect,
      ] }
    : runtimeConfig;
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
       summonLine: card.summonLine ?? null,
      isToken: card.isToken,
      isChampionToken: card.isChampionToken,
      keywords: card.keywords,
       tags: Array.isArray(card.tags) ? [...card.tags] : [],
      abilities: (repairedLegacyCardAbilities(card) ?? (zombieAbsorption
        ? [{ trigger: 'ENTER_FIELD' as const, effects: [{ type: 'STRUCTURED' as const,
            action: 'COPY_BEST_STATS' as const,
            target: { zone: 'BOARD' as const, owner: 'SELF' as const, cardType: 'WRESTLER' as const,
              selection: 'ALL' as const, count: 4, filter: { definitionRef: { name: '좀비' }, excludeSource: true } },
            values: { definitionRef: { name: '좀비' }, attack: 2, health: 2 },
          }] }]
        : abilitiesFor(card.effectId, finalRuntimeConfig))).map((ability) =>
        // Older saved configs omitted the source-zone condition even when the
        // published rules explicitly say the card works from the hand.
        /(?:손패|손)에\s*(?:있을|있는)\s*때/.test(card.text) &&
        ability.trigger !== 'ENTER_FIELD' && ability.trigger !== 'ACTIVE' &&
        !('condition' in ability && ability.condition)
          ? { ...ability, condition: { type: 'SOURCE_IN_HAND' as const } }
          : ability),
      status: card.status,
      version: card.version,
      effectId: card.effectId,
      effectConfig: card.effectConfig,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
  };
}

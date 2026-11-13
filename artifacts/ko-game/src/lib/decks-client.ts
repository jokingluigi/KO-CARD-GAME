import { requestJson } from "./client-request";
import {readDeckList,type DeckReadOptions} from './deck-read';
export type DeckCard = {
  keywords?: import('../game/effects/types').CardKeyword[];
  effectConfig?: Record<string, unknown> | null;
  id: string;
  name: string;
  cardType: "WRESTLER" | "TECHNIQUE";
  cost: number;
  attack: number;
  health: number;
  text: string;
  lore?: string;
  tags?: string[];
  rarity: "NORMAL" | "EPIC" | "LEGENDARY" | "CHAMPION" | string;
  imageUrl: string | null;
  imageDisplayMode: "COVER" | "CONTAIN" | "CUSTOM" | string;
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
  isToken: boolean;
  isChampionToken: boolean;
  status: "DRAFT" | "PUBLISHED" | "DISABLED" | string;
  quantity?: number;
};

export type DeckChampion = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  imageDisplayMode: "COVER" | "CONTAIN" | "CUSTOM";
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
  maxHealth: number;
  abilityName: string;
  abilityCost: number;
  abilityText: string;
  hasQuest: boolean;
  questName: string | null;
  questText: string | null;
  questRewardText: string | null;
  upgradedAbilityName: string | null;
  upgradedAbilityText: string | null;
  status: "DRAFT" | "PUBLISHED" | "DISABLED" | string;
};

export type DeckValidationReason = {
  scope: "DECK" | "CARD";
  reasonCode: string;
  message: string;
  cardDefinitionIds?: string[];
  count?: number;
  limit?: number;
};

export type Deck = {
  id: string;
  name: string;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
  champion: DeckChampion | null;
  cards: DeckCard[];
  missingCardDefinitionIds: string[];
  isValid: boolean;
  invalidReasons: string[];
  validationReasons: DeckValidationReason[];
};

export type DeckOptions = {
  isTestAccount?: boolean;
  cards: DeckCard[];
  champions: DeckChampion[];
};

const decksApiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/decks`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(`${decksApiBase}${path}`, {...init, headers: {
    ...(init?.body ? {"Content-Type":"application/json"} : {}), ...init?.headers,
  }}, {label: init?.method ? '덱 변경' : '덱 정보 확인'});
}

export function fetchDeckOptions(): Promise<DeckOptions> {
  return request<DeckOptions>("/options");
}

export function fetchDecks(options?:DeckReadOptions):Promise<Deck[]> {
  return readDeckList(decksApiBase,options);
}
export function fetchSelectedDecks(options?:DeckReadOptions):Promise<Deck[]> {
  return readDeckList(decksApiBase+'/selected',options);
}

export function saveDeck(payload: {
  id?: string;
  name: string;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
}): Promise<{ deck: Deck | null }> {
  const { id, ...body } = payload;
  return request<{ deck: Deck | null }>(id ? `/${encodeURIComponent(id)}` : "", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export function selectDeck(id: string, options?:{signal?:AbortSignal}): Promise<{ deck: Deck | null }> {
  return request<{ deck: Deck | null }>(`/${encodeURIComponent(id)}/select`, {
    signal:options?.signal,
    method: "POST",
  });
}

export function deleteDeck(id: string): Promise<void> {
  return request<void>(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type DeckCard = {
  id: string;
  name: string;
  cardType: "WRESTLER" | "TECHNIQUE";
  cost: number;
  attack: number;
  health: number;
  text: string;
  tags?: string[];
  rarity: "NORMAL" | "LEGENDARY" | "CHAMPION" | string;
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

async function readMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${decksApiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await readMessage(response, "덱 요청을 처리하지 못했습니다."));
  }
  return (await response.json()) as T;
}

export function fetchDeckOptions(): Promise<DeckOptions> {
  return request<DeckOptions>("/options");
}

export async function fetchDecks(): Promise<Deck[]> {
  const body = await request<{ decks: Deck[] }>("");
  return body.decks;
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

export function selectDeck(id: string): Promise<{ deck: Deck | null }> {
  return request<{ deck: Deck | null }>(`/${encodeURIComponent(id)}/select`, {
    method: "POST",
  });
}

export function deleteDeck(id: string): Promise<void> {
  return request<void>(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}
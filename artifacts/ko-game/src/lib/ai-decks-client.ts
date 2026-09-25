export type AIDeckCard = {
  id: string;
  name: string;
  cardType: "WRESTLER" | "TECHNIQUE" | string;
  cost: number;
  attack: number;
  health: number;
  text: string;
  rarity: string;
  keywords: string[];
  isToken: boolean;
  isChampionToken: boolean;
  status: string;
  imageUrl: string | null;
};

export type AIDeckChampion = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  maxHealth: number;
  status: string;
};

export type AIDeck = {
  id: string;
  name: string;
  description: string;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
  enabled: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  champion: AIDeckChampion | null;
  cards: AIDeckCard[];
  isValid: boolean;
  invalidReasons: string[];
  missingCardDefinitionIds: string[];
  requiredCardDefinitionIds: string[];
};

export type AIDeckOptions = {
  cards: AIDeckCard[];
  champions: AIDeckChampion[];
  minCardCount: number;
  maxCardCount: number;
};

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = "AI 덱 요청을 처리하지 못했습니다.";
    try {
      const body = await response.json() as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Keep the fallback message.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function fetchAIDecks(testDeckId?: string | null): Promise<{
  decks: AIDeck[];
  extraCards: Array<Parameters<typeof import("@/game/cards/published-cards").cardRecordToDefinition>[0]>;
  extraChampions: Array<Parameters<typeof import("@/game/champions/published-champions").championRecordToDefinition>[0]>;
}> {
  const query = testDeckId ? `?testDeckId=${encodeURIComponent(testDeckId)}` : "";
  return request(`/ai-decks${query}`);
}

export function fetchAdminAIDecks(): Promise<{ decks: AIDeck[] }> {
  return request("/admin/ai-decks");
}

export function fetchAdminAIDeckOptions(): Promise<AIDeckOptions> {
  return request("/admin/ai-decks/options");
}

export function saveAdminAIDeck(payload: {
  id?: string;
  name: string;
  description: string;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
  enabled: boolean;
  displayOrder: number;
}): Promise<{ deck: AIDeck }> {
  const { id, ...body } = payload;
  return request(id ? `/admin/ai-decks/${encodeURIComponent(id)}` : "/admin/ai-decks", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export function duplicateAdminAIDeck(id: string): Promise<{ deck: AIDeck }> {
  return request(`/admin/ai-decks/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
}

export function setAdminAIDeckEnabled(id: string, enabled: boolean): Promise<{ deck: AIDeck }> {
  return request(`/admin/ai-decks/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export function deleteAdminAIDeck(id: string): Promise<void> {
  return request(`/admin/ai-decks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function testAdminAIDeck(id: string): Promise<{ deck: AIDeck }> {
  return request(`/admin/ai-decks/${encodeURIComponent(id)}/test`, { method: "POST" });
}

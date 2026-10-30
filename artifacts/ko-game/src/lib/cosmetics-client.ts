import {
  emptyCosmetics,
  type CosmeticItem,
  type CosmeticLoadout,
} from "@workspace/cosmetics";
export type CosmeticCardPreview = {
  cardType?: "WRESTLER" | "TECHNIQUE";
  id: string;
  name: string;
  cost: number;
  attack: number;
  health: number;
  text: string;
  imageUrl: string | null;
  rarity: "NORMAL" | "EPIC" | "LEGENDARY" | "CHAMPION" | "TOKEN";
};
export type CosmeticChampionPreview = {
  championTokenDefinitionId?: string | null;
  id: string;
  name: string;
  imageUrl: string | null;
};
export type CosmeticInventory = {
  owned: Array<{ item: CosmeticItem; acquiredAt: string }>;
  loadout: CosmeticLoadout;
  cards?: CosmeticCardPreview[];
  champions?: CosmeticChampionPreview[];
};
export class CosmeticsTimeoutError extends Error {
  constructor(label: string) {
    super(
      `${label} 응답 확인이 늦어지고 있어요. 입력 내용은 유지됩니다. 잠시 후 다시 확인해 주세요.`,
    );
    this.name = "CosmeticsTimeoutError";
  }
}
export async function cosmeticsRequest<T>(
  path: string,
  init?: RequestInit,
  options: { timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(init?.signal?.reason);
  if (init?.signal?.aborted) abort();
  else init?.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 8000);
  try {
    const response = await fetch(
      `${(import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "")}/api${path}`,
      {
        ...init,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...init?.headers },
        signal: controller.signal,
      },
    );
    const body = await response.json().catch((error) => {
      if (controller.signal.aborted) throw error;
      return {};
    });
    if (!response.ok)
      throw new Error(body.message ?? "꾸미기 요청을 처리하지 못했습니다.");
    return body;
  } catch (error) {
    if (timedOut)
      throw new CosmeticsTimeoutError(options.label ?? "꾸미기 요청");
    throw error;
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", abort);
  }
}
export const fetchCosmetics = () =>
  cosmeticsRequest<CosmeticInventory>("/cosmetics");
export async function optionalCosmetics() {
  try {
    return (await fetchCosmetics()).loadout;
  } catch {
    return emptyCosmetics();
  }
}
export async function equipCosmetic(slot: string, cosmeticId: string | null) {
  return (
    await cosmeticsRequest<{ loadout: CosmeticLoadout }>(
      "/cosmetics/equipment",
      { method: "PUT", body: JSON.stringify({ slot, cosmeticId }) },
    )
  ).loadout;
}

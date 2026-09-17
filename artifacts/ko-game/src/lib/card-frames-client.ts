import { useEffect, useState } from "react";
import { normalizeCardRarity, type CardRarity } from "../game/cards/types";

export type CardFrameCardType = "WRESTLER" | "TECHNIQUE";

export type CardFrameDefinition = {
  cardType: CardFrameCardType;
  rarity: CardRarity;
  frameUrl: string | null;
  enabled: boolean;
  frameScale: number;
  frameOffsetX: number;
  frameOffsetY: number;
  updatedAt?: string;
};

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const listeners = new Set<() => void>();
let snapshot: CardFrameDefinition[] = [];
let loading: Promise<void> | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

async function loadCardFrames() {
  try {
    const response = await fetch(`${apiBase}/card-frames`, { credentials: "include" });
    if (!response.ok) return;
    const body = await response.json() as { frames?: CardFrameDefinition[] };
    snapshot = (body.frames ?? []).filter((frame) =>
      (frame.cardType === "WRESTLER" || frame.cardType === "TECHNIQUE") &&
       (frame.rarity === "NORMAL" || frame.rarity === "LEGENDARY" || frame.rarity === "CHAMPION" || frame.rarity === "TOKEN") &&
      frame.enabled,
    );
    notify();
  } catch {
    // The bundled frame is the intentional offline and server-error fallback.
  } finally {
    loading = null;
  }
}

function ensureLoaded() {
  if (!loading) {
    loading = loadCardFrames();
  }
  return loading;
}

export function refreshCardFrames() {
  loading = null;
  return ensureLoaded();
}

export function useCardFrameDefinition(
  cardType: CardFrameCardType | undefined,
  rarity: CardRarity | null | undefined,
) {
  const [, rerender] = useState(0);
  const normalizedType = cardType ?? "WRESTLER";
  const normalizedRarity = normalizeCardRarity(rarity);

  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    listeners.add(listener);
    void ensureLoaded();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return snapshot.find((frame) =>
    frame.cardType === normalizedType && frame.rarity === normalizedRarity,
  ) ?? null;
}
import type { CosmeticLoadout, ImageEmoteEvent } from "@workspace/cosmetics";
/** An ephemeral presentation channel. No combat state, RNG, turn counter or database writes. */
export class CosmeticEmoteChannel {
  private windows = new Map<
    string,
    { lastAt: number; requests: Set<string> }
  >();
  private images = new Map<string, ImageEmoteEvent>();
  maySend(userId: string, requestId: string, now = Date.now()) {
    const window = this.windows.get(userId);
    return (
      !window || (!window.requests.has(requestId) && now - window.lastAt >= 800)
    );
  }
  send(
    input: {
      matchId: string;
      userId: string;
      playerId: string;
      requestId: string;
      slot: number;
      loadout?: Pick<CosmeticLoadout, "emotes">;
    },
    now = Date.now(),
  ): ImageEmoteEvent | null {
    if (!Number.isInteger(input.slot) || input.slot < 1 || input.slot > 4)
      return null;
    const item = input.loadout?.emotes?.[input.slot - 1];
    if (!item || item.type !== "IMAGE_EMOTE" || !item.imageAssets?.art)
      return null;
    let window = this.windows.get(input.userId);
    if (!window) {
      window = { lastAt: -Infinity, requests: new Set() };
      this.windows.set(input.userId, window);
    }
    if (window.requests.has(input.requestId) || now - window.lastAt < 800)
      return null;
    window.lastAt = now;
    window.requests.add(input.requestId);
    if (window.requests.size > 128)
      window.requests.delete(window.requests.values().next().value!);
    const event: ImageEmoteEvent = {
      type: "IMAGE_EMOTE",
      matchId: input.matchId,
      playerId: input.playerId,
      requestId: input.requestId,
      itemId: item.id,
      imageUrl: item.imageAssets.art,
      name: item.name,
      expiresAt: now + 2000,
    };
    this.images.set(input.playerId, event);
    return event;
  }
  latest(now = Date.now()) {
    return [...this.images.values()].filter((event) => event.expiresAt > now);
  }
}

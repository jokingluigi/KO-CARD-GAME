import type { CosmeticLoadout, CosmeticItem, ImageEmoteEvent } from "@workspace/cosmetics";
/** An ephemeral presentation channel. No combat state, RNG, turn counter or database writes. */
export class CosmeticEmoteChannel {
  private windows = new Map<
    string,
    { lastAt: number; requests: Set<string> }
  >();
  private resolving=new Set<string>();
  private lookupAt=new Map<string,number>();
  async resolveAndSend(input:{matchId:string;userId:string;playerId:string;requestId:string},lookup:()=>Promise<CosmeticItem|null>){
    const now=Date.now();
    if(this.resolving.has(input.userId)||!this.maySend(input.userId,input.requestId,now)||now-(this.lookupAt.get(input.userId)??-Infinity)<800)return null;
    this.resolving.add(input.userId);this.lookupAt.set(input.userId,now);
    try{const item=await lookup();return item?this.send({...input,item}):null;}finally{this.resolving.delete(input.userId);}
  }
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
      slot?: number;
      item?: CosmeticItem;
      loadout?: Pick<CosmeticLoadout, "emotes">;
    },
    now = Date.now(),
  ): ImageEmoteEvent | null {
    if (!input.item && (!Number.isInteger(input.slot) || Number(input.slot) < 1 || Number(input.slot) > 4)) return null;
    const item = input.item ?? input.loadout?.emotes?.[Number(input.slot) - 1];
    if (!item || item.isActive===false || item.type !== "IMAGE_EMOTE" || !item.imageAssets?.art)
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

import {and,eq} from 'drizzle-orm';
import {db,cosmeticItemsTable,userCosmeticsTable} from '@workspace/db';
import {validImageUrl,type CosmeticItem} from '@workspace/cosmetics';
import {ensureDefaultEmotes} from './default-emotes';
/** Equipment is not an entitlement. Always verify current ownership and publication. */
export async function ownedImageEmote(userId:string,itemId:string):Promise<CosmeticItem|null>{
 await ensureDefaultEmotes(userId);
 const [row]=await db.select({item:cosmeticItemsTable}).from(userCosmeticsTable).innerJoin(cosmeticItemsTable,eq(cosmeticItemsTable.id,userCosmeticsTable.cosmeticId)).where(and(eq(userCosmeticsTable.userId,userId),eq(cosmeticItemsTable.id,itemId),eq(cosmeticItemsTable.type,'IMAGE_EMOTE'),eq(cosmeticItemsTable.isActive,true))).limit(1);
 return row&&validImageUrl(row.item.imageAssets?.art)?row.item as CosmeticItem:null;
}

import {and,eq,inArray} from 'drizzle-orm';
import {db,cosmeticItemsTable} from '@workspace/db';
export function packEmotePool(ids?:string[],executor:Pick<typeof db,'select'>=db){
 if(ids&&!ids.length)return Promise.resolve([]);
 return executor.select().from(cosmeticItemsTable).where(and(eq(cosmeticItemsTable.type,'IMAGE_EMOTE'),eq(cosmeticItemsTable.isActive,true),ids?inArray(cosmeticItemsTable.id,ids):undefined));
}

export type PackRates={normalRate:number;epicRate:number;legendaryRate:number;championRate:number;skinChance:number;emoteRate?:number};
export const PACK_CATEGORIES=[['NORMAL_CARD','normalRate'],['EPIC_CARD','epicRate'],['LEGENDARY_CARD','legendaryRate'],['CHAMPION_UNLOCK','championRate'],['SKIN','skinChance'],['IMAGE_EMOTE','emoteRate']] as const;
export function packRateTotal(pack:PackRates){return PACK_CATEGORIES.reduce((n,[,key])=>n+(pack[key]??0),0);}
export function validPackRates(pack:PackRates){return PACK_CATEGORIES.every(([,key])=>Number.isInteger(pack[key]??0)&&(pack[key]??0)>=0&&(pack[key]??0)<=100)&&packRateTotal(pack)===100;}
/** One mutually exclusive result per slot, including skins and emotes. */
export function packCategory(pack:PackRates,roll:number){
 if(!validPackRates(pack))throw new Error('일반·에픽·레전더리·챔피언·스킨·이모티콘 확률 합계는 100%여야 합니다.');
 if(!Number.isInteger(roll)||roll<0||roll>=100)throw new Error('Invalid pack roll');
 let cumulative=0;for(const [category,key]of PACK_CATEGORIES){cumulative+=pack[key]??0;if(roll<cumulative)return category;}
 throw new Error('Invalid pack rates');
}

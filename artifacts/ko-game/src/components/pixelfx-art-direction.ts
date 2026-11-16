import type atlas from './pixelfx-ko-atlas.json';
export type KoEffectId=keyof typeof atlas.effects;
/** Shared visual language. Events choose meaning; the library catalogue does not choose style. */
const families:Record<string,number[]>={
 impact:[4,9,10],critical:[6,68,72],slash:[5,7],rush:[3,12,43,128,129],
 guard:[13,15,16,70,135],heal:[22,45,48,49,50,52],
 shatter:[14,31],summon:[25,26,27,28,29,69,85,99,101,102,103],
 retire:[30,37,79,90,113,126],vanish:[11,32,33,34,118],
 buff:[17,21,24,53,57,58,59,64,67,105,125,130,136,137],
 debuff:[18,19,20,23,54,131,140],
 draw:[35,36,38,66,75,86,97,109,114,116,122,124,139],
 gold:[55,56,87,91,92,95,96],
 seal:[63,65,74,76,93,94,98,106,108,110,112],
 spell:[1,2,8,41,46,47,61,62,100,111,115,119,133,134],
 shadow:[44,51,71,121],ember:[42],transform:[39,40,80,88,123,132,138],
 reward:[78,81,82,83,84,89,104,107,117],warning:[60,77,120],
};
const byArea=new Map<number,KoEffectId>();
for(const [family,areas]of Object.entries(families))for(const area of areas)byArea.set(area,`ko/${family}` as KoEffectId);
export function koEffectForArea(area:number):KoEffectId{return byArea.get(area)??'ko/spell';}
export function resolveKoEffect(requested?:string,area?:number):KoEffectId{
 if(requested?.startsWith('ko/'))return requested as KoEffectId;
 // Champion signatures keep their semantic family, with the same authored material and contrast.
 if(area!==62&&area!==68&&area!==undefined)return koEffectForArea(area);
 if(!requested)return area===68?'ko/critical':'ko/spell';
 if(/heal|blessing|bloom|resurrection/.test(requested))return 'ko/heal';
 if(/shield|field|block|parry/.test(requested))return 'ko/guard';
 if(/shadow|necro|void|dark|eclipse|implosion/.test(requested))return 'ko/shadow';
 if(/fire|flame|spore/.test(requested))return 'ko/ember';
 if(/slash|claw|whip|sword/.test(requested))return 'ko/slash';
 if(/crit|slam|blunt|hit|bullet/.test(requested))return 'ko/critical';
 if(/summon|spawn|portal|pillar/.test(requested))return 'ko/summon';
 if(/coin|gold/.test(requested))return 'ko/gold';
 if(/spark|lightning|dash/.test(requested))return 'ko/rush';
 if(/holo|scan|glitch|warp/.test(requested))return 'ko/transform';
 if(/star|loot|collect|sunburst|achievement/.test(requested))return 'ko/reward';
 return 'ko/spell';
}

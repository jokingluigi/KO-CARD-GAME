/** Visual impact policy. No battle rules or state imports. */
export type ImpactTier = 'NONE' | 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'MASSIVE' | 'FINISHER';
export type ShakeMode = 'FULL' | 'REDUCED' | 'OFF';
export type ImpactRarity = 'NORMAL' | 'EPIC' | 'LEGENDARY' | 'CHAMPION';
export type ImpactProfile = {tier:ImpactTier;amplitude:number;duration:number;rotation:number;aftershock:boolean;wave:number;bass:'heavy'|'massive'|'champion'|null;rarity:ImpactRarity};
export type ScreenImpact = {id:string;profile:ImpactProfile;x:number;y:number;direction?:{x:number;y:number};radial?:boolean;nearby?:boolean};
export const IMPACT_TIERS:ImpactTier[]=['NONE','LIGHT','MEDIUM','HEAVY','MASSIVE','FINISHER'];
export const SHAKE_STORAGE_KEY='ko-match-screen-shake';
export function parseShakeMode(value:string|null):ShakeMode{return value==='OFF'||value==='REDUCED'?value:'FULL';}
export function impactRank(p:ImpactProfile){return IMPACT_TIERS.indexOf(p.tier);}
export function summonImpact(cost:number,rarity:string='NORMAL'):ImpactProfile {
 const c=Math.max(1,Math.min(6,Math.round(Number.isFinite(cost)?cost:1)));
 const r:ImpactRarity=rarity==='CHAMPION'||rarity==='LEGENDARY'||rarity==='EPIC'?rarity:'NORMAL';
 const multiplier=r==='CHAMPION'?1.75:r==='LEGENDARY'?1.5:r==='EPIC'?1.2:1;
 const high=r==='CHAMPION'||r==='LEGENDARY';
 const tier=high?'MASSIVE':c===6?'MASSIVE':c===5?'HEAVY':c>=3?'MEDIUM':'LIGHT';
 const amplitude=Math.min(22,Math.max([2.7,3.8,5.2,6.8,9,13][c-1]!,r==='CHAMPION'?11:r==='LEGENDARY'?10:0)*multiplier);
 return {tier,amplitude,duration:Math.max([100,110,150,180,220,280][c-1]!,r==='CHAMPION'?330:r==='LEGENDARY'?300:0),rotation:high?.5:c>=5?.3:0,aftershock:tier==='MASSIVE',wave:Math.min(8,[1.5,1.8,2.4,3,4.3,5.8][c-1]!*multiplier),bass:r==='CHAMPION'?'champion':tier==='MASSIVE'?'massive':tier==='HEAVY'?'heavy':null,rarity:r};
}
export function damageImpact(damage:number,lethal=false):ImpactProfile {
 const tier:ImpactTier=damage<=0?'NONE':lethal?'FINISHER':damage>=10?'MASSIVE':damage>=6?'HEAVY':damage>=3?'MEDIUM':'LIGHT';
 const i=IMPACT_TIERS.indexOf(tier);
 return {tier,amplitude:[0,3,5.5,9.5,14,20][i]!,duration:[0,100,150,220,290,360][i]!,rotation:[0,0,0,.3,.5,.7][i]!,aftershock:i>=4,wave:[0,1.5,2,3.5,5,6][i]!,bass:null,rarity:'NORMAL'};
}
export function specialImpact(kind:'AWAKENING'|'BOSS'|'HIDDEN_BOSS'):ImpactProfile {
 return {...damageImpact(kind==='AWAKENING'?10:18,kind!=='AWAKENING'),rarity:'CHAMPION',amplitude:kind==='AWAKENING'?15:20};
}
export function effectiveImpact(profile:ImpactProfile,viewport:{width:number;height:number},mode:ShakeMode,reducedMotion=false){
 const mobile=Math.max(.76,Math.min(1,Math.min(viewport.width,viewport.height)/760));
 const multiplier=reducedMotion||mode==='OFF'?0:mode==='REDUCED'?.5:1;
 return {...profile,amplitude:Math.min(22,profile.amplitude)*mobile*multiplier,rotation:Math.min(.7,profile.rotation)*multiplier};
}
export function impactFrames(profile:ImpactProfile,direction={x:0,y:1},radial=false):Keyframe[] {
 const length=Math.hypot(direction.x,direction.y)||1,dx=direction.x/length,dy=direction.y/length,a=profile.amplitude,r=profile.rotation;
 const pose=(t:number,lateral:number,angle:number,scale=1)=>({translate:`${((dx*t-dy*lateral)*a).toFixed(3)}px ${((dy*t+dx*lateral)*a).toFixed(3)}px`,rotate:`${(r*angle).toFixed(3)}deg`,scale:String(scale)});
 const large=impactRank(profile)>=4;
 return [{offset:0,...pose(0,0,0)},{offset:.07,...pose(1,0,.5,radial?1.012:large?.995:1)},{offset:.18,...pose(-.62,.08,-1,large?1.003:1)},{offset:.29,...pose(.28,-.3,.65)},{offset:.4,...pose(large?.34:-.15,large?.07:.14,-.45,large?1.002:1)},{offset:.56,...pose(-.16,-.09,.25)},{offset:.75,...pose(.06,.04,-.08)},{offset:1,...pose(0,0,0)}];
}
export function summonTimeline(cost:number,rarity:string,reduced=false){
 const c=Math.max(1,Math.min(6,Math.round(Number.isFinite(cost)?cost:1)));
 const p=summonImpact(c,rarity),duration=reduced?180:rarity==='LEGENDARY'?940:rarity==='CHAMPION'?820:[260,280,320,350,420,480][c-1]!;
 const landing=reduced?70:Math.round(duration*(c>=5||rarity==='LEGENDARY'||rarity==='CHAMPION'?.68:.72));
 return {duration,landing,end:reduced?duration:Math.max(duration,landing+p.duration+30)};
}
export function summonFrames(source:{left:number;top:number},target:{left:number;top:number},scale:number,profile:ImpactProfile,landing:number,duration:number,reduced=false):Keyframe[]{
 const position=(x:number,y:number,size:number,angle=0)=>`translate3d(${x}px,${y}px,0) scale(${size}) rotate(${angle}deg)`;
 if(reduced)return [{opacity:0,transform:position(target.left,target.top,scale)},{opacity:1,transform:position(target.left,target.top,scale)}];
 const heavy=impactRank(profile)>=3,front=heavy?1.18:1.07,t=landing/duration;
 return [{offset:0,opacity:1,transform:position(source.left,source.top,1)},{offset:.14,transform:position(source.left,source.top-12,1.08,-2)},{offset:t-.16,transform:position(target.left,target.top-(heavy?48:22),scale*front),easing:'cubic-bezier(.75,0,1,.7)'},{offset:t,transform:position(target.left,target.top,scale*(heavy?.96:.99))},{offset:t+.11,transform:position(target.left,target.top-2,scale*1.03),easing:'cubic-bezier(.16,1,.3,1)'},{offset:1,transform:position(target.left,target.top,scale)}];
}

/** Read existing effect metadata conservatively; never execute or change spell effects. */
export function hasBoardWideImpact(value:unknown,depth=0):boolean {
 if(depth>8||!value||typeof value!=='object')return false;
 if(Array.isArray(value))return value.some(v=>hasBoardWideImpact(v,depth+1));
 const effect=value as Record<string,unknown>,target=effect.target as Record<string,unknown>|undefined;
 if(['DAMAGE','DESTROY','RETIRE'].includes(String(effect.action))&&target?.zone==='BOARD'&&(target.selection==='ALL'||Number(target.count)>=3))return true;
 return ['effects','abilities','script','steps','then','else','leftEffects','rightEffects','values'].some(k=>hasBoardWideImpact(effect[k],depth+1));
}

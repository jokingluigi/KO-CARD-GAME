import {finisherDamage} from './finisher-scale';
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
 // A lethal blow is one tier up from its damage; only a 10+ lethal blow is a full finisher.
 const scaled=finisherDamage(damage,lethal),amount=scaled.damage;lethal=scaled.top;
 const tier:ImpactTier=amount<=0?'NONE':lethal?'FINISHER':amount>=10?'MASSIVE':amount>=5?'HEAVY':amount>=3?'MEDIUM':'LIGHT';
 const i=IMPACT_TIERS.indexOf(tier);
 // Preserve per-point contrast within each tier; cap extreme damage rather
 // than allowing an unbounded camera translation.
 const amplitude=amount<=0?0:lethal?42:Math.min(42,amount<3?5+amount*2:amount<5?2+amount*4:amount<10?6+amount*3.6:30+amount);
 return {tier,amplitude,duration:[0,220,320,500,680,880][i]!,rotation:[0,.15,.3,.65,.9,1.1][i]!,aftershock:i>=3,wave:[0,1.5,2,3.5,5,6][i]!,bass:null,rarity:'NORMAL'};
}
export function specialImpact(kind:'AWAKENING'|'BOSS'|'HIDDEN_BOSS'):ImpactProfile {
 return {...damageImpact(kind==='AWAKENING'?10:18,kind!=='AWAKENING'),rarity:'CHAMPION',amplitude:kind==='AWAKENING'?15:20};
}
export function effectiveImpact(profile:ImpactProfile,viewport:{width:number;height:number},mode:ShakeMode,reducedMotion=false){
 const mobile=Math.max(.76,Math.min(1,Math.min(viewport.width,viewport.height)/760));
 const multiplier=reducedMotion||mode==='OFF'?0:mode==='REDUCED'?.5:1;
 return {...profile,amplitude:Math.min(42,profile.amplitude)*mobile*multiplier,rotation:Math.min(1.1,profile.rotation)*multiplier};
}
export function impactFrames(profile:ImpactProfile,direction={x:0,y:1},radial=false):Keyframe[] {
 const length=Math.hypot(direction.x,direction.y)||1,dx=direction.x/length,dy=direction.y/length,a=profile.amplitude,r=profile.rotation;
 const pose=(t:number,lateral:number,angle:number,scale=1)=>({translate:`${((dx*t-dy*lateral)*a).toFixed(3)}px ${((dy*t+dx*lateral)*a).toFixed(3)}px`,rotate:`${(r*angle).toFixed(3)}deg`,scale:String(scale)});
 const large=impactRank(profile)>=4;
 return [{offset:0,...pose(0,0,0)},{offset:.07,...pose(1,0,.5,radial?1.012:large?.995:1)},{offset:.18,...pose(-.62,.08,-1,large?1.003:1)},{offset:.29,...pose(.28,-.3,.65)},{offset:.4,...pose(large?.34:-.15,large?.07:.14,-.45,large?1.002:1)},{offset:.56,...pose(-.16,-.09,.25)},{offset:.75,...pose(.06,.04,-.08)},{offset:1,...pose(0,0,0)}];
}
/**
 * Hearthstone-style play: pick the card up, fly it over its slot, hang there enlarged
 * for a beat, then slam it down. Bigger cards hover higher, hang longer and land later.
 */
export function summonTimeline(cost:number,rarity:string,reduced=false){
 const c=Math.max(1,Math.min(6,Math.round(Number.isFinite(cost)?cost:1)));
 const p=summonImpact(c,rarity);
 const special=rarity==='LEGENDARY'||rarity==='CHAMPION';
 const duration=reduced?180:rarity==='LEGENDARY'?1320:rarity==='CHAMPION'?1500:[600,640,700,760,860,960][c-1]!;
 const landing=reduced?70:Math.round(duration*(special||c>=5?.74:.7));
 return {duration,landing,end:reduced?duration:Math.max(duration,landing+p.duration+30)};
}
/** Hover height (px), hover scale boost, hang (ms) and slam (ms) for a play of this weight. */
export function summonPose(profile:ImpactProfile){
 const rank=impactRank(profile),special=profile.rarity==='LEGENDARY'||profile.rarity==='CHAMPION';
 // A champion is the trump card: it rises highest and hangs longest before it drops.
 if(profile.rarity==='CHAMPION')return {lift:165,boost:1.6,hang:540,slam:120};
 return {
  lift:special?140:[0,46,62,84,104,120][rank]!,
  boost:special?1.5:[1,1.18,1.24,1.32,1.38,1.42][rank]!,
  hang:special?360:[0,90,110,140,180,220][rank]!,
  slam:special?110:[0,80,85,95,105,110][rank]!,
 };
}
export type SummonPose=ReturnType<typeof summonPose>&{dx?:number};
export function summonFrames(source:{left:number;top:number},target:{left:number;top:number},scale:number,profile:ImpactProfile,landing:number,duration:number,reduced=false,poseOverride?:SummonPose):Keyframe[]{
 const position=(x:number,y:number,size:number,angle=0)=>`translate3d(${x}px,${y}px,0) scale(${size}) rotate(${angle}deg)`;
 if(reduced)return [{opacity:0,transform:position(target.left,target.top,scale)},{opacity:1,transform:position(target.left,target.top,scale)}];
 const pose:SummonPose=poseOverride??summonPose(profile),heavy=impactRank(profile)>=3,hx=target.left+(pose.dx??0);
 const d=Math.max(1,duration),t=landing/d;
 const hangEnd=Math.max(.2,t-pose.slam/d),hangStart=Math.max(.14,hangEnd-pose.hang/d);
 const lean=source.left<target.left?2.5:-2.5;
 return [
  {offset:0,opacity:1,transform:position(source.left,source.top,1)},
  // Picked up off the hand.
  {offset:Math.min(.1,hangStart*.35),transform:position(source.left,source.top-26,1.1,-lean),easing:'cubic-bezier(.2,.8,.3,1)'},
  // Fly in and decelerate into the hover, big and a little tilted.
  {offset:hangStart,transform:position(hx,target.top-pose.lift,scale*pose.boost,lean*.6),easing:'cubic-bezier(.4,0,.6,1)'},
  // Hang: drift up a hair so it feels held, then accelerate down.
  {offset:hangEnd,transform:position(hx,target.top-pose.lift-6,scale*pose.boost*1.01,0),easing:'cubic-bezier(.75,0,1,.6)'},
  // Slam: lands squashed.
  {offset:t,transform:position(target.left,target.top,scale*(heavy?.94:.96))},
  {offset:t+(1-t)*.3,transform:position(target.left,target.top-2,scale*(heavy?1.025:1.012)),easing:'cubic-bezier(.16,1,.3,1)'},
  {offset:t+(1-t)*.7,transform:position(target.left,target.top,scale*.997)},
  {offset:1,transform:position(target.left,target.top,scale)},
 ];
}

/** Read existing effect metadata conservatively; never execute or change spell effects. */
export function hasBoardWideImpact(value:unknown,depth=0):boolean {
 if(depth>8||!value||typeof value!=='object')return false;
 if(Array.isArray(value))return value.some(v=>hasBoardWideImpact(v,depth+1));
 const effect=value as Record<string,unknown>,target=effect.target as Record<string,unknown>|undefined;
 if(['DAMAGE','DESTROY','RETIRE'].includes(String(effect.action))&&target?.zone==='BOARD'&&(target.selection==='ALL'||Number(target.count)>=3))return true;
 return ['effects','abilities','script','steps','then','else','leftEffects','rightEffects','values'].some(k=>hasBoardWideImpact(effect[k],depth+1));
}

/**
 * Combat camera: a hard kick along the blow, a short freeze while hit-stop holds,
 * then a fast rattle that alternates along the blow with a sideways wobble and
 * decays to rest. Zoom is only a slight punch so the board never sways.
 */
export function combatCameraFrames(profile:ImpactProfile,direction={x:0,y:1},reduced=false,zoomOverride?:number):Keyframe[] {
 const rank=impactRank(profile),zoom=(zoomOverride===undefined&&profile.amplitude<=0?0:[0,.012,.03,.06,.1,.14][rank]!*(reduced?.5:1))*(zoomOverride??1);
 const length=Math.hypot(direction.x,direction.y)||1,dx=direction.x/length,dy=direction.y/length;
 // Tiers are pushed far apart: pokes nudge, finishers throw the board around.
 const a=Math.min(80,profile.amplitude*[0,.8,1,1.35,1.65,1.9][rank]!),spin=profile.rotation*[0,1,1.2,1.8,2.4,3][rank]!;
 const fixed=(value:number)=>(Math.abs(value)<.0005?0:value).toFixed(3);
 const frame=(offset:number,travel:number,lateral:number,punch:number,angle:number)=>({
  offset,
  translate:`${fixed((dx*travel-dy*lateral)*a)}px ${fixed((dy*travel+dx*lateral)*a)}px`,
  scale:String(1+zoom*punch),rotate:`${fixed(spin*angle)}deg`,
 });
 const hold=[.12,.12,.15,.2,.22,.24][rank]!,shakes=4+Math.max(1,rank)*2,wobble=[.45,-.35,.3,-.5,.25,-.2,.15,-.1,.08,-.05];
 const frames=[frame(0,0,0,0,0),frame(.03,1,0,1,.6),frame(hold,.92,0,1,.6)];
 for(let i=0;i<shakes;i++){
  const decay=Math.pow(.72,i+1),sign=i%2===0?-1:1;
  frames.push(frame(hold+(.94-hold)*(i+1)/(shakes+1),sign*decay,wobble[i%wobble.length]!*decay,Math.max(0,1-(i+1)/(shakes*.6)),sign*decay));
 }
 frames.push(frame(1,0,0,0,0));
 return frames;
}

/**
 * Board hop: when something heavy lands, the other cards on the board jump and drop
 * back with a thud. Returns height (px) and start delay (ms) for a card this far from
 * the landing, so the hop rolls outward like a wave. Zero height means no hop.
 */
export function boardHop(profile:ImpactProfile,distance:number){
 const rank=impactRank(profile);
 const base=profile.rarity==='CHAMPION'?26:profile.rarity==='LEGENDARY'?22:[0,0,0,10,16,22][rank]!;
 const d=Math.max(0,Number.isFinite(distance)?distance:0);
 const height=base*Math.max(.35,1-d/900);
 return {height:base?Math.round(height*10)/10:0,delay:Math.round(Math.min(240,d/1.6))};
}
/** One hop: spring up and lean a touch away from the landing, fall fast, small bounce, rest. */
export function boardHopFrames(height:number,side:number,duration=520):Keyframe[]{
 const h=Math.max(0,height),lean=Math.max(-1,Math.min(1,side))*Math.min(3,h*.12);
 const f=(n:number)=>(Math.abs(n)<.0005?0:n).toFixed(2);
 return [
  {offset:0,translate:'0px 0px',rotate:'0deg',scale:'1',easing:'cubic-bezier(.2,.9,.35,1)'},
  {offset:.32,translate:`0px ${f(-h)}px`,rotate:`${f(lean)}deg`,scale:String(1+h*.0022),easing:'cubic-bezier(.65,0,.95,.5)'},
  {offset:.6,translate:'0px 0px',rotate:'0deg',scale:String(1-h*.0012),easing:'cubic-bezier(.2,.9,.35,1)'},
  {offset:.74,translate:`0px ${f(-h*.16)}px`,rotate:`${f(-lean*.3)}deg`,scale:'1',easing:'cubic-bezier(.65,0,.95,.5)'},
  {offset:.86,translate:'0px 0px',rotate:'0deg',scale:'1'},
  {offset:1,translate:'0px 0px',rotate:'0deg',scale:'1'},
 ];
}

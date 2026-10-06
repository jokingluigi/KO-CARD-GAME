// Development-only actual summon/attack components and central impact manager.
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import '../src/index.css';import '../src/battle-presentation.css';
import {CinematicProvider} from '../src/components/cinematic-layer';import {ScreenShakeSetting,useScreenImpact} from '../src/components/screen-impact';import {damageImpact,specialImpact} from '../src/components/screen-impact-policy';
import {CardPlayAnimation} from '../src/components/card-play-animation';import {AttackAnimation} from '../src/components/attack-animation';import {CardRenderer} from '../src/components/card-renderer';import {generateCardInstance,setRuntimeCardDefinitions,type CardDefinition} from '../src/game';
const defs:CardDefinition[]=Array.from({length:6},(_,i)=>['NORMAL','EPIC','LEGENDARY','CHAMPION'].map(r=>({id:'impact-'+(i+1)+'-'+r,name:(i+1)+' COST · '+r,cardType:'WRESTLER' as const,cost:i+1,attack:4,health:8,rulesText:'QA',keywords:[],abilities:[],rarity:r as CardDefinition['rarity'],imageUrl:'/icons/ko-512.png'}))).flat();setRuntimeCardDefinitions(defs);
function Board(){const screen=useScreenImpact();const [play,setPlay]=useState<{cost:number;rarity:string;id:number}|null>(null),[attack,setAttack]=useState<{damage:number;lethal:boolean;id:number}|null>(null),[done,setDone]=useState(0);const sequence=React.useRef(0);
const rect=(id:string)=>{const r=document.getElementById(id)!.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};};
const launch=(cost:number,rarity='NORMAL')=>{setAttack(null);setPlay({cost,rarity,id:++sequence.current});};
const def=play?defs.find(d=>d.cost===play.cost&&d.rarity===play.rarity)!:defs[0]!;
return <div className="ko-game-shell" style={{overflowX:'hidden',minHeight:'100dvh'}}><header style={{position:'fixed',top:0,left:0,right:0,zIndex:1000,fontSize:10,background:'#121212',color:'white'}}>
{[1,2,3,4,5,6].map(c=><button data-testid={'cost-'+c} key={c} onClick={()=>launch(c)} style={{padding:5}}>cost {c}</button>)}
{['EPIC','LEGENDARY','CHAMPION'].map(r=><button data-testid={r} key={r} onClick={()=>launch(6,r)} style={{padding:5}}>{r}</button>)}
{[1,3,6,10].map(d=><button data-testid={'damage-'+d} key={d} onClick={()=>{setPlay(null);setAttack({damage:d,lethal:false,id:++sequence.current});}} style={{padding:5}}>hit {d}</button>)}
<button data-testid="lethal" onClick={()=>{setPlay(null);setAttack({damage:1,lethal:true,id:++sequence.current});}}>lethal</button>
<button data-testid="awakening" onClick={()=>screen.request({id:'awakening'+ ++sequence.current,profile:specialImpact('AWAKENING'),x:innerWidth/2,y:innerHeight/2,radial:true,nearby:true})}>awakening</button>
<button data-testid="priority" onClick={()=>{screen.request({id:'finisher'+ ++sequence.current,profile:damageImpact(10,true),x:innerWidth/2,y:innerHeight/2});screen.request({id:'weak'+ ++sequence.current,profile:damageImpact(1),x:0,y:0});}}>priority</button>
<button data-testid="cancel" onClick={()=>{setPlay(null);setAttack(null);}}>cancel</button>
<output data-testid="done">{done}</output><ScreenShakeSetting/></header>
<div className="ko-cinematic-background" style={{position:'absolute',inset:0,background:'radial-gradient(ellipse,#393238,#080809)'}}/>
<main className="ko-game-stage" style={{position:'relative',display:'block',padding:'145px 12px 125px',minHeight:'100dvh'}}>
<div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',width:'100%',maxWidth:324,margin:'auto',justifyContent:'center',gap:12}}>{[0,1,2,3,4,5].map(i=><div className="ko-board-slot-wrapper" key={i}>
{i===1?<div id="landing-slot" style={{aspectRatio:'1060/1484',border:'2px solid #987',borderRadius:8}}/>:<CardRenderer name="NEARBY" cardType="WRESTLER" cost={2} attack={3} health={5} rulesText="" size="board" className="w-full"/>}
</div>)}</div><div id="source-slot" style={{position:'absolute',bottom:20,right:20,width:74,height:104,border:'1px solid #bda'}}>HAND</div>
</main>
{play&&<CardPlayAnimation key={play.id} animation={{kind:'WRESTLER',card:generateCardInstance(def,{instanceId:'play-'+play.id}),geometry:{source:rect('source-slot'),target:rect('landing-slot')},impactLevel:play.cost===6?'VERY_HEAVY':play.cost>=5?'HEAVY':'NORMAL'}} onComplete={()=>{setDone(v=>v+1);setPlay(null);}}/>}
{attack&&<AttackAnimation key={attack.id} animation={{attacker:generateCardInstance(defs[0]!,{instanceId:'attacker'}),target:null,targetKind:'CHAMPION',geometry:{source:rect('source-slot'),target:rect('landing-slot')},damage:attack.damage,currentAttack:attack.damage,impactLevel:'VERY_HEAVY',damageImpactLevel:'VERY_HEAVY',soundKey:'hit-'+attack.id,finishingBlow:attack.lethal}} hapticsEnabled={true} onImpact={()=>{}} onComplete={()=>{setDone(v=>v+1);setAttack(null);}}/>}
</div>;}
createRoot(document.getElementById('root')!).render(<CinematicProvider><Board/></CinematicProvider>);

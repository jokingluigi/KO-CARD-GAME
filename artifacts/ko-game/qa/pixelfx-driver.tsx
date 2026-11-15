/** Local visual QA. Not included in the production entrypoint. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BattleVfx,preloadExternalVfx} from '../src/components/battle-vfx';
import {boardFixture,definitions} from './black-gold-fixture';
import {applyEffect} from '../src/game/effects/effect-engine';
import type {GameState} from '../src/game/types/game-state';
if(!import.meta.env.DEV)throw Error('Development preview only');
let state:GameState;
let sequence=0;
const holder=document.createElement('div');document.body.append(holder);const root=createRoot(holder);
const load=(next:GameState)=>window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:next,definitions}}));
function reset(armor=0,attack=5) {
  state=boardFixture();state.events=[];state.gameId='pixelfx-qa-'+(++sequence);
  for(const [i,p] of state.players.entries()) {
    p.health=p.maxHealth=p.champion!.health=p.champion!.maxHealth=30;p.champion!.quest=null;p.hand=[];p.championAbilityUsedThisTurn=true;
    const card=p.board.find(Boolean)!;
    p.board=[{...card,boardSlot:0,abilities:[],grantedText:undefined,keywords:armor&&i===1?['ARMOR']:[],armor:i===1?armor:0,
      currentAttack:i===0?attack:2,currentHealth:30,maxHealth:30,enteredThisTurn:false,attacksUsedThisTurn:0},null,null,null];
  }
  state.activePlayerId='player-1';load(state);
}
(window as any).pixelFxQA={
 inspect(){return state;},
 reset,
 preview(kind:string,strength=3,duration=900) {
   const target=document.querySelector('.ko-opponent-board-row .ko-board-slot')!.getBoundingClientRect();
   root.render(<BattleVfx key={String(performance.now())} kind={kind as any} strength={strength} seed={'qa:'+kind} left={target.x+target.width/2} top={target.y+target.height/2} duration={duration} direction={{x:1,y:0}}/>);
 },
 clear(){root.render(null);},
 prepareHeal() {
   reset();state.players[0].board[0]!.currentHealth=18;load(structuredClone(state));
 },
 heal() {const source=state.players[0].board[0]!;state=applyEffect(state,'player-1',source,{type:'STRUCTURED',action:'HEAL',target:{zone:'BOARD',owner:'SELF',selection:'SELF'},values:{amount:5}});load(state);},
};
preloadExternalVfx();reset();

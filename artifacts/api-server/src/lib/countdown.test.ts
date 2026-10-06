import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredCountdownTurns,validCountdownTurns,validCountdownCardSettings,KEYWORDS,TRIGGERS} from '@workspace/effect-registry';
import {analyzeEffectText,isStructuredEffects,isEffectScriptConfig,effectLibrary} from './structured-effects';
import {generateEffectDraft,validateGeneratedEffectDraft} from './admin-effect-ai';
import {dryRunCardEffect} from './effect-dry-run';
import {validateMechanicCompletion} from './mechanic-completion-service';
import {sanitizeGameStateForViewer} from '../online/sanitizer';
import {createInitialGameState,generateCardInstance} from '@workspace/game-engine';

const hit={trigger:'COUNTDOWN',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},values:{amount:2}};
const context={sourceType:'CARD' as const,cardType:'WRESTLER' as const};

test('countdown keyword, trigger, label and adjustable number contract',()=>{
  assert.ok(KEYWORDS.includes('COUNTDOWN'));assert.ok(TRIGGERS.includes('COUNTDOWN'));
  assert.equal(effectLibrary().triggers.find(t=>t.name==='COUNTDOWN')?.status,'ACTIVE');
  for(const n of [1,3,999]){assert.ok(validCountdownTurns(n));assert.equal(configuredCountdownTurns({countdownTurns:n}),n);}
  for(const n of [0,-1,1000,1.5,NaN,Infinity,'3',null]){assert.equal(validCountdownTurns(n),false);assert.equal(configuredCountdownTurns({countdownTurns:n}),1);}
});

test('saved countdown requires a board card, a keyword and a valid clock',()=>{
  assert.ok(validCountdownCardSettings('WRESTLER',['COUNTDOWN'],{countdownTurns:3,effects:[hit]}));
  assert.ok(validCountdownCardSettings('WRESTLER',['COUNTDOWN'],{effects:[hit]}));
  assert.equal(validCountdownCardSettings('TECHNIQUE',['COUNTDOWN'],{effects:[hit]}),false);
  assert.equal(validCountdownCardSettings('WRESTLER',[],{effects:[hit]}),false);
  assert.equal(validCountdownCardSettings('WRESTLER',['COUNTDOWN'],{countdownTurns:0,effects:[hit]}),false);
  assert.equal(validCountdownCardSettings('WRESTLER',['COUNTDOWN'],{effects:[{...hit,conditions:[{type:'SOURCE_IN_HAND'}]}]}),false);
});

for(const prefix of ['카운트다운(3)','카운트다운 3턴','COUNTDOWN(3)'])test(`analyzer compiles ${prefix} with a numeric clock`,()=>{
  const result=analyzeEffectText(`${prefix}: 상대 챔피언에게 피해를 2 줍니다.`);
  assert.equal(result.status,'success');assert.equal(result.countdownTurns,3);
  assert.ok(result.keywords.includes('COUNTDOWN'));assert.deepEqual(result.effects,[hit]);
  assert.ok(isStructuredEffects({effects:result.effects,countdownTurns:result.countdownTurns}));
});

for(const n of ['0','-1','1.5','1000','abc'])test(`analyzer refuses invalid countdown ${n}`,()=>{
  const result=analyzeEffectText(`카운트다운(${n}): 상대 챔피언에게 피해를 2 줍니다.`);
  assert.equal(result.status,'failure');assert.equal(result.effects.length,0);
});

test('script schema accepts the countdown trigger',()=>{
  assert.ok(isEffectScriptConfig({countdownTurns:2,scripts:[{version:'SCRIPT_V1',trigger:'COUNTDOWN',steps:[{type:'EFFECT',effect:{action:'DAMAGE',target:hit.target,values:hit.values}}]}]}));
});

test('AI authoring preserves N without contacting a provider, then dry-runs real turns',async()=>{
  const draft=await generateEffectDraft('카운트다운(3): 상대 챔피언에게 피해를 2 줍니다.',context,[]);
  assert.equal(draft.status,'READY');if(draft.status!=='READY')return;
  assert.equal(draft.effectConfig.countdownTurns,3);assert.ok(draft.keywords.includes('COUNTDOWN'));
  const runs=dryRunCardEffect(draft);
  assert.deepEqual(runs.map(r=>[r.trigger,r.status,r.enemyHealthDelta]),[['COUNTDOWN','EXECUTED',2]]);
  const reloaded=JSON.parse(JSON.stringify(draft));assert.equal(reloaded.effectConfig.countdownTurns,3);
  assert.ok(validCountdownCardSettings('WRESTLER',draft.keywords,reloaded.effectConfig));
});

test('long clocks remain authorable without falsely claiming a completed basic dry run',()=>{
  const draft=validateGeneratedEffectDraft({status:'READY',effectId:'STRUCTURED_EFFECTS_V1',effects:[hit],keywords:['COUNTDOWN']},context,[]);
  assert.equal(draft.status,'READY');if(draft.status!=='READY')return;
  draft.effectConfig.countdownTurns=999;assert.equal(dryRunCardEffect(draft)[0].status,'NOT_SIMULATED');
});

test('AI authoring rejects technique countdown and invalid clock',async()=>{
  await assert.rejects(generateEffectDraft('카운트다운(1): 상대 챔피언에게 피해를 2 줍니다.',{...context,cardType:'TECHNIQUE'},[]),/선수 카드/);
  await assert.rejects(generateEffectDraft('카운트다운(0): 상대 챔피언에게 피해를 2 줍니다.',context,[]),/1~999/);
});

test('mechanic completion preserves the configured countdown',()=>{
  const result=validateMechanicCompletion('카운트다운(4): 상대 챔피언에게 피해를 2 줍니다.');
  assert.equal(result.status,'recognized');assert.equal(result.structuredEffect?.countdownTurns,4);
});

test('online views show public remaining clocks but hide the server turn-start queue',()=>{
  const state=createInitialGameState();
  const card=generateCardInstance({id:'timer',name:'공개 타이머',cost:1,attack:2,health:3,keywords:['COUNTDOWN'],abilities:[],rulesText:'',isToken:false,isChampionToken:false,effectConfig:{countdownTurns:3}},{instanceId:'public-timer'});
  state.players[0].board[0]={...card,boardSlot:0,countdownRemaining:2};
  state.pendingCountdownTurnStart={turn:3,playerId:'player-1',steps:[{instanceId:'hidden-opponent-card',trigger:'TURN_START'}]};
  const view=sanitizeGameStateForViewer(state,'player-2') as Record<string,any>;
  assert.equal(view.players[0].board[0].countdownRemaining,2);assert.equal(view.pendingCountdownTurnStart,undefined);
  assert.ok(!JSON.stringify(view).includes('hidden-opponent-card'));
});

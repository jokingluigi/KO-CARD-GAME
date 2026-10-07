import assert from 'node:assert/strict';
import test from 'node:test';
import {cardRecordToDefinition,type PublishedCardRecord} from '../cards/published-cards';
import {championRecordToDefinition,type PublishedChampionRecord} from '../champions/published-champions';
import {createInitialGameState} from './create-initial-game-state';
import {generateCardInstance} from '../cards/generation';
import {executeAction} from '../actions/engine-actions';
import {applyEffect,resolveTriggeredAbilities} from '../effects/effect-engine';
import {processChampionQuestEvents} from '../champions/quests';
import type {CardDefinition} from '../cards/types';

const raw=(text:string,extra:Partial<PublishedCardRecord>={}):PublishedCardRecord=>({id:'test-source',name:'test-source',cardType:'WRESTLER',cost:1,attack:0,health:1,text,keywords:[],isToken:true,isChampionToken:false,effectId:null,effectConfig:{},status:'DRAFT',version:1,createdAt:'',updatedAt:'',imageAssetId:null,imageUrl:null,...extra});
const unit:CardDefinition={id:'unit',name:'unit',cardType:'WRESTLER',cost:1,attack:2,health:3,rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false,status:'PUBLISHED'};
function setup(source=cardRecordToDefinition(raw(''))){
 const s=createInitialGameState(undefined,[unit,source]);s.status='IN_PROGRESS';s.activePlayerId=s.players[0].id;s.turn=3;s.players[0].currentGold=6;
 s.players[0].board=[{...generateCardInstance(unit,{instanceId:'host'}),boardSlot:0,enteredThisTurn:false},null,null,null];
 s.players[0].hand=[generateCardInstance({...source,keywords:[...source.keywords,'FUSION']},{instanceId:'source'})];
 s.players[0].deck=[generateCardInstance(unit,{instanceId:'drawn'})];return s;
}
function fuse(s:ReturnType<typeof setup>){
 const p=executeAction(s,{type:'PLAY_WRESTLER',playerId:s.players[0].id,cardInstanceId:'source',boardSlot:1});assert.ok(p.success);
 return executeAction(JSON.parse(JSON.stringify(p.state)),{type:'SELECT_EFFECT_TARGET',playerId:s.players[0].id,targetId:'host'}).state;
}
for(const [word,keyword]of [['치유','REGEN'],['흡혈','LIFESTEAL']]as const)test('fusion host receives '+keyword+' through serialized context, including immune host',()=>{
 const s=setup(cardRecordToDefinition(raw("이 카드가 합체하면 합체된 카드에게 '"+word+"'를 부여합니다.")));s.players[0].board[0]!.keywords=['IMMUNE'];
 const done=fuse(s);assert.ok(done.players[0].board[0]?.keywords.includes(keyword));assert.equal(done.players[0].board[1],null);
});
test('fusion draw and next-turn gold execute once without retire/destroy',()=>{
 for(const text of ['이 카드가 합체하면 카드 한장을 드로우합니다.','이 카드가 합체하면 다음턴에 골드를 추가로 1 더 받습니다.']){
 const s=setup(cardRecordToDefinition(raw(text)));const done=fuse(s);
 assert.equal(done.events.filter(e=>e.type==='CARD_RETIRED'||e.type==='CARD_DESTROYED').length,0);
 if(text.includes('드로우'))assert.equal(done.players[0].hand.length,1);else assert.equal(done.players[0].nextTurnGoldBonus,1);
 }
});
test('fusion host growth uses its own trigger while retaining active transform',()=>{
 const d=cardRecordToDefinition(raw("이 카드는 합체 할 때 마다 +2/+2를 얻습니다.\n액티브:'form-two'으로 변신합니다."));
 assert.deepEqual(d.abilities.map(a=>a.trigger),['ON_FUSION','ACTIVE']);const s=setup();s.players[0].board[0]!.abilities=d.abilities;
 const done=fuse(s);assert.equal(done.players[0].board[0]?.currentAttack,4);assert.equal(done.players[0].board[0]?.currentHealth,6);
});
test('combo buffs only attacker and source plus champion HP, works on immune allies',()=>{
 const d=cardRecordToDefinition(raw('콤보:공격한 아군 카드와, 이 카드, 아군 챔피언의 체력을 2 증가시킵니다.'));
 const s=setup();s.players[0].board[0]!.keywords=['IMMUNE'];const listener={...generateCardInstance(d,{instanceId:'listener'}),boardSlot:1 as const};s.players[0].board[1]=listener;
 const done=resolveTriggeredAbilities(s,s.players[0].id,listener,'OTHER_ALLY_ATTACK',{attackerInstanceId:'host'});
 assert.equal(done.players[0].board[0]?.maxHealth,5);assert.equal(done.players[0].board[1]?.maxHealth,3);assert.equal(done.players[0].health,s.players[0].health+2);assert.equal(done.players[0].maxHealth,s.players[0].maxHealth+2);
});
test('turn-end top wrestler attack uses current source attack, skips technique',()=>{
 const d=cardRecordToDefinition(raw('턴 종료:내 덱 맨 위에 있는 선수 카드에게 이 카드의 공격력만큼 공격력을 증가시킵니다.'));
 const s=setup(d),c={...generateCardInstance(d,{instanceId:'source'}),boardSlot:1 as const,currentAttack:7};s.players[0].board[1]=c;s.players[0].hand=[];
 const done=resolveTriggeredAbilities(s,s.players[0].id,c,'TURN_END');assert.equal(done.players[0].deck[0].currentAttack,9);
});
test('annihilation destroys by current ATK inclusive <=3 without graveyard',()=>{
 const d=cardRecordToDefinition(raw('현재 공격력이 3 이하인 모든 선수를 파괴합니다.',{cardType:'TECHNIQUE',health:0}));const s=setup(d);s.players[0].board[0]!.currentAttack=3;s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),boardSlot:0,currentAttack:4};
 const done=applyEffect(s,s.players[0].id,s.players[0].hand[0],d.abilities[0].effects[0]);assert.equal(done.players[0].board[0],null);assert.ok(done.players[1].board[0]);assert.equal(done.players[0].graveyard.length,0);
});
const championRaw:PublishedChampionRecord={id:'fusion-champion',name:'fusion-champion',description:'',imageAssetId:null,imageUrl:null,maxHealth:25,abilityName:'generate',abilityCost:1,abilityText:"'부품' 태그가 달려있는 토큰 카드들 중 무작위 한장을 손패에 넣습니다.",abilityEffects:{},hasQuest:true,questName:'fusion quest',questText:"'합체'를 총 10번 이행한다.",questCondition:{event:'CARD_PLAYED',required:10},questProgressRequired:10,questRewardText:"'reward-unit'를 필드에 소환한다.",questRewardEffects:null,upgradedAbilityName:null,upgradedAbilityCost:null,upgradedAbilityText:null,upgradedAbilityEffects:null,championTokenDefinitionId:null,status:'DRAFT',version:3};
test('champion text repairs stale CARD_PLAYED quest and empty ability/reward configuration',()=>{
 const d=championRecordToDefinition(championRaw);assert.equal(d.abilityCost,1);assert.equal(d.maxHealth,25);assert.equal(d.quest?.trackedEvent,'FUSION');assert.equal(d.quest?.requiredProgress,10);assert.equal(d.quest?.reward.type,'STRUCTURED');assert.equal(d.ability.effects.length,1);
});
test('champion counts ten fusions once each and restores serialized progress; full board reward asks replacement',()=>{
 const d=championRecordToDefinition(championRaw);let s=setup();s.cardPool=[unit,{...unit,id:'reward-unit',name:'reward-unit',rarity:'CHAMPION',isToken:true,isChampionToken:true}];
 s.players[0].champion={...s.players[0].champion!,id:d.id,ability:d.ability,quest:d.quest!,questProgress:0,questCompleted:false};
 for(let i=0;i<10;i++){const prev=structuredClone(s);s={...s,events:[...s.events,...['FUSION_SOURCE','FUSION_TARGET'].map(reason=>({type:'FUSION' as const,playerId:s.players[0].id,reason,cardInstanceId:'fusion-'+i+'-'+reason}))]};if(i===9)for(const j of [0,1,2,3] as const)s.players[0].board[j]??={...generateCardInstance(unit,{instanceId:'full-'+j}),boardSlot:j};s=processChampionQuestEvents(prev,s);assert.equal(s.players[0].champion?.questProgress,i+1);s=JSON.parse(JSON.stringify(s));}
 assert.equal(s.players[0].champion?.questCompleted,true);assert.ok(s.targetingState?.championRewardReplacement);assert.equal(s.events.filter(e=>e.type==='CHAMPION_QUEST_COMPLETED').length,1);
});
test('admin stage card keywords and configured stats survive mapping; changed text disables obsolete dealer pierce',()=>{
 const d=cardRecordToDefinition(raw('이 카드가 필드에 소환되면 이 카드에게 이번 게임에서 리타이어하거나 파괴 된 아군 선수의 수만큼 공격력을 증가시킵니다.',{id:'crisis-awakening-dealer',cost:2,attack:0,health:3,keywords:['RUSH','DODGE','IMMUNE'],effectConfig:{awakeningStage:'DEALER',questExclusive:true,dodgeCharges:3}}));
 assert.deepEqual([d.cost,d.attack,d.health],[2,0,3]);assert.deepEqual(d.keywords,['RUSH','DODGE','IMMUNE']);assert.equal(d.awakeningLegacyPassives,false);assert.equal(d.abilities[0].trigger,'SELF_ENTERED');
});

test('countdown uses current max HP, grants rush and ignores taunt only for champion targeting',()=>{
 const d=cardRecordToDefinition(raw("카운트다운(3):'공격불가'키워드를 제거하고, 이 카드의 최대 체력의 수치만큼 공격력을 증가시킵니다! 그리고 '러쉬' 키워드를 추가합니다! 이 카드는 '도발'을 무시하고 상대 챔피언을 공격 할 수 있습니다!",{attack:0,health:8,keywords:['COUNTDOWN','CANNOT_ATTACK'],effectConfig:{countdownTurns:3}}));
 const s=setup(d);s.players[0].hand=[];s.players[0].board[0]={...generateCardInstance(d,{instanceId:'source'}),boardSlot:0,currentHealth:10,maxHealth:12};
 const done=resolveTriggeredAbilities(s,s.players[0].id,s.players[0].board[0]!,'COUNTDOWN');const card=done.players[0].board[0]!;
 assert.equal(card.currentAttack,12);assert.ok(card.keywords.includes('RUSH'));assert.ok(!card.keywords.includes('CANNOT_ATTACK'));assert.ok(card.ignoreTauntToChampion);
 done.players[1].board[0]={...generateCardInstance({...unit,keywords:['TAUNT']},{instanceId:'taunt'}),boardSlot:0};done.players[1].board[1]={...generateCardInstance(unit,{instanceId:'other'}),boardSlot:1};
 assert.ok(executeAction(done,{type:'ATTACK',playerId:done.players[0].id,attackerInstanceId:'source',target:{type:'PLAYER',playerId:done.players[1].id}}).success);
 assert.equal(executeAction(done,{type:'ATTACK',playerId:done.players[0].id,attackerInstanceId:'source',target:{type:'WRESTLER',playerId:done.players[1].id,cardInstanceId:'other'}}).success,false);
});
test('damage hit counter survives serialization and adds event count rather than damage sum to transformed attack',()=>{
 const d=cardRecordToDefinition(raw("이 카드는 데미지를 입을때마다 카운트를 따로 기록합니다.\n카운트다운(3):상대의 모든 선수 카드에게 5 데미지를 가합니다.\n액티브:'form-broken'로 변신하고 그 카드에게 기록된 카운트만큼 공격력을 증가시킵니다.",{attack:0,health:8,keywords:['COUNTDOWN'],effectConfig:{countdownTurns:3}}));
 let s=setup(d);s.players[0].hand=[];s.cardPool!.push({...unit,id:'form-broken',name:'form-broken',attack:3,health:1});s.players[0].board[0]={...generateCardInstance(d,{instanceId:'source'}),boardSlot:0};const damage={type:'STRUCTURED' as const,action:'DAMAGE' as const,target:{zone:'BOARD' as const,owner:'SELF' as const,selection:'SELF' as const,count:1},values:{amount:2}};
 for(let i=0;i<2;i++)s=applyEffect(s,s.players[0].id,s.players[0].board[0]!,damage);s=JSON.parse(JSON.stringify(s));const done=resolveTriggeredAbilities(s,s.players[0].id,s.players[0].board[0]!,'ACTIVE');
 assert.equal(done.players[0].board[0]?.currentAttack,5);assert.equal(done.players[0].board[0]?.definitionId,'form-broken');
});
test('retire self snapshots current attack, hits both fields and spills only real excess to enemy champion',()=>{
 const d=cardRecordToDefinition(raw('액티브:이 카드를 리타이어 시키고, 이 카드의 공격력만큼 모든 선수 카드에게 데미지를 줍니다. 이때 각 선수 카드들의 체력을 초과한 데미지만큼 상대 챔피언에게 데미지를 줍니다.',{attack:5,health:1}));
 const s=setup(d);s.players[0].hand=[];s.players[0].board[1]={...generateCardInstance(d,{instanceId:'source'}),boardSlot:1};
 s.players[0].board[0]!.currentHealth=2;s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),boardSlot:0};s.players[0].board[2]={...generateCardInstance({...unit,keywords:['DEFENSE']},{instanceId:'protected'}),boardSlot:2,entryDefenseActive:true,enteredOnTurn:3};
 const done=resolveTriggeredAbilities(s,s.players[0].id,s.players[0].board[1]!,'ACTIVE');
 assert.equal(done.players[1].health,s.players[1].health-5);assert.equal(done.players[0].board[0],null);assert.equal(done.players[1].board[0],null);assert.equal(done.players[0].board[2]?.currentHealth,3);assert.ok(done.players[0].graveyard.some(c=>c.instanceId==='source'));
});

test('all-character heal includes immune allies and self, while manual targeting retains immunity',()=>{
 const s=setup();s.players[0].hand=[];const source=s.players[0].board[0]!;source.keywords=['IMMUNE'];source.currentHealth=1;source.maxHealth=5;
 s.players[0].board[1]={...generateCardInstance({...unit,keywords:['IMMUNE']},{instanceId:'immune-ally'}),boardSlot:1,currentHealth:1};s.players[0].health=10;
 const done=applyEffect(s,s.players[0].id,source,{type:'STRUCTURED',action:'HEAL',target:{zone:'CHARACTER',owner:'SELF',selection:'ALL',count:20},values:{amount:3}});
 assert.equal(done.players[0].board[0]?.currentHealth,4);assert.equal(done.players[0].board[1]?.currentHealth,3);assert.equal(done.players[0].health,13);
 const blocked=applyEffect(s,s.players[0].id,source,{type:'STRUCTURED',action:'HEAL',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1},values:{amount:3}},['immune-ally']);
 assert.equal(blocked.players[0].board[1]?.currentHealth,1);
});

test('self-entry removal-count attack runs for hand, summon and revival without broadening battlecry rules',async()=>{
 const {enterField}=await import('./enter-field');
 const d=cardRecordToDefinition(raw('이 카드가 필드에 소환되면 이 카드에게 이번 게임에서 리타이어하거나 파괴 된 아군 선수의 수만큼 공격력을 증가시킵니다.',{id:'crisis-awakening-dealer',effectConfig:{awakeningStage:'DEALER',questExclusive:true}}));
 for(const cause of ['PLAY_FROM_HAND','SUMMON','REVIVE','CHAMPION_DEPLOY'] as const){
 const s=setup(d);s.players[0].hand=[];s.events=[{type:'CARD_RETIRED',playerId:s.players[0].id,cardType:'WRESTLER',cardInstanceId:'old-1'},{type:'CARD_DESTROYED',playerId:s.players[0].id,cardType:'WRESTLER',cardInstanceId:'old-2'},{type:'CARD_VANISHED',playerId:s.players[0].id,cardType:'WRESTLER',cardInstanceId:'vanished'}];
 const c=generateCardInstance(d,{instanceId:'source'});const done=enterField(s,s.players[0].id,c,1,undefined,undefined,cause);assert.equal(done.players[0].board[1]?.currentAttack,2,cause);
 }
});

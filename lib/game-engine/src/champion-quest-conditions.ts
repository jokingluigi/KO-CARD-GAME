import type { GameState } from '../../../artifacts/ko-game/src/game/types/game-state';
import type { GameEvent } from '../../../artifacts/ko-game/src/game/events/types';
import { questEventRegistry } from './quest-conditions';
import { matchTurnNumber } from './rules';

export type ChampionQuestCondition =
  | { type: 'EVENT'; event: string; owner: 'SELF' | 'ENEMY' | 'ALL'; required: number; cardType?: 'WRESTLER' | 'TECHNIQUE';sourceOwner?:'SELF'|'ENEMY';targetOwner?:'SELF'|'ENEMY';targetKind?:'PLAYER'|'CARD';reason?:string;rarity?:string;positiveOnly?:boolean;exactZero?:boolean;sourceActionTypes?:string[] }
  | {type:'ZONE_COUNT';zone:'GRAVEYARD'|'HAND'|'DECK'|'BOARD';owner:'SELF'|'ENEMY';required:number;tag?:string;cardType?:'WRESTLER'|'TECHNIQUE'}
  | { type: 'TURN'; turn: number }
  | { type: 'HEALTH'; owner: 'SELF' | 'ENEMY'; op: 'LTE' | 'LT' | 'GTE' | 'GT' | 'EQ'; value: number }
  | { type: 'ALL' | 'ANY'; conditions: ChampionQuestCondition[] };

export function validChampionQuestCondition(input: unknown, depth = 0): input is ChampionQuestCondition {
  if (!input || typeof input !== 'object' || Array.isArray(input) || depth > 4) return false;
  const n = input as Record<string, unknown>;
  const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
  const keys = (allowed: string[]) => Object.keys(n).every(k => allowed.includes(k));
  if (n.type === 'ALL' || n.type === 'ANY') return keys(['type', 'conditions']) && Array.isArray(n.conditions) && n.conditions.length > 0 && n.conditions.length <= 8 && n.conditions.every(c => validChampionQuestCondition(c, depth + 1));
  if(n.type==='ZONE_COUNT')return keys(['type','zone','owner','required','tag','cardType'])&&['GRAVEYARD','HAND','DECK','BOARD'].includes(n.zone as string)&&['SELF','ENEMY'].includes(n.owner as string)&&integer(n.required,1,999)&&(n.tag===undefined||typeof n.tag==='string')&&(n.cardType===undefined||['WRESTLER','TECHNIQUE'].includes(n.cardType as string));
  if (n.type === 'TURN') return keys(['type', 'turn']) && integer(n.turn, 1, 999);
  if (n.type === 'HEALTH') return keys(['type', 'owner', 'op', 'value']) && ['SELF', 'ENEMY'].includes(n.owner as string) && ['LTE', 'LT', 'GTE', 'GT', 'EQ'].includes(n.op as string) && integer(n.value, 0, 999);
  return n.type === 'EVENT' && keys(['type', 'event', 'owner', 'required', 'cardType','sourceOwner','targetOwner','targetKind','reason','rarity','positiveOnly','exactZero','sourceActionTypes']) && typeof n.event === 'string' && Object.hasOwn(questEventRegistry(), n.event) && !n.event.startsWith('CHAMPION_QUEST_') && ['SELF', 'ENEMY','ALL'].includes(n.owner as string) && integer(n.required, 1, 999) && (n.cardType === undefined || ['WRESTLER', 'TECHNIQUE'].includes(n.cardType as string)) && (n.sourceOwner===undefined||['SELF','ENEMY'].includes(n.sourceOwner as string))&&(n.targetOwner===undefined||['SELF','ENEMY'].includes(n.targetOwner as string))&&(n.targetKind===undefined||['PLAYER','CARD'].includes(n.targetKind as string))&&(n.reason===undefined||typeof n.reason==='string')&&(n.rarity===undefined||['NORMAL','EPIC','LEGENDARY','CHAMPION'].includes(n.rarity as string))&&(n.positiveOnly===undefined||typeof n.positiveOnly==='boolean')&&(n.exactZero===undefined||typeof n.exactZero==='boolean')&&(n.sourceActionTypes===undefined||(Array.isArray(n.sourceActionTypes)&&n.sourceActionTypes.every(x=>typeof x==='string')));
}

/** Event leaves remember accumulated counts; state leaves inspect the current state. */
export function evaluateChampionQuestCondition(condition: ChampionQuestCondition, state: GameState, playerId: string, events: GameEvent[], previous: Record<string, number> = {}) {
  const counts = { ...previous };
  const visit = (node: ChampionQuestCondition, path: string): boolean => {
    if (node.type === 'ALL' || node.type === 'ANY') {
      const results = node.conditions.map((child, index) => visit(child, `${path}.${index}`));
      return node.type === 'ALL' ? results.every(Boolean) : results.some(Boolean);
    }
    if(node.type==='ZONE_COUNT'){const p=state.players.find(p=>node.owner==='SELF'?p.id===playerId:p.id!==playerId);const cards=p?(node.zone==='BOARD'?p.board:node.zone==='HAND'?p.hand:node.zone==='DECK'?p.deck:p.graveyard):[];counts[path]=cards.filter(c=>c&&(!node.tag||c.tags?.includes(node.tag))&&(!node.cardType||c.cardType===node.cardType)).length;return counts[path]>=node.required;}
    if (node.type === 'TURN') return matchTurnNumber(state.turn) >= node.turn;
    if (node.type === 'HEALTH') {
      const player = state.players.find(p => node.owner === 'SELF' ? p.id === playerId : p.id !== playerId);
      if (!player) return false;
      return node.op === 'LTE' ? player.health <= node.value : node.op === 'LT' ? player.health < node.value : node.op === 'GTE' ? player.health >= node.value : node.op === 'GT' ? player.health > node.value : player.health === node.value;
    }
    if (node.type !== 'EVENT') return false;
    counts[path] = Math.min(node.required,(counts[path]??0)+events.filter(e=>{
      if(e.type!==node.event||node.cardType&&e.cardType!==node.cardType||node.reason&&e.reason!==node.reason||node.positiveOnly&&!(Number(e.amount)>0)||node.exactZero&&!e.exactZero)return false;
      const targetId=e.target?.type==='CARD'?e.target.cardInstanceId:e.cardInstanceId;
      const targetPlayer=e.target?.type==='PLAYER'?e.target.playerId:e.targetSnapshot?.playerId??state.players.find(p=>[...p.board,...p.hand,...p.deck,...p.graveyard,...p.removedFromGame].some(c=>c?.instanceId===targetId))?.id;
      const eventOwner=node.targetOwner?targetPlayer:e.playerId;
      const wanted=node.targetOwner??node.owner;
      if(wanted!=='ALL'&&(wanted==='SELF'?eventOwner!==playerId:!eventOwner||eventOwner===playerId))return false;
      if(node.targetKind&&e.target?.type!==node.targetKind)return false;
      if(node.sourceOwner&&(node.sourceOwner==='SELF'?e.sourceContext?.sourcePlayerId!==playerId:!e.sourceContext?.sourcePlayerId||e.sourceContext.sourcePlayerId===playerId))return false;
      if(node.sourceActionTypes&&!node.sourceActionTypes.includes(e.sourceContext?.sourceActionType??''))return false;
      if(node.rarity){const d=state.cardPool?.find(d=>d.id===e.cardDefinitionId);if(d?.rarity!==node.rarity)return false;}
      return true;
    }).length);

    return counts[path]! >= node.required;
  };
  return { completed: visit(condition, 'root'), counts };
}

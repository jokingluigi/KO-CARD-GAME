import type {GameState} from '@/game';
/** No replay on mount/reconnect; never infer spending from a changed number. */
export function attentionPlans(before: GameState, after: GameState) {
  if (before.gameId !== after.gameId || after.events.length < before.events.length || after.status !== 'IN_PROGRESS') return [];
  const events = after.events.slice(before.events.length);
  return after.players.flatMap(player => {
    const old = before.players.find(p => p.id === player.id);
    if (!old) return [];
    const spent = events.filter(e => e.type === 'GOLD_CHANGED' && e.playerId === player.id && ['CARD_COST','CHAMPION_ABILITY_COST'].includes(e.reason ?? '') && (e.amount ?? 0) < 0).reduce((n,e) => n + (e.amount ?? 0), 0);
    const quest = !!player.champion && !!old.champion && !player.champion.questCompleted && player.champion.questProgress > old.champion.questProgress && events.some(e => e.type === 'CHAMPION_QUEST_PROGRESS' && e.playerId === player.id);
    return spent || quest ? [{playerId: player.id, spent, quest}] : [];
  });
}

export function paidCardId(event:GameState['events'][number],events:GameState['events']) {
  if(event.reason!=='CARD_COST')return undefined;
  if(event.source?.type==='CARD')return event.source.cardInstanceId;
  const plays=events.filter(p=>p.type==='CARD_PLAYED'&&p.playerId===event.playerId&&(!event.presentationResolutionId||p.presentationResolutionId===event.presentationResolutionId));
  return plays.length===1?plays[0].cardInstanceId:undefined;
}

import type { GameState } from '@/game';
import type { ChampionState } from '../game/champions/types';
import { canPresentBattleQuest } from './quest-presentation-policy';

/** Events identify a player, whereas the champion definition ID can be shared. */
export function questOwner(state: GameState, playerId?: string, championId?: string) {
  return playerId
    ? state.players.find(player => player.id === playerId)
    : state.players.find(player => player.champion?.id === championId && player.champion?.questCompleted);
}

export function questMusic(state: GameState | null | undefined) {
  if (!canPresentBattleQuest(state) || !state) return null;
  const eligible = (champion: ChampionState | undefined | null) =>
    champion?.questCompleted && champion.questCompleteAudioEnabled && champion.questCompleteAudioUrl
      ? { assetUrl: champion.questCompleteAudioUrl, volume: champion.questCompleteAudioVolume ?? 100 }
      : null;
  // Reconnects retain events; prefer the latest completed player with enabled music.
  for (let i = state.events.length - 1; i >= 0; i--) {
    const event = state.events[i];
    if (event.type !== 'CHAMPION_QUEST_COMPLETED') continue;
    const music = eligible(questOwner(state, event.playerId, event.championId)?.champion);
    if (music) return music;
  }
  // Older snapshots may not include completion events.
  return eligible(state.players.find(p => p.champion?.id === state.latestQuestCompletedChampionId && p.champion?.questCompleted)?.champion)
    ?? state.players.map(p => eligible(p.champion)).find(Boolean) ?? null;
}

export function questPortrait(champion: ChampionState | undefined | null) {
  return champion?.questCompleted && champion.questCompletedPortraitEnabled && champion.questCompletedPortraitUrl
    ? champion.questCompletedPortraitUrl : champion?.imageUrl;
}

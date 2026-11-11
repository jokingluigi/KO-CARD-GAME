import {cosmeticImage,parseBattleSprite,skinKey,type CosmeticLoadout,type MatchCosmetics} from '@workspace/cosmetics';
import type { GameState } from '@/game';
import type { ChampionState } from '../game/champions/types';
import { canPresentBattleQuest } from './quest-presentation-policy';

/** Events identify a player, whereas the champion definition ID can be shared. */
export function questOwner(state: GameState, playerId?: string, championId?: string) {
  return playerId
    ? state.players.find(player => player.id === playerId)
    : state.players.find(player => player.champion?.id === championId && player.champion?.questCompleted);
}

export function questMusic(state: GameState | null | undefined,cosmetics?:MatchCosmetics) {
  if (!canPresentBattleQuest(state) || !state) return null;
  const eligible = (champion: ChampionState | undefined | null) => {
    if(champion?.questCompleted&&champion.selectedFinisherId){
      const player=state.players.find(p=>p.champion===champion),skin=player?cosmetics?.[player.id]?.skins?.[skinKey('CHAMPION_SKIN',champion.id)]:undefined;
      const selected=parseBattleSprite(skin?.imageAssets.__battle)?.finishers?.[champion.selectedFinisherId]?.music??parseBattleSprite(champion.presentationLines?.BATTLE_SPRITE)?.finishers?.[champion.selectedFinisherId]?.music;
      if(selected)return {assetUrl:selected.assetUrl,volume:selected.volume};
    }
    return champion?.questCompleted && champion.questCompleteAudioEnabled && champion.questCompleteAudioUrl
      ? { assetUrl: champion.questCompleteAudioUrl, volume: champion.questCompleteAudioVolume ?? 100 }
      : null;
  };
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
  const choice=champion?.questCompleted&&champion.selectedFinisherId?parseBattleSprite(champion.presentationLines?.BATTLE_SPRITE)?.finishers?.[champion.selectedFinisherId]:undefined;
  if(choice?.portrait)return choice.portrait.url;
  return champion?.questCompleted && champion.questCompletedPortraitEnabled && champion.questCompletedPortraitUrl
    ? champion.questCompletedPortraitUrl : champion?.imageUrl;
}

export function questPortraitForSkin(champion:ChampionState|null|undefined,loadout?:CosmeticLoadout){
 if(!champion)return null;
 const item=loadout?.skins?.[skinKey('CHAMPION_SKIN',champion.id)];
 const profile=champion.questCompleted&&champion.selectedFinisherId?parseBattleSprite(item?.imageAssets.__battle)?.finishers?.[champion.selectedFinisherId]?.portrait:undefined;
 return profile?.url??cosmeticImage(loadout,'CHAMPION_SKIN',champion.id,champion.questCompleted?'awakened':'portrait',questPortrait(champion));
}

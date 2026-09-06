import React from 'react';
import {
  getCardDefinition,
  getActiveAbility,
  canSelectAsAttacker,
  canUseActiveAbility,
  isCurrentPlayer,
  canUseChampionAbility,
  getPlayerSurvivalHealth,
  type BoardSlot as BoardSlotIndex,
  type CardInstance,
  type GameState,
} from '@/game';
import { ActionHistory } from './action-history';
import {
  AltInspectProvider,
  CardInspectContent,
  ChampionAbilityInspectContent,
  ChampionQuestInspectContent,
  Inspectable,
} from './alt-inspector';

interface GameStatePreviewProps {
  state: GameState;
  selectedCardId: string | null;
  selectedAttackerId: string | null;
  playError: string | null;
  onEndTurn: () => void;
  onSelectCard: (cardInstanceId: string) => void;
  onSelectSlot: (slot: BoardSlotIndex) => void;
  onSelectAttacker: (cardInstanceId: string) => void;
  onAttackWrestler: (cardInstanceId: string) => void;
  onAttackPlayer: () => void;
  onUseActive: () => void;
  onUseChampionAbility: () => void;
}

export function GameStatePreview({
  state,
  selectedCardId,
  selectedAttackerId,
  playError,
  onEndTurn,
  onSelectCard,
  onSelectSlot,
  onSelectAttacker,
  onAttackWrestler,
  onAttackPlayer,
  onUseActive,
  onUseChampionAbility,
}: GameStatePreviewProps) {
  if (!state || !state.players || state.players.length < 2) {
    return <div className="flex h-screen items-center justify-center bg-black font-sans text-white">게임을 초기화하는 중입니다...</div>;
  }

  const me = state.players[0];
  const opp = state.players[1];
  
  const isMyTurn = state.activePlayerId === me.id;
  
  const selectedBoardCard = me.board.find(
    (card) => card?.instanceId === selectedAttackerId,
  );
  
  const canShowActive =
    selectedBoardCard !== undefined &&
    selectedBoardCard !== null &&
    getActiveAbility(selectedBoardCard) !== undefined;
    
  const canUseActive =
    selectedBoardCard !== undefined &&
    selectedBoardCard !== null &&
    canUseActiveAbility(state, me.id, selectedBoardCard.instanceId);
    
  const canEndTurn = isCurrentPlayer(state, me.id);
  const canUseChampion = canUseChampionAbility(state, me.id);
  const mySurvivalHealth = getPlayerSurvivalHealth(state, me.id);
  const opponentSurvivalHealth = getPlayerSurvivalHealth(state, opp.id);
  const championUnavailableReason = !isMyTurn
    ? '내 턴에만 사용할 수 있습니다.'
    : me.champion && me.currentGold < me.champion.abilityCost
      ? '현재 골드가 부족합니다.'
      : '현재 사용할 수 없습니다.';
  
  return (
    <AltInspectProvider>
    <div className="flex min-h-[100dvh] w-full flex-col overflow-x-hidden overflow-y-auto bg-neutral-950 font-sans text-neutral-100 selection:bg-primary selection:text-black md:overflow-hidden">
      <ActionHistory state={state} />
      
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a1a24_0%,_#050505_100%)]"></div>
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-1 flex-col justify-between pb-0 pt-2 md:h-[100dvh] md:min-h-0 md:pt-4">
         
         {/* TOP BAR: Opponent Info */}
         <div className="relative z-[90] h-24 shrink-0 px-2 md:h-32 md:px-4">
            {/* Opponent Hand: centered like the player's hand */}
            <div className="absolute left-1/2 top-0 z-[100] flex -translate-x-1/2 items-start -space-x-2 md:-space-x-4">
               {opp.hand.length === 0 ? (
                 <span className="text-xs font-bold text-neutral-600">손패 없음</span>
               ) : (
                 opp.hand.map((_, i) => (
                   <div key={`opp-hand-${i}`} className="relative flex h-14 w-10 rotate-2 transform items-center justify-center overflow-hidden rounded-sm border-2 border-neutral-600 bg-neutral-800 shadow-md transition-transform hover:-translate-y-1 hover:rotate-0 md:h-20 md:w-14">
                     <div className="absolute inset-1 border border-neutral-700/50"></div>
                     <div className="h-6 w-6 rotate-45 border border-neutral-700/50 md:h-8 md:w-8"></div>
                   </div>
                 ))
               )}
            </div>

            {/* Mirrored opponent HUD */}
            <div className="ml-auto flex w-24 flex-col items-end gap-1 md:w-48 md:gap-2">
              <div className="flex flex-row-reverse items-start gap-2 md:gap-3">
                <div
                  className={`group relative flex h-14 w-14 flex-col items-center justify-center rounded-sm border-2 bg-neutral-900 md:h-20 md:w-20 ${
                    selectedAttackerId ? 'cursor-crosshair border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'border-red-900'
                  }`}
                  onClick={selectedAttackerId ? onAttackPlayer : undefined}
                >
                  <span className="px-1 text-center text-[9px] font-black leading-tight text-red-300 md:text-[11px]">
                    {opp.champion?.name || '상대 챔피언'}
                  </span>
                  {selectedAttackerId && (
                    <div className="pointer-events-none absolute inset-0 z-10 bg-red-500/15" />
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="rounded border border-neutral-700 bg-neutral-900/80 px-2 py-1 text-right md:px-3">
                    <div className="text-[8px] font-bold text-neutral-500 md:text-[10px]">골드</div>
                    <div className="font-display text-sm font-black text-primary md:text-xl">{opp.currentGold}</div>
                  </div>
                  <div className="rounded border border-red-800 bg-red-950/80 px-2 py-1 text-right">
                    <div className="text-[7px] font-bold text-red-300 md:text-[9px]">챔피언 체력</div>
                    <div className="font-display text-sm font-black text-white md:text-lg">
                      {opponentSurvivalHealth} / {opp.champion?.maxHealth ?? 20}
                    </div>
                  </div>
                </div>
              </div>
              {opp.champion?.quest && (
                <Inspectable content={<ChampionQuestInspectContent champion={opp.champion} />}>
                  <div tabIndex={0} className="rounded border border-purple-900 bg-purple-950/70 px-2 py-1 text-[8px] font-bold text-purple-200 md:text-[10px]">
                    퀘스트 {opp.champion.questCompleted ? '완료' : `${opp.champion.questProgress}/${opp.champion.quest.requiredProgress}`}
                  </div>
                </Inspectable>
              )}
            </div>
         </div>

         {/* BOARDS AREA */}
         <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-2 md:gap-6 md:py-4">
            
            {/* Opponent Board */}
            <div className="flex w-full justify-center gap-2 md:gap-4">
               {opp.board.map((card, i) => (
                 <BoardSlot 
                   key={`opp-board-${i}`}
                   card={card}
                   isOpponent={true}
                   slotIndex={i as BoardSlotIndex}
                   selectable={false}
                   selected={false}
                   attackReady={false}
                   targetable={!!selectedAttackerId && !!card}
                   onClick={(id) => onAttackWrestler(id as string)}
                 />
               ))}
            </div>

            {/* My Board */}
            <div className="flex w-full justify-center gap-2 md:gap-4">
               {me.board.map((card, i) => (
                 <BoardSlot 
                   key={`me-board-${i}`}
                   card={card}
                   isOpponent={false}
                   slotIndex={i as BoardSlotIndex}
                   selectable={!!selectedCardId && !card}
                   selected={card?.instanceId === selectedAttackerId}
                   attackReady={!!card && canSelectAsAttacker(state, me.id, card.instanceId)}
                   targetable={false}
                   onClick={(idOrIdx) => {
                     if (typeof idOrIdx === 'string') onSelectAttacker(idOrIdx);
                     else onSelectSlot(idOrIdx as BoardSlotIndex);
                   }}
                 />
               ))}
            </div>
         </div>

          <aside className="absolute right-2 top-36 z-40 flex w-24 flex-col items-stretch gap-2 rounded border border-neutral-800 bg-black/85 p-2 shadow-2xl backdrop-blur-md md:fixed md:right-4 md:top-1/2 md:w-32 md:-translate-y-1/2 md:p-3">
            <div className="border-b border-neutral-800 pb-2 text-right">
              <div className="text-[9px] font-bold text-neutral-500 md:text-[10px]">현재 턴 {state.turn}</div>
              <div className={`text-xs font-black md:text-base ${isMyTurn ? 'text-primary' : 'text-red-400'}`}>
                {isMyTurn ? '내 턴' : '상대 턴'}
              </div>
            </div>
            {canShowActive && (
              <button
                type="button"
                disabled={!canUseActive}
                onClick={onUseActive}
                className="rounded border border-blue-600 bg-blue-900/70 px-2 py-2 text-[9px] font-bold text-blue-100 transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600 md:text-xs"
              >
                액티브
              </button>
            )}
            <button
              type="button"
              disabled={!canEndTurn}
              onClick={onEndTurn}
              className={`rounded px-2 py-2 text-[10px] font-black transition-all md:py-3 md:text-sm ${
                canEndTurn
                  ? 'bg-primary text-black shadow-[0_0_12px_rgba(234,179,8,0.3)] hover:bg-yellow-400'
                  : 'cursor-not-allowed bg-neutral-800 text-neutral-600'
              }`}
            >
              턴 종료
            </button>
            {playError && (
              <div className="absolute right-0 top-full mt-2 w-44 rounded border border-red-500 bg-red-950/95 px-3 py-2 text-[10px] font-bold text-red-200 shadow-xl">
                {playError}
              </div>
            )}
          </aside>

         {/* BOTTOM BAR: Player info & Hand */}
         <div className="relative z-[90] flex min-h-[160px] shrink-0 items-end justify-between px-2 pb-2 md:min-h-[220px] md:px-4 md:pb-4">
            
            {/* Player Stats & Champion */}
            <div className="z-[95] flex w-24 shrink-0 flex-col gap-1 md:w-48 md:gap-2">
               <div className="mb-1 flex flex-col rounded-r border-l-4 border-primary bg-neutral-900/60 px-2 py-1 shadow-sm md:py-2">
                  <span className="text-[8px] font-bold text-neutral-400 md:text-[10px]">골드</span>
                 <span className="font-display text-lg font-bold leading-none text-primary md:text-3xl">{me.currentGold}</span>
               </div>

               <div className="relative flex h-16 w-16 flex-col items-center justify-center rounded-sm border-2 border-blue-600 bg-neutral-900 shadow-[0_0_15px_rgba(37,99,235,0.2)] md:h-24 md:w-24">
                  <span className="px-1 text-center text-[9px] font-black leading-tight text-blue-400 md:text-[12px]">
                    {me.champion?.name || '내 챔피언'}
                  </span>
               </div>

               <div className="rounded border border-blue-800 bg-blue-950/80 px-2 py-1">
                 <div className="text-[7px] font-bold text-blue-300 md:text-[9px]">챔피언 체력</div>
                 <div className="font-display text-sm font-black text-white md:text-xl">
                   {mySurvivalHealth} / {me.champion?.maxHealth ?? 20}
                 </div>
               </div>

               {me.champion?.quest && (
                 <Inspectable content={<ChampionQuestInspectContent champion={me.champion} />}>
                   <div tabIndex={0} className="rounded border border-purple-900 bg-purple-950/70 px-2 py-1 text-[8px] font-bold text-purple-200 md:text-[10px]">
                     퀘스트 {me.champion.questCompleted ? '완료' : `${me.champion.questProgress}/${me.champion.quest.requiredProgress}`}
                   </div>
                 </Inspectable>
               )}

               {me.champion && (
                 <Inspectable
                   content={
                     <ChampionAbilityInspectContent
                       champion={me.champion}
                       available={canUseChampion}
                       unavailableReason={championUnavailableReason}
                     />
                   }
                 >
                   <button
                     disabled={!canUseChampion}
                     onClick={onUseChampionAbility}
                     className={`w-full rounded border py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all md:py-2 md:text-[11px] ${
                       canUseChampion
                       ? 'cursor-pointer border-blue-500 bg-blue-900/50 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.3)] hover:bg-blue-800 hover:text-white'
                       : 'cursor-not-allowed border-neutral-800 bg-neutral-900 text-neutral-600'
                     }`}
                   >
                     챔피언 능력 ({me.champion.abilityCost}G)
                   </button>
                 </Inspectable>
               )}
            </div>

            {/* Player Hand */}
             <div className="relative z-[100] flex h-full min-w-0 flex-1 items-end overflow-x-auto">
               <div className="relative z-[100] flex w-max justify-start gap-2 px-4 pb-3 md:mx-auto md:justify-center md:gap-0 md:-space-x-12">
                 {me.hand.length === 0 ? (
                    <span className="py-4 text-xs font-bold text-neutral-600">손패 없음</span>
                 ) : (
                    me.hand.map((card, i) => {
                      const isSelected = selectedCardId === card.instanceId;
                      const canAfford = isMyTurn && me.currentGold >= card.currentCost;
                      return (
                        <HandCard
                          key={`hand-${card.instanceId}-${i}`}
                          card={card}
                          isSelected={isSelected}
                          canAfford={canAfford}
                          onClick={() => onSelectCard(card.instanceId)}
                          style={{ zIndex: isSelected ? 50 : i }}
                        />
                      );
                    })
                 )}
               </div>
            </div>

            {/* Spacer for symmetry */}
            <div className="hidden w-0 shrink-0 md:block md:w-48"></div>

         </div>
      </div>
    </div>
    </AltInspectProvider>
  );
}

function HandCard({
  card,
  isSelected,
  canAfford,
  onClick,
  style,
}: {
  card: CardInstance;
  isSelected: boolean;
  canAfford: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  const def = getCardDefinition(card.definitionId);
  
  let containerClass = "w-[75px] h-[105px] md:w-[130px] md:h-[180px] rounded flex flex-col relative transition-all duration-200 select-none bg-neutral-800 border-2 hover:z-40 group overflow-visible origin-bottom ";
  
  if (isSelected) {
    containerClass += "border-primary -translate-y-8 md:-translate-y-12 shadow-[0_15px_30px_rgba(234,179,8,0.4)] z-50 cursor-pointer";
  } else if (!canAfford) {
    containerClass += "border-neutral-800 opacity-40 grayscale cursor-not-allowed";
  } else {
    containerClass += "border-blue-600/60 hover:border-blue-400 hover:-translate-y-4 shadow-[0_5px_15px_rgba(0,0,0,0.6)] hover:shadow-[0_10px_20px_rgba(59,130,246,0.3)] cursor-pointer";
  }

  return (
    <Inspectable content={<CardInspectContent card={card} />} className="relative shrink-0">
    <div className={containerClass} onClick={onClick} style={style} tabIndex={0}>
       <div className="absolute -left-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-blue-900 bg-blue-700 font-display text-xs font-bold text-white shadow md:-left-3 md:-top-3 md:h-8 md:w-8 md:text-sm">
         {card.currentCost}
       </div>
       
       <div className="flex h-6 flex-col justify-center rounded-t-sm border-b border-neutral-700 bg-neutral-800 px-1 py-1 text-center md:h-8">
         <div className="w-full truncate text-[8px] font-bold text-white md:text-[11px]">{def?.name}</div>
       </div>
       
       <div className="flex flex-1 flex-col justify-between overflow-hidden bg-neutral-950">
         <div className="flex flex-1 items-center justify-center opacity-30">
            <span className="transform -rotate-12 font-display text-[8px] tracking-wider text-neutral-500 md:text-[10px]">이미지 없음</span>
         </div>
         <div className="h-10 border-t border-neutral-800 bg-neutral-900/80 p-1 text-[7px] leading-tight text-neutral-300 md:h-16 md:p-1.5 md:text-[9px]">
           <span className="line-clamp-3">{def?.rulesText || '효과 없음'}</span>
         </div>
       </div>

       {def?.attack !== undefined && def?.health !== undefined && (
         <div className="absolute -bottom-2 -left-1 right-[-4px] z-20 flex justify-between">
            <div className="flex h-5 w-5 items-center justify-center rounded-sm border-2 border-yellow-700 bg-primary font-display text-[10px] font-bold text-black shadow-md md:h-7 md:w-7 md:text-sm">
               {card.currentAttack}
            </div>
            <div className="flex h-5 w-5 items-center justify-center rounded-sm border-2 border-red-800 bg-red-600 font-display text-[10px] font-bold text-white shadow-md md:h-7 md:w-7 md:text-sm">
               {card.currentHealth}
            </div>
         </div>
       )}
    </div>
    </Inspectable>
  );
}

function BoardSlot({
  card,
  isOpponent,
  slotIndex,
  selectable,
  selected,
  attackReady,
  targetable,
  onClick,
}: {
  card: CardInstance | null;
  isOpponent: boolean;
  slotIndex: BoardSlotIndex;
  selectable: boolean;
  selected: boolean;
  attackReady: boolean;
  targetable: boolean;
  onClick: (idOrIdx: string | BoardSlotIndex) => void;
}) {
  const isEmpty = !card;
  
  let containerClass = "w-[70px] h-[108px] md:w-[110px] md:h-[164px] rounded flex flex-col relative transition-all duration-200 select-none ";
  
  if (isEmpty) {
    containerClass += "border-2 border-dashed bg-neutral-900/30 items-center justify-center ";
    if (selectable) {
      containerClass += "border-primary/60 hover:border-primary hover:bg-primary/10 cursor-pointer animate-pulse";
    } else {
      containerClass += "border-neutral-800";
    }
  } else {
    containerClass += "bg-neutral-800 border-2 shadow-[0_5px_15px_rgba(0,0,0,0.5)] overflow-visible group ";
    if (selected) {
      containerClass += "border-primary -translate-y-2 md:-translate-y-4 shadow-[0_10px_20px_rgba(234,179,8,0.4)] z-20 cursor-pointer";
    } else if (targetable) {
      containerClass += "border-red-500 hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.6)] hover:-translate-y-1 cursor-crosshair z-10";
    } else if (attackReady) {
      containerClass += "border-blue-500 hover:border-blue-400 hover:-translate-y-1 hover:shadow-[0_5px_15px_rgba(59,130,246,0.4)] cursor-pointer z-10";
    } else {
      containerClass += "border-neutral-700 hover:border-neutral-500 " + (isOpponent ? "" : "cursor-pointer");
    }
  }

  if (isEmpty) {
    return (
      <div className={containerClass} onClick={selectable ? () => onClick(slotIndex) : undefined}>
         <span className="text-[9px] font-bold tracking-widest text-neutral-600 md:text-[11px]">{slotIndex + 1}구역</span>
      </div>
    );
  }

  const def = getCardDefinition(card.definitionId);
  const isDead = card.currentHealth <= 0;

  return (
    <Inspectable content={<CardInspectContent card={card} />} className="relative shrink-0">
    <div className={containerClass} onClick={() => onClick(card.instanceId)} tabIndex={0}>
       <div className="absolute -left-2 -top-2 z-30 flex h-6 w-6 items-center justify-center rounded-full border-2 border-blue-900 bg-blue-700 font-display text-[10px] font-bold text-white shadow-md md:-left-3 md:-top-3 md:h-8 md:w-8 md:text-sm">
         {card.currentCost}
       </div>
       <div className="flex h-5 w-full items-center justify-center overflow-hidden rounded-t-sm border-b border-neutral-700 bg-neutral-900 px-1 md:h-7">
         <span className="block w-full truncate text-center text-[8px] font-bold text-neutral-200 transition-colors group-hover:text-white md:text-[10px]">{def?.name}</span>
       </div>
       
       <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden rounded-b-sm bg-neutral-950">
         <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1">
            <span className="rotate-[-10deg] font-display text-[9px] font-bold text-neutral-800 md:text-xs">선수</span>
            <span className="line-clamp-3 text-center text-[7px] leading-tight text-neutral-500 md:text-[9px]">
              {def?.rulesText || '효과 없음'}
            </span>
          </div>
         
         {isDead && (
           <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-950/80">
             <span className="rotate-12 font-display text-2xl font-black text-red-500 drop-shadow-md md:text-3xl">KO</span>
           </div>
         )}

         {targetable && !isDead && (
           <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-red-500/10 transition-colors group-hover:bg-red-500/20">
             <div className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-500/50 opacity-0 transition-opacity group-hover:opacity-100">
               <div className="absolute h-full w-1 bg-red-500/50"></div>
               <div className="absolute h-1 w-full bg-red-500/50"></div>
             </div>
           </div>
         )}
         
         {attackReady && !selected && !isDead && (
           <div className="pointer-events-none absolute inset-0 z-30 animate-[pulse_2s_ease-in-out_infinite] bg-blue-500/10 group-hover:bg-blue-500/20"></div>
         )}
         
         {selected && !isDead && (
           <div className="pointer-events-none absolute inset-0 z-30 bg-primary/20"></div>
         )}
       </div>

       {/* Stats Flags */}
       <div className="absolute -bottom-2 -left-2 z-20 flex h-6 w-6 items-center justify-center rounded-sm border-2 border-yellow-800 bg-primary font-display text-[10px] font-bold text-black shadow-md transition-transform group-hover:scale-110 md:-bottom-3 md:-left-3 md:h-8 md:w-8 md:text-sm">
         {card.currentAttack}
       </div>
       <div className="absolute -bottom-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-sm border-2 border-red-900 bg-red-600 font-display text-[10px] font-bold text-white shadow-md transition-transform group-hover:scale-110 md:-bottom-3 md:-right-3 md:h-8 md:w-8 md:text-sm">
         {card.currentHealth}
       </div>
    </div>
    </Inspectable>
  );
}

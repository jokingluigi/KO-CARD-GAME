import {
  getCardDefinition,
  type BoardSlot as BoardSlotIndex,
  type CardInstance,
  type GameState,
} from '@/game';

interface GameStatePreviewProps {
  state: GameState;
  selectedCardId: string | null;
  playError: string | null;
  onEndTurn: () => void;
  onSelectCard: (cardInstanceId: string) => void;
  onSelectSlot: (slot: BoardSlotIndex) => void;
}

function getPlayerDisplayName(playerId: string): string {
  const playerNumber = playerId.match(/\d+$/)?.[0];
  return playerNumber ? `플레이어 ${playerNumber}` : playerId;
}

export function GameStatePreview({
  state,
  selectedCardId,
  playError,
  onEndTurn,
  onSelectCard,
  onSelectSlot,
}: GameStatePreviewProps) {
  // Safe destructure to prevent crashes if game is uninitialized
  if (!state || !state.players || state.players.length < 2) {
    return <div className="p-8 text-white font-mono flex items-center justify-center h-screen bg-black">게임을 초기화하는 중입니다...</div>;
  }

  // Assuming player1 is 'me' and player2 is 'opp' in this static preview
  const me = state.players[0];
  const opp = state.players[1];
  
  const isMyTurn = state.activePlayerId === me.id;
  const isOppTurn = state.activePlayerId === opp.id;
  
  return (
    <div className="w-full h-full min-h-[100dvh] bg-background text-foreground overflow-hidden flex flex-col relative font-sans selection:bg-primary selection:text-black">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden flex flex-col items-center justify-center">
         {/* Arena Dark Gradient */}
         <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800/10 via-background to-black"></div>
         
         {/* Arena Spotlights */}
         <div className="absolute top-[-10%] left-[10%] w-[15vw] h-[120vh] bg-blue-500/5 rotate-[30deg] blur-[80px] origin-top mix-blend-screen"></div>
         <div className="absolute top-[-10%] right-[10%] w-[15vw] h-[120vh] bg-red-500/5 rotate-[-30deg] blur-[80px] origin-top mix-blend-screen"></div>
         
         {/* Grid / LED Background Texture */}
         <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxyZWN0IHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgZmlsbD0ibm9uZSIvPgo8cGF0aCBkPSJNMCAwaDQwdjQwSDB6IiBmaWxsPSJub25lIi8+CjxwYXRoIGQ9Ik0wIDAuNWg0ME0wIDM5LjVoNDBNMC41IDB2NDBNMzkuNSAwdjQwIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPgo8L3N2Zz4=')] opacity-30"></div>

         {/* Jumbotron / LED Screen Simulation */}
         <div className="absolute top-4 w-[600px] max-w-[90vw] bg-black border-b-[3px] border-primary/40 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center py-2 opacity-90 z-0 rounded-b-xl overflow-hidden">
           {/* Scanlines effect */}
           <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjIiIGZpbGw9InJnYmEoMCwwLDAsMC41KSIvPjwvc3ZnPg==')] opacity-50 pointer-events-none"></div>
            <div className="text-primary/70 text-[10px] font-mono tracking-[0.4em] mb-1 relative z-10">메인 이벤트</div>
             <div className="text-white font-black text-xl md:text-2xl tracking-[0.12em] uppercase relative z-10 drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]">
               턴 {state.turn} · 현재{' '}
               {state.activePlayerId
                 ? getPlayerDisplayName(state.activePlayerId)
                 : '없음'}
             </div>
         </div>
      </div>

      {/* Main Game Surface */}
      <div className="relative z-10 flex-1 flex flex-col justify-between w-full max-w-7xl mx-auto px-4 py-4 md:py-6 h-full">
         
         {/* Top: Opponent Area */}
         <div className="flex justify-between items-start w-full relative z-20">
            {/* Opponent Info (Left side) */}
            <div className="flex flex-col gap-2 w-32 md:w-48">
              <div className="flex -space-x-4 mt-4">
                 {opp.hand.length > 0 ? (
                   opp.hand.map((_, i) => (
                     <div key={`opp-hand-${i}`} className="w-10 h-14 md:w-12 md:h-16 bg-[#111] border-[2px] border-zinc-700 rounded-sm shadow-[0_4px_10px_rgba(0,0,0,0.8)] flex items-center justify-center relative transform -rotate-3 transition-transform hover:rotate-0 hover:z-10 hover:-translate-y-2">
                        <div className="absolute inset-1 border border-zinc-800/80"></div>
                        <div className="w-3 h-3 md:w-4 md:h-4 bg-zinc-800 transform rotate-45"></div>
                     </div>
                   ))
                 ) : (
                   <div className="text-zinc-600 text-xs font-mono">손패 없음</div>
                 )}
              </div>
              <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase">
                 상대 손패: {opp.hand.length}장
              </div>
            </div>

            {/* Opponent Champion */}
            <div className="flex flex-col items-center justify-start relative group mt-2 md:mt-6">
              {isOppTurn && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-red-500/15 blur-2xl rounded-full pointer-events-none"></div>
              )}
              <div className="w-20 h-20 md:w-28 md:h-28 rounded-full border-4 border-red-900 bg-red-950/60 flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(220,38,38,0.2)] relative z-10 backdrop-blur-md">
                 <span className="text-red-500/50 text-[10px] md:text-xs font-black italic tracking-tighter">상대</span>
              </div>
              <div className="absolute -bottom-3 bg-black border-[3px] border-red-800 text-white px-4 md:px-5 py-0.5 md:py-1 rounded-full font-black text-base md:text-xl shadow-[0_5px_15px_rgba(0,0,0,0.8)] flex items-center gap-1.5 z-20">
                  <span className="text-red-500 text-[10px] md:text-xs">체력</span> {opp.health}
              </div>
            </div>

            {/* Opponent Gold (Right side) */}
            <div className="flex flex-col items-end gap-1 mt-4 w-32 md:w-48">
               <div className="bg-black/80 border border-primary/30 py-1 px-3 md:py-1.5 md:px-4 rounded-lg flex items-center gap-2 backdrop-blur-md shadow-lg">
                  <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-primary/10 border border-primary/60 flex items-center justify-center">
                     <div className="w-2 h-2 bg-primary/80 transform rotate-45"></div>
                  </div>
                  <span className="text-primary/90 font-mono text-base md:text-xl font-bold leading-none mt-1">
                     {opp.currentGold}G
                  </span>
               </div>
               <div className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase">
                 상대 골드
               </div>
            </div>
         </div>

         {/* Center: The Ring (Battle Board) */}
         <div className="flex-1 my-4 md:my-6 relative flex flex-col items-center justify-center w-full max-w-5xl mx-auto">
            {/* The Ring Container */}
            <div className={`w-full max-w-[850px] aspect-[2/1] md:aspect-auto md:h-[460px] bg-black/40 border-[2px] border-zinc-800 rounded-xl flex flex-col justify-between p-4 md:p-8 shadow-2xl relative transition-all duration-700 backdrop-blur-sm ${isMyTurn ? 'shadow-[0_0_50px_rgba(37,99,235,0.15)] border-blue-900/50' : isOppTurn ? 'shadow-[0_0_50px_rgba(220,38,38,0.15)] border-red-900/50' : ''}`}>
               
               {/* Ring Ropes/Canvas Effects */}
               <div className="absolute inset-3 border-[1px] border-white/5 rounded-lg pointer-events-none"></div>
               <div className="absolute inset-5 border-[1px] border-white/[0.03] rounded-lg pointer-events-none"></div>
               
               {/* Center Decal */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 md:w-64 md:h-64 border-4 border-white rounded-full flex items-center justify-center transform -skew-x-12">
                     <span className="text-[100px] md:text-[140px] font-black italic tracking-tighter text-white">KO</span>
                  </div>
               </div>

               {/* Opponent Field */}
               <div className="flex justify-center gap-3 md:gap-6 w-full relative z-10 mb-2 md:mb-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <BoardSlot key={`opp-slot-${i}`} slot={opp.board && opp.board[i]} isOpponent={true} />
                  ))}
               </div>

               {/* Divider Line */}
               <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-zinc-800/80 to-transparent my-auto absolute top-1/2 left-0 -translate-y-1/2"></div>

               {/* Player Field */}
               <div className="flex justify-center gap-3 md:gap-6 w-full relative z-10 mt-2 md:mt-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                     <BoardSlot
                       key={`my-slot-${i}`}
                       slot={me.board[i]}
                       isOpponent={false}
                       slotIndex={i as BoardSlotIndex}
                       selectable={selectedCardId !== null}
                       onSelect={onSelectSlot}
                     />
                  ))}
               </div>
            </div>

            {/* End Turn Button - Right aligned, vertically centered */}
            <div className="absolute right-0 md:-right-12 lg:-right-24 top-1/2 -translate-y-1/2 z-30 flex justify-end">
              <button 
                disabled={!state.activePlayerId}
                onClick={onEndTurn}
                className={`w-24 h-24 md:w-32 md:h-32 rounded-full border-[4px] flex items-center justify-center transform -skew-x-6 transition-all duration-300 font-black text-sm md:text-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-md uppercase tracking-wider
                  ${state.activePlayerId
                    ? 'border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:scale-110 shadow-[0_0_30px_rgba(234,179,8,0.3)] cursor-pointer' 
                    : 'border-zinc-800 bg-black/60 text-zinc-600 cursor-not-allowed opacity-80'
                  }
                `}
              >
                턴 종료
              </button>
            </div>
         </div>

         {/* Bottom: Player Area */}
         <div className="flex justify-between items-end w-full relative h-[180px] md:h-[220px] z-30">
            {/* Player Utility Info (Left side) */}
            <div className="flex flex-col items-start justify-end h-full pb-4 md:pb-8 gap-4 w-32 md:w-48">
               <button className="w-12 h-12 md:w-16 md:h-16 rounded-full border-[3px] border-blue-600/80 bg-black/60 flex items-center justify-center text-blue-400 hover:bg-blue-900/40 hover:border-blue-400 transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] group cursor-pointer backdrop-blur-sm" title="챔피언 능력">
                  <span className="text-[10px] md:text-xs font-black tracking-widest uppercase group-hover:scale-110 transition-transform">능력</span>
               </button>
               
               <div className="bg-black/80 border border-zinc-800 px-3 py-1.5 rounded flex items-center gap-2 backdrop-blur-md hidden md:flex opacity-60">
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                  <span className="text-zinc-400 text-[10px] font-mono">퀘스트 대기중</span>
               </div>
            </div>

            {/* Player Hand - Arc Layout */}
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 flex justify-center items-end h-[160px] md:h-[200px] w-full max-w-[700px] pointer-events-none">
               <div className="relative flex justify-center w-full h-full pointer-events-auto">
                 {me.hand && me.hand.length > 0 ? (
                   me.hand.map((card, i) => {
                     const total = me.hand.length;
                     // Wider arc calculation
                     const arcSpread = Math.min(80, total * 10); 
                     const startAngle = -(arcSpread / 2);
                     const angleStep = total > 1 ? arcSpread / (total - 1) : 0;
                     const rotate = total > 1 ? startAngle + (i * angleStep) : 0;
                     
                     // Quadratic curve for Y offset
                     const centerIdx = (total - 1) / 2;
                     const distFromCenter = Math.abs(i - centerIdx);
                     const translateY = Math.pow(distFromCenter, 2) * 3 + 15;
                     
                     // X offset to stack them closer together
                     const translateX = (i - centerIdx) * 50; // overlap amount
                     
                     return (
                        <button
                         key={`my-hand-${i}`} 
                          type="button"
                          onClick={() => onSelectCard(card.instanceId)}
                          className={`absolute bottom-0 origin-bottom transition-all duration-300 hover:z-50 group cursor-pointer ${
                            selectedCardId === card.instanceId
                              ? 'z-50 drop-shadow-[0_0_18px_rgba(234,179,8,0.9)]'
                              : ''
                          }`}
                         style={{
                           transform: `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotate}deg)`,
                           zIndex: i,
                         }}
                        >
                         <div className="transition-transform duration-200 group-hover:-translate-y-24 group-hover:scale-[1.25] group-hover:rotate-0 drop-shadow-2xl">
                           <HandCard card={card} />
                          </div>
                        </button>
                     );
                   })
                 ) : (
                   <div className="absolute bottom-8 text-zinc-600 text-sm font-mono tracking-widest uppercase">
                     손패 없음
                   </div>
                 )}
               </div>
                {playError && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-[60] bg-red-950/95 border border-red-600 text-red-100 px-3 py-1 rounded text-xs font-bold whitespace-nowrap">
                    {playError}
                  </div>
                )}
            </div>

            {/* Player Champion & Gold (Right side) */}
            <div className="flex flex-col items-end gap-3 pb-2 md:pb-4 w-32 md:w-48">
              {/* Gold */}
              <div className="flex flex-col items-end gap-1 w-full relative z-30">
                 <div className="bg-black/90 border-2 border-primary/60 py-2 px-3 md:py-3 md:px-5 rounded-lg flex items-center justify-between w-full backdrop-blur-md shadow-[0_10px_20px_rgba(0,0,0,0.8),_0_0_25px_rgba(234,179,8,0.15)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-[100px] pointer-events-none"></div>
                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary/20 border-2 border-primary/80 flex items-center justify-center shadow-[0_0_10px_var(--color-primary)]">
                       <div className="w-3 h-3 md:w-4 md:h-4 bg-primary transform rotate-45 rounded-[1px]"></div>
                    </div>
                    <div className="flex items-baseline gap-1 mt-1">
                       <span className="text-primary font-mono text-2xl md:text-4xl font-black leading-none drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]">{me.currentGold}G</span>
                    </div>
                 </div>
                 <div className="text-primary/60 text-[10px] font-mono tracking-widest uppercase">
                   보유 골드
                 </div>
              </div>

              {/* Champion Portrait */}
              <div className="flex flex-col items-center relative group mt-2">
                {isMyTurn && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-blue-500/15 blur-2xl rounded-full pointer-events-none"></div>
                )}
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg border-4 border-blue-700 bg-blue-950/60 flex items-center justify-center overflow-hidden shadow-[0_0_25px_rgba(37,99,235,0.3)] relative z-10 transform -skew-x-3 backdrop-blur-md transition-transform duration-300 group-hover:scale-105">
                  {/* Portrait Placeholder */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.1)_0%,_transparent_70%)] opacity-50"></div>
                  <span className="text-blue-500/40 text-xs md:text-sm font-black italic tracking-tighter relative z-10">나</span>
                </div>
                <div className="absolute -top-4 -right-4 md:-top-5 md:-right-5 bg-black border-[3px] border-blue-500 text-white w-12 h-12 md:w-16 md:h-16 rounded-full font-black text-xl md:text-2xl shadow-[0_5px_20px_rgba(0,0,0,0.8),_0_0_15px_rgba(37,99,235,0.5)] flex items-center justify-center z-20">
                   {me.health}
                </div>
              </div>
            </div>
         </div>
      </div>
    </div>
  );
}

function HandCard({ card }: { card: CardInstance }) {
  const definition = getCardDefinition(card.definitionId);
  const cost = definition?.cost ?? 0;
  const attack = definition?.attack;
  const health = definition?.health;
  const name = definition?.name ?? '알 수 없는 카드';
  const isWrestler = attack !== undefined && health !== undefined;
  const type = '선수';
  const desc = definition?.rulesText || '효과 없음';

  return (
    <div className="w-[130px] h-[180px] md:w-[160px] md:h-[220px] bg-[#0c0c0c] border-[2px] border-zinc-700 rounded-lg overflow-hidden flex flex-col shadow-[0_15px_30px_rgba(0,0,0,0.9)] relative transition-all group-hover:border-primary">
       
       {/* Cost Gem */}
       <div className="absolute top-0 left-0 bg-blue-900 border-r-[2px] border-b-[2px] border-zinc-700 w-10 h-10 md:w-12 md:h-12 rounded-br-xl flex items-center justify-center font-black text-lg md:text-xl text-white z-20 shadow-[2px_2px_10px_rgba(0,0,0,0.5)] before:content-[''] before:absolute before:inset-1 before:border before:border-blue-400/30 before:rounded-br-lg before:rounded-tl-md">
         {cost}
       </div>
       
       {/* Image Area */}
       <div className="h-[90px] md:h-[110px] bg-zinc-800 flex items-center justify-center relative overflow-hidden">
         <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c] to-transparent z-10"></div>
         {/* Texture */}
         <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMikiLz48L3N2Zz4=')] mix-blend-overlay"></div>
          <span className="text-zinc-600 text-[10px] md:text-xs font-black tracking-[0.2em] relative z-0">{type} 이미지</span>
       </div>

       {/* Text Area */}
       <div className="flex-1 p-2 flex flex-col items-center bg-gradient-to-b from-[#0c0c0c] to-zinc-900 relative z-20">
         <div className="text-center font-bold text-xs md:text-sm text-white w-full truncate border-b border-zinc-700/50 pb-1.5 mb-1.5 mt-1">
           {name}
         </div>
         <div className="text-[9px] md:text-[10px] text-zinc-400 text-center leading-snug line-clamp-3 w-full px-1 font-serif">
           {desc}
         </div>
       </div>

       {/* Stats (Wrestler Only) */}
       {isWrestler && (
         <div className="absolute bottom-1 left-1 right-1 flex justify-between px-1 z-30">
            <div className="bg-yellow-600 border border-yellow-800 w-8 h-8 md:w-9 md:h-9 rounded flex items-center justify-center text-sm md:text-base font-black text-white shadow-[0_2px_5px_rgba(0,0,0,0.8)] before:content-[''] before:absolute before:inset-0.5 before:border before:border-yellow-300/30 before:rounded-sm">
              {attack ?? 2}
            </div>
            <div className="bg-red-700 border border-red-900 w-8 h-8 md:w-9 md:h-9 rounded flex items-center justify-center text-sm md:text-base font-black text-white shadow-[0_2px_5px_rgba(0,0,0,0.8)] before:content-[''] before:absolute before:inset-0.5 before:border before:border-red-400/30 before:rounded-sm">
              {health ?? 3}
            </div>
         </div>
       )}
    </div>
  );
}

function BoardSlot({
  slot,
  isOpponent,
  slotIndex,
  selectable = false,
  onSelect,
}: {
  slot: CardInstance | null;
  isOpponent: boolean;
  slotIndex?: BoardSlotIndex;
  selectable?: boolean;
  onSelect?: (slot: BoardSlotIndex) => void;
}) {
  if (!slot) {
    return (
      <button
        type="button"
        disabled={isOpponent || !selectable || slotIndex === undefined}
        onClick={() => slotIndex !== undefined && onSelect?.(slotIndex)}
        className={`w-[80px] h-[110px] md:w-[110px] md:h-[150px] border-[2px] border-dashed rounded-lg bg-black/20 flex items-center justify-center transition-colors group relative overflow-hidden ${
          selectable && !isOpponent
            ? 'border-primary/80 hover:bg-primary/10 cursor-pointer'
            : 'border-zinc-700/40 cursor-default'
        }`}
      >
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors"></div>
        <span className="text-zinc-800 text-[9px] md:text-[10px] font-mono group-hover:text-zinc-600 transition-colors uppercase tracking-[0.2em]">
          빈 슬롯
        </span>
      </button>
    );
  }

  const definition = getCardDefinition(slot.definitionId);
  const attack = slot.currentAttack;
  const health = slot.currentHealth;
  const name = definition?.name ?? '선수';

  return (
    <div className="w-[80px] h-[110px] md:w-[110px] md:h-[150px] bg-[#121212] border-[2px] border-zinc-600 rounded-lg relative flex flex-col shadow-[0_5px_15px_rgba(0,0,0,0.6)] group hover:border-primary transition-colors cursor-pointer hover:-translate-y-1">
       
       {/* Highlight Overlay */}
       <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/5 transition-opacity pointer-events-none z-30 rounded-lg"></div>

       {/* Image Area */}
       <div className="flex-1 bg-zinc-800 flex items-center justify-center overflow-hidden relative rounded-t-md">
         <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#121212] opacity-90 z-10"></div>
          <span className="text-zinc-600 text-[9px] md:text-[10px] font-black z-0 tracking-widest">이미지</span>
       </div>

       {/* Name Ribbon */}
       <div className="h-7 md:h-8 bg-[#1a1a1a] border-t border-zinc-700 flex items-center justify-center px-2 z-10 rounded-b-md">
         <span className="text-white text-[10px] md:text-xs font-bold truncate tracking-wide">{name}</span>
       </div>

       {/* Stats Flags */}
       <div className="absolute -bottom-2 -left-2 bg-yellow-600 border border-yellow-800 w-7 h-7 md:w-8 md:h-8 rounded flex items-center justify-center text-xs md:text-sm font-black text-white shadow-[0_3px_6px_rgba(0,0,0,0.8)] z-30">
         {attack}
       </div>
       <div className="absolute -bottom-2 -right-2 bg-red-700 border border-red-900 w-7 h-7 md:w-8 md:h-8 rounded flex items-center justify-center text-xs md:text-sm font-black text-white shadow-[0_3px_6px_rgba(0,0,0,0.8)] z-30">
         {health}
       </div>
    </div>
  );
}

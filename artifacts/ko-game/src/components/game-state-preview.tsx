import type { GameState, PlayerState } from '@/game';

export function GameStatePreview({ state }: { state: GameState }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Overview Card */}
      <div className="lg:col-span-1 flex flex-col gap-4">
        <div className="bg-card border border-card-border rounded-lg p-6 shadow-xl flex flex-col gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-secondary/5 rounded-tr-[80px] pointer-events-none" />
          
          <div className="flex flex-col gap-1 z-10">
            <h2 className="text-sm font-bold text-muted-foreground tracking-widest uppercase mb-2">Engine Core</h2>
            <div className="flex items-baseline justify-between border-b border-border/50 pb-2">
              <span className="text-muted-foreground font-mono text-sm">gameId</span>
              <span className="text-foreground font-mono text-sm font-semibold">{state.gameId}</span>
            </div>
            <div className="flex items-baseline justify-between border-b border-border/50 pb-2 pt-2">
              <span className="text-muted-foreground font-mono text-sm">globalTurn</span>
              <span className="text-primary font-mono text-lg font-bold">{state.turn}</span>
            </div>
            <div className="flex items-baseline justify-between pt-2">
              <span className="text-muted-foreground font-mono text-sm">activePlayer</span>
              <span className="text-secondary font-mono text-sm">
                {state.activePlayerId ? state.activePlayerId : '<none>'}
              </span>
            </div>
          </div>
          
          <div className="bg-background border border-border/50 rounded p-4 overflow-x-auto z-10">
             <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
               {JSON.stringify({ 
                 gameId: state.gameId, 
                 turn: state.turn, 
                 activePlayerId: state.activePlayerId 
               }, null, 2)}
             </pre>
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
        {state.players.map((player) => (
          <PlayerCard key={player.id} player={player} />
        ))}
      </div>
    </div>
  );
}

function PlayerCard({ player }: { player: PlayerState }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-6 shadow-xl flex flex-col gap-5 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-background/0 via-background/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      
      <div className="flex justify-between items-center border-b border-border/50 pb-3 z-10">
        <h3 className="font-mono text-lg font-bold text-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_var(--color-secondary)] inline-block" />
          {player.id}
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5" title="Health">
            <div className="w-2 h-2 rounded-full bg-destructive shadow-[0_0_8px_var(--color-destructive)]" />
            <span className="font-mono font-bold text-foreground">
              {player.health}<span className="text-muted-foreground text-xs font-normal">/{player.maxHealth}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5" title="Gold">
            <div className="w-2 h-2 rounded-sm bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)] transform rotate-45" />
            <span className="font-mono font-bold text-foreground">
              {player.currentGold}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 z-10">
        <Stat label="Deck" value={player.deck.length} />
        <Stat label="Hand" value={player.hand.length} />
        <Stat label="Graveyard" value={player.graveyard.length} />
        <Stat label="Removed" value={player.removedFromGame.length} />
        <Stat label="Fatigue" value={player.fatigueCount} />
        <Stat label="Personal Turn" value={player.personalTurn} />
      </div>

      <div className="flex flex-col gap-2 mt-2 z-10">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Board Slots</span>
        <div className="flex gap-2 w-full h-16">
          {player.board.map((slot, i) => (
            <div 
              key={i} 
              className="flex-1 border border-dashed border-border/50 rounded bg-background/30 flex items-center justify-center transition-colors hover:border-primary/50"
            >
              {slot ? (
                <div className="w-full h-full bg-accent text-accent-foreground text-xs flex items-center justify-center font-mono">Card</div>
              ) : (
                <span className="text-muted-foreground/30 font-mono text-xs text-center">Empty</span>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {player.champion ? (
        <div className="mt-2 p-3 border border-secondary/30 bg-secondary/5 rounded text-sm font-mono flex items-center justify-between z-10">
          <span className="text-secondary-foreground font-semibold">Champion</span>
          <span className="text-muted-foreground">Present</span>
        </div>
      ) : (
        <div className="mt-2 p-3 border border-dashed border-border/40 bg-background/20 rounded text-sm font-mono flex items-center justify-center z-10">
          <span className="text-muted-foreground/60 text-[10px] uppercase tracking-widest">No Champion Present</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1 bg-background/40 p-2.5 rounded border border-border/30 hover:border-border/60 transition-colors">
      <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono truncate">{label}</span>
      <span className="text-sm font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
}

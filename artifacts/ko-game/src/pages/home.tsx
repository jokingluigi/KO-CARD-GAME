import { initialGameState } from '@/game';
import { GameStatePreview } from '@/components/game-state-preview';

export default function Home() {
  return (
    <div className="min-h-screen w-full flex flex-col p-6 md:p-12 gap-8 max-w-7xl mx-auto">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-primary uppercase font-mono shadow-primary/20 drop-shadow-md">
          KO Prototype Ready
        </h1>
        <p className="text-muted-foreground font-mono text-sm max-w-2xl">
          Engine initialized. Local game state is mounted and ready for development.
        </p>
      </header>

      <main className="flex-1 w-full">
        <GameStatePreview state={initialGameState} />
      </main>
    </div>
  );
}

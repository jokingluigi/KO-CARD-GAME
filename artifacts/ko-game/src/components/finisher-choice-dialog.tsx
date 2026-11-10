import { useState } from "react";
import type { GameState } from "@/game/types/game-state";
import { finisherTargetId } from "@/game/champions/finisher-preparation";
import { CardRenderer } from "./card-renderer";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function FinisherChoiceDialog({
  state,
  playerId,
  onConfirm,
}: {
  state: GameState;
  playerId: string;
  onConfirm: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const champion = state.players.find((p) => p.id === playerId)?.champion;
  const options =
    champion?.quest?.finisherChoices?.filter((o) =>
      state.targetingState?.finisherChoice?.optionIds.includes(o.id),
    ) ?? [];
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="[&>.ko-game-dialog-close]:hidden max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle>피니셔를 선택하세요</DialogTitle>
        <DialogDescription>
          같은 효과 처리에서 여러 준비 조건을 달성했어요. 하나를 확정하면
          나머지는 이번 대전에서 비활성화돼요.
        </DialogDescription>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {options.map((option) => {
            const card = state.cardPool?.find(
              (d) => d.id === option.cardDefinitionId,
            );
            return (
              <button
                type="button"
                key={option.id}
                aria-pressed={selected === option.id}
                className={`min-w-0 rounded border p-2 text-left ${selected === option.id ? "border-amber-300 bg-amber-950/50" : "border-neutral-700"}`}
                onClick={() => setSelected(option.id)}
              >
                {card && (
                  <CardRenderer
                    cardId={card.id}
                    cosmeticOwnerId={playerId}
                    name={card.name}
                    cardType={card.cardType}
                    cost={card.cost}
                    attack={card.attack}
                    health={card.health}
                    rarity={card.rarity}
                    rulesText={card.rulesText}
                    imageUrl={card.imageUrl ?? null}
                    keywords={card.keywords}
                    isChampionToken={card.isChampionToken}
                    size="hand"
                    className="!h-auto !w-full aspect-[5/7]"
                  />
                )}
                <strong className="mt-2 block text-amber-200">
                  {option.name}
                </strong>
                <span className="block text-xs">{option.description}</span>
                <span className="mt-2 block whitespace-pre-line text-sm">
                  {card?.rulesText}
                </span>
              </button>
            );
          })}
        </div>
        <p role="status">
          {options.find((o) => o.id === selected)?.name ??
            "받을 피니셔 하나를 선택하세요."}
        </p>
        <button
          type="button"
          className="min-h-12 rounded bg-amber-300 px-4 font-bold text-black disabled:opacity-40"
          disabled={!selected}
          onClick={() => selected && onConfirm(finisherTargetId(selected))}
        >
          선택한 피니셔 확정
        </button>
      </DialogContent>
    </Dialog>
  );
}

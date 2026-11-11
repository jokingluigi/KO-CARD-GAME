import { useState } from "react";
import type { GameState } from "@/game/types/game-state";
import { CardRenderer } from "./card-renderer";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
/** The authoritative frame owns candidates and multi-selection; only the one-card highlight is local. */
export function BattleCardChoiceDialog({
  state,
  playerId,
  onSelect,
}: {
  state: GameState;
  playerId: string;
  onSelect: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    pending = state.targetingState;
  if (!pending) return null;
  const discovery = Boolean(pending.catalogChoice),
    candidates = discovery
      ? pending.catalogChoice!.definitionIds.map((id) => ({
          id: "catalog:" + id,
          definition:
            state.cardPool?.find((d) => d.id === id) ??
            state.minionACardPool?.find((d) => d.id === id),
          instance: undefined,
        }))
      : pending.validTargetIds.map((id) => {
          const instance =
            state.players
              .flatMap((p) => p.board)
              .find((c) => c?.instanceId === id) ?? undefined;
          return {
            id,
            instance,
            definition: state.cardPool?.find(
              (d) => d.id === instance?.definitionId,
            ),
          };
        });
  const ids = discovery
    ? selected
      ? [selected]
      : []
    : pending.selectedTargetIds;
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        overlayClassName="ko-card-choice-backdrop z-[200] bg-black/50"
        className="ko-battle-card-choice z-[201] [&>.ko-game-dialog-close]:hidden max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle>
          {discovery ? "가져올 카드 선택" : "피해를 줄 선수 선택"}
        </DialogTitle>
        <DialogDescription>
          {discovery
            ? "제시된 후보 중 한 장을 골라 손패에 추가합니다."
            : "원하는 선수를 한 장 이상 선택한 뒤 효과를 발동하세요."}
        </DialogDescription>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {candidates.map(({ id, definition, instance }) => (
            <button
              key={id}
              type="button"
              aria-pressed={ids.includes(id)}
              className={`min-w-0 rounded border p-2 text-left ${ids.includes(id) ? "border-amber-300 bg-amber-950/50" : "border-neutral-700"}`}
              onClick={() => (discovery ? setSelected(id) : onSelect(id))}
            >
              {!discovery && instance && (
                <span className="mb-1 block text-xs text-amber-100">
                  {state.players.find((p) =>
                    p.board.some((c) => c?.instanceId === id),
                  )?.id === playerId
                    ? "내 선수"
                    : "상대 선수"}{" "}
                  · {(instance.boardSlot ?? 0) + 1}구역
                </span>
              )}
              {definition && (
                <CardRenderer
                  cardId={definition.id}
                  name={definition.name}
                  cardType={definition.cardType}
                  rarity={definition.rarity}
                  cost={instance?.currentCost ?? definition.cost}
                  attack={instance?.currentAttack ?? definition.attack}
                  health={instance?.currentHealth ?? definition.health}
                  rulesText={definition.rulesText}
                  keywords={definition.keywords}
                  imageUrl={definition.imageUrl ?? null}
                  imageDisplaySettings={{imageDisplayMode:definition.imageDisplayMode,imageScale:definition.imageScale,imagePositionX:definition.imagePositionX,imagePositionY:definition.imagePositionY}}
                  isChampionToken={definition.isChampionToken}
                  size="hand"
                  className="!h-auto !w-full aspect-[5/7]"
                />
              )}
              <strong className="block">{definition?.name ?? id}</strong>
            </button>
          ))}
        </div>
        <p role="status">{ids.length}장 선택</p>
        <button
          type="button"
          className="min-h-12 rounded bg-amber-300 p-3 font-bold text-black disabled:opacity-40"
          disabled={ids.length < pending.minTargets}
          onClick={() => onSelect(discovery ? selected! : "effect:confirm")}
        >
          {discovery ? "선택한 카드 받기" : "선택한 선수에게 효과 발동"}
        </button>
      </DialogContent>
    </Dialog>
  );
}

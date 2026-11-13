import { useState } from "react";
import type { GameState } from "@/game/types/game-state";
import { CardRenderer } from "./card-renderer";
import { CardDetailDialog, type CardDetailRecord } from "./card-detail-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

/** Selection is local until the explicit confirmation sends the normal server action. */
export function HandOverflowDialog({
  state,
  playerId,
  onConfirm,
}: {
  state: GameState;
  playerId: string;
  onConfirm: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<CardDetailRecord | null>(null);
  const owner = state.players.find((p) => p.id === playerId)!,
    pending = state.targetingState?.handAddition;
  const incoming = pending?.cards[0]?.card;
  const definitions = state.cardPool ?? [];
  const describe = (id: string) => {
    const c = owner.hand.find((c) => c.instanceId === id)!,
      d = definitions.find((d) => d.id === c.definitionId);
    return {
      id: c.definitionId,
      name: d?.name ?? c.definitionId,
      cardType: c.cardType ?? "WRESTLER",
      cost: c.currentCost,
      attack: c.currentAttack,
      health: c.currentHealth,
      text: d?.rulesText ?? "",
      lore: d?.lore,
      rarity: d?.rarity ?? "NORMAL",
      imageUrl: d?.imageUrl ?? null,
      imageDisplayMode: d?.imageDisplayMode ?? "CONTAIN",
      imageScale: d?.imageScale ?? 1,
      imagePositionX: d?.imagePositionX ?? 50,
      imagePositionY: d?.imagePositionY ?? 50,
      keywords: c.keywords,
      isToken: c.isToken,
      isChampionToken: c.isChampionToken,
    };
  };
  return (
    <>
      <Dialog open onOpenChange={() => {}}>
        <DialogContent
          className="flex w-[calc(100vw-24px)] max-w-3xl flex-col gap-3"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogTitle>손패가 가득 찼어요</DialogTitle>
          <DialogDescription>
            ‘
            {definitions.find((d) => d.id === incoming?.definitionId)?.name ??
              "새 카드"}
            ’를 받으려면 기존 손패에서 1장을 골라 버리세요. 버린 카드는 묘지로
            이동해요.
            <span className="mt-1 block text-amber-200">추가 대기 {pending?.cards.length ?? 0}장 · 한 장씩 순서대로 받아요.</span>
          </DialogDescription>
          <div
            className="grid max-h-[50dvh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4"
            aria-label="버릴 손패 선택"
          >
            {owner.hand.map((c) => {
              const d = describe(c.instanceId);
              return (
                <div key={c.instanceId} className="min-w-0">
                  <button
                    type="button"
                    aria-label={`${d.name} 선택`}
                    aria-pressed={selected === c.instanceId}
                    className={`block w-full rounded border-2 p-1 ${selected === c.instanceId ? "border-amber-300 bg-amber-300/10" : "border-neutral-700"}`}
                    onClick={() => setSelected(c.instanceId)}
                  >
                    <CardRenderer
                      {...d}
                      cardId={d.id}
                      cosmeticOwnerId={playerId}
                      imageDisplaySettings={{
                        imageDisplayMode: d.imageDisplayMode,
                        imageScale: d.imageScale,
                        imagePositionX: d.imagePositionX,
                        imagePositionY: d.imagePositionY,
                      }}
                      rulesText={d.text}
                      cardType={c.cardType}
                      rarity={d.rarity}
                      size="hand"
                      className="!h-auto !w-full aspect-[5/7]"
                    />
                    <span className="block text-xs">
                      {selected === c.instanceId ? "선택됨" : "선택"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="min-h-11 w-full text-xs text-amber-200"
                    onClick={() => setDetail(d)}
                  >
                    확대·상세
                  </button>
                </div>
              );
            })}
          </div>
          <p role="status" className="text-sm">
            {selected
              ? `‘${describe(selected).name}’ 1장을 버리고 새 카드를 받아요.`
              : "버릴 카드 한 장을 선택하세요."}
          </p>
          <button
            type="button"
            disabled={!selected}
            className="min-h-11 rounded bg-amber-300 p-3 font-bold text-black disabled:opacity-40"
            onClick={() => selected && onConfirm(selected)}
          >
            선택한 카드 버리고 받기
          </button>
          <style>{`.ko-game-dialog:has([aria-label="버릴 손패 선택"]) > .ko-game-dialog-close {display:none}`}</style>
        </DialogContent>
      </Dialog>
      <CardDetailDialog
        card={detail}
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
      />
    </>
  );
}

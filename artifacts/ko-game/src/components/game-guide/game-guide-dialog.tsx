import { lazy, Suspense, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
const GameGuideContent = lazy(() => import("./game-guide-content"));
export function GameGuideDialogTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="min-h-11 w-full rounded border border-neutral-600 px-3 py-2 text-xs font-black text-neutral-100"
        onClick={() => setOpen(true)}
      >
        게임 도움말 · 규칙 찾기
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onEscapeKeyDown={(e) => e.stopPropagation()}
          overlayClassName="!z-[240]"
          className="!z-[250] max-h-[90dvh] w-[calc(100vw-24px)] max-w-3xl overflow-y-auto border-neutral-700 bg-neutral-950 text-white"
        >
          <DialogTitle>게임 도움말</DialogTitle>
          <DialogDescription>
            헷갈리는 판정과 조작을 찾아보세요.
          </DialogDescription>
          <Suspense fallback={<p role="status">도움말을 준비하고 있어요…</p>}>
            <GameGuideContent inBattle />
          </Suspense>
          <button
            type="button"
            className="min-h-11 rounded border border-neutral-600 px-4"
            onClick={() => setOpen(false)}
          >
            도움말 닫기
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

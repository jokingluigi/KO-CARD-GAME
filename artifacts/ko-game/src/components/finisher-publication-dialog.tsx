import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
export type FinisherPublicationCard = {
  id: string;
  name: string;
  version: number;
};
export function FinisherPublicationDialog({
  cards,
  onCancel,
  onConfirm,
}: {
  cards: FinisherPublicationCard[] | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={Boolean(cards?.length)}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent className="z-[160] max-h-[85dvh] overflow-y-auto border-amber-800 bg-slate-950 text-slate-100">
        <AlertDialogHeader>
          <AlertDialogTitle>피니셔 공개 후 연결 저장</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-300">
            기존 공개 챔피언에 연결하려는 아래 피니셔가 아직 미공개예요.
            확인하면 해당 카드 공개와 챔피언 변경 내용을 함께 저장합니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-48 space-y-2 overflow-y-auto">
          {cards?.map((card) => (
            <li key={card.id} className="rounded border border-slate-700 p-3">
              <strong>{card.name}</strong>
              <span className="ml-2 text-sm text-amber-300">미공개 → 공개</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-400">
          취소하면 공개하지 않고 현재 편집 내용을 그대로 유지합니다.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            편집으로 돌아가기
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            피니셔 공개하고 저장
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

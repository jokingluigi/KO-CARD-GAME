const steps = [
  { title: '승리 조건', detail: '상대 챔피언의 체력을 0으로 만들면 승리합니다. 아래쪽이 내 필드, 위쪽이 상대 필드입니다.' },
  { title: '카드 내기', detail: '손패에서 선수 카드를 고른 뒤 내 필드의 빈 구역을 누르세요. 카드의 비용만큼 골드를 사용합니다.' },
  { title: '주문 사용', detail: '손패의 주문 카드를 고르고 ‘사용’을 누르세요. 대상을 요구하는 주문이라면 이어서 대상을 선택합니다.' },
  { title: '공격하기', detail: '내 필드의 선수를 누르고 상대 선수나 챔피언을 누르세요. 카드 상세정보는 ⓘ 버튼으로 볼 수 있습니다.' },
  { title: '턴과 퀘스트', detail: '할 일을 마쳤다면 턴 종료를 누르세요. 챔피언의 퀘스트는 정해진 행동을 하면 진행되고 완료 시 보상을 받습니다.' },
  { title: '패드 조작', detail: '방향키 또는 스틱으로 이동, A/×로 선택, B/○로 취소, X/□로 카드 정보, START로 설정을 엽니다.' },
];

export function MatchTutorial({ step, onStepChange, onClose }: {
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}) {
  const current = steps[step]!;
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 px-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-label="경기 튜토리얼"
        className="w-full max-w-sm rounded-xl border border-amber-500/70 bg-neutral-950 p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between text-xs font-bold text-amber-300">
          <span>KO CARD GAME · {step + 1}/{steps.length}</span>
          <button type="button" aria-label="튜토리얼 닫기" onClick={onClose} className="rounded px-2 py-1 text-lg text-neutral-300">×</button>
        </div>
        <h2 className="mt-5 text-xl font-black">{current.title}</h2>
        <p className="mt-3 min-h-20 text-sm leading-6 text-neutral-200">{current.detail}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" disabled={step === 0} onClick={() => onStepChange(step - 1)}
            className="flex-1 rounded border border-neutral-600 px-3 py-2 text-sm disabled:opacity-40">이전</button>
          <button type="button" onClick={() => step + 1 === steps.length ? onClose() : onStepChange(step + 1)}
            className="flex-1 rounded bg-amber-400 px-3 py-2 text-sm font-black text-black">
            {step + 1 === steps.length ? '경기로 돌아가기' : '다음'}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Lore is plain editorial text, never effect/keyword markup. */
export function CardIntroduction({ lore }: { lore?: string | null }) {
  if (!lore?.trim()) return null;
  return (
    <section
      aria-label="카드 소개"
      data-testid="card-introduction"
      className="min-w-0 rounded-lg border border-amber-200/15 bg-amber-100/[0.03] p-4"
    >
      <h4 className="mb-3 text-xs font-bold tracking-wider text-amber-200/80">
        카드 소개
      </h4>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-neutral-300 [overflow-wrap:anywhere]">
        {lore}
      </p>
    </section>
  );
}

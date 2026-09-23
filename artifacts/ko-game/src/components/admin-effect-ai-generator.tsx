import { useState } from "react";

type EffectAiContext = "CHAMPION_ABILITY" | "QUEST_REWARD" | "UPGRADED_CHAMPION_ABILITY";
type ApplyMode = "replace" | "append";

type EffectAiDraft = {
  status: "READY";
  effectId: "STRUCTURED_EFFECTS_V1" | "SCRIPT_V1";
  effects: unknown[];
  scripts: unknown[];
  keywords: string[];
  preview: Array<{ label: string; value: string }>;
  effectConfig: { effects?: unknown[]; scripts?: unknown[] };
  structuredEffect: { effects?: unknown[]; scripts?: unknown[] };
  mechanicPlan: {
    execution: "STRUCTURED_EFFECTS_V1" | "SCRIPT_V1";
    triggers: string[];
    selections: string[];
    filters: string[];
    conditions: string[];
    memory: string[];
    schedule: string[];
    actions: string[];
    resultReferences: string[];
  };
};

type EffectAiClarification = {
  status: "NEEDS_CLARIFICATION";
  questions: string[];
};

export function AdminEffectAiGenerator({
  defaultText,
  sourceType,
  sourceId,
  cardType,
  effectContext,
  sourceName,
  existingEffectCount,
  onApply,
  onUnauthorized,
}: {
  defaultText: string;
  sourceType: "CARD" | "CHAMPION";
  sourceId?: string;
  cardType?: "WRESTLER" | "TECHNIQUE";
  effectContext?: EffectAiContext;
  sourceName?: string;
  existingEffectCount: number;
  onApply: (draft: EffectAiDraft, mode: ApplyMode) => void;
  onUnauthorized: () => void;
}) {
  const [text, setText] = useState(defaultText);
  const [draft, setDraft] = useState<EffectAiDraft | EffectAiClarification | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ApplyMode>("replace");

  async function generate() {
    const trimmed = text.trim();
    if (!trimmed) {
       setError("컴파일할 자연어 효과를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    setDraft(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/effects/generate`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          sourceType,
          ...(sourceId ? { sourceId } : {}),
          ...(cardType ? { cardType } : {}),
          ...(effectContext ? { effectContext } : {}),
          ...(sourceName?.trim() ? { sourceName: sourceName.trim() } : {}),
        }),
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      const body = await response.json() as EffectAiDraft | EffectAiClarification | { message?: string };
       if (!response.ok) {
         throw new Error("message" in body && body.message ? body.message : "게임 효과를 컴파일하지 못했습니다.");
      }
      setDraft(body as EffectAiDraft | EffectAiClarification);
    } catch (reason) {
       setError(reason instanceof Error ? reason.message : "게임 효과를 컴파일하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const ready = draft?.status === "READY" ? draft : null;
  const clarification = draft?.status === "NEEDS_CLARIFICATION" ? draft : null;

  return (
    <section className="md:col-span-2 rounded border border-violet-900/70 bg-violet-950/15 p-3" data-testid="admin-effect-ai-generator">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-violet-200">AI 게임 메커니즘 컴파일러</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
            자연어를 실행 가능한 게임 규칙으로 컴파일하고, 서버에서 현재 Effect Registry와 CardDefinition을 검증합니다. 적용해도 저장 전에는 DB가 바뀌지 않습니다.
          </p>
        </div>
        <span className="rounded border border-violet-800 px-2 py-1 text-[10px] font-bold text-violet-300">ADMIN ONLY · EXECUTABLE</span>
      </div>
      <label className="mt-3 block text-xs font-bold text-neutral-300">
        자연어 효과 설명
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setDraft(null);
            setError("");
          }}
          rows={3}
          maxLength={2000}
          placeholder="예: 등장: 적 챔피언에게 2 피해를 줍니다."
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-violet-500"
          data-testid="input-ai-effect-description"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="rounded bg-violet-400 px-3 py-1.5 text-xs font-black text-black hover:bg-violet-300 disabled:opacity-50"
          data-testid="button-generate-ai-effect"
        >
          {busy ? "생성 중..." : "효과 생성"}
        </button>
        {existingEffectCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            현재 효과 {existingEffectCount}개
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as ApplyMode)}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5"
              data-testid="select-ai-effect-apply-mode"
            >
              <option value="replace">기존 효과 교체</option>
              <option value="append">기존 효과 뒤에 추가</option>
            </select>
          </label>
        )}
      </div>
      {error && <p role="alert" className="mt-2 rounded border border-red-900 bg-red-950/40 px-2 py-1.5 text-xs text-red-300">{error}</p>}
      {clarification && (
        <div className="mt-3 rounded border border-amber-800 bg-amber-950/25 p-3 text-xs" data-testid="ai-effect-clarification">
          <strong className="text-amber-200">효과 설명이 모호합니다</strong>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-100">
            {clarification.questions.map((question) => <li key={question}>{question}</li>)}
          </ul>
        </div>
      )}
      {ready && (
        <div className="mt-3 rounded border border-emerald-800 bg-emerald-950/20 p-3" data-testid="ai-effect-draft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-emerald-200">게임 효과가 적용되었습니다</strong>
            <span className="text-[10px] font-bold text-emerald-300">실행 AST · 서버 validation 통과</span>
          </div>
          <div className="mt-3 rounded border border-emerald-900/60 bg-black/20 p-2 text-xs" data-testid="ai-mechanic-plan">
            <strong className="text-emerald-100">Mechanic plan</strong>
            <div className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr]">
              <span className="text-neutral-500">Trigger</span><span>{ready.mechanicPlan.triggers.join(", ") || "없음"}</span>
              <span className="text-neutral-500">Select / Filter</span><span>{[...ready.mechanicPlan.selections, ...ready.mechanicPlan.filters].join(" · ") || "없음"}</span>
              <span className="text-neutral-500">Condition</span><span>{ready.mechanicPlan.conditions.join(", ") || "없음"}</span>
              <span className="text-neutral-500">Memory / Schedule</span><span>{[...ready.mechanicPlan.memory, ...ready.mechanicPlan.schedule].join(" · ") || "없음"}</span>
              <span className="text-neutral-500">Action</span><span>{ready.mechanicPlan.actions.join(", ") || "없음"}</span>
              <span className="text-neutral-500">Result</span><span>{ready.mechanicPlan.resultReferences.join(", ") || "없음"}</span>
            </div>
          </div>
          <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-[auto_1fr]">
            {ready.preview.map((line, index) => (
              <div key={`${line.label}-${index}`} className="contents">
                <dt className="font-bold text-neutral-500">{line.label}</dt>
                <dd className="text-neutral-200">{line.value}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-3 rounded border border-neutral-800 bg-black/20 p-2">
            <summary className="cursor-pointer text-xs font-bold text-neutral-400">구조화 JSON 보기</summary>
            <pre className="mt-2 max-h-60 overflow-auto text-[10px] leading-relaxed text-neutral-300">
              {JSON.stringify(ready.structuredEffect, null, 2)}
            </pre>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApply(ready, mode)}
              className="rounded bg-primary px-3 py-1.5 text-xs font-black text-black"
              data-testid="button-apply-ai-effect"
            >
              현재 효과에 적용
            </button>
            <button type="button" onClick={() => void generate()} disabled={busy} className="rounded border border-neutral-600 px-3 py-1.5 text-xs font-bold text-neutral-300 disabled:opacity-50">
              다시 생성
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded border border-neutral-600 px-3 py-1.5 text-xs font-bold text-neutral-400">
              닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
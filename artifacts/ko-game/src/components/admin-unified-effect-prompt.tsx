import { useState } from "react";
import { CheckCircle2, Clipboard, RefreshCw } from "lucide-react";
import { useToast } from "../hooks/use-toast";

const adminApiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;

type UnifiedStatus = "SUPPORTED" | "NEW_MECHANIC_REQUIRED" | "ANALYSIS_FAILED";
type UnifiedEntry = {
  kind: "WRESTLER_CARD" | "CHAMPION";
  id: string;
  name: string;
  version: number;
  recordStatus: string;
  slot: string;
  label: string;
  sourceText: string;
  status: UnifiedStatus;
  analysis?: {
    unsupportedSegments?: string[];
    reason?: string;
  };
  note?: string;
};
type UnifiedAnalysis = {
  entries: UnifiedEntry[];
  mechanics: Array<{
    key: string;
    label: string;
    occurrences: Array<{ kind: string; name: string; slot: string }>;
  }>;
  summary: {
    total: number;
    supported: number;
    newMechanicRequired: number;
    analysisFailed: number;
    fullySupported: boolean;
  };
};

async function responseMessage(response: Response) {
  try {
    return ((await response.json()) as { message?: string }).message ?? "통합 분석에 실패했습니다.";
  } catch {
    return "통합 분석에 실패했습니다.";
  }
}

function statusLabel(status: UnifiedStatus) {
  if (status === "SUPPORTED") return "SUPPORTED";
  if (status === "NEW_MECHANIC_REQUIRED") return "NEW_MECHANIC_REQUIRED";
  return "ANALYSIS_FAILED";
}

function statusClass(status: UnifiedStatus) {
  if (status === "SUPPORTED") return "border-emerald-800 bg-emerald-950/40 text-emerald-300";
  if (status === "NEW_MECHANIC_REQUIRED") return "border-amber-800 bg-amber-950/40 text-amber-300";
  return "border-red-800 bg-red-950/40 text-red-300";
}

export function AdminUnifiedEffectPrompt({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<UnifiedAnalysis | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${adminApiBase}/effects/unified-full-prompt`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      const body = await response.json() as {
        analysis?: UnifiedAnalysis;
        prompt?: string;
        message?: string;
      };
      if (!response.ok || !body.analysis) {
        throw new Error(body.message ?? await responseMessage(response));
      }
      setAnalysis(body.analysis);
      setPrompt(body.prompt ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "전체 카드/챔피언 분석에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: "통합 Replit Agent 프롬프트를 복사했습니다." });
    } catch {
      toast({ title: "통합 프롬프트를 복사하지 못했습니다.", variant: "destructive" });
    }
  }

  return (
    <section data-testid="unified-effect-prompt" className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-black text-primary">선수 카드/챔피언 통합 구현</h3>
          <p className="mt-1 max-w-3xl text-xs text-neutral-400">
            DB의 모든 WRESTLER 카드와 Champion의 4개 효과 슬롯을 매번 최신 Registry 기준으로 재분석합니다.
            미구현 메커니즘은 중복 제거해 하나의 Replit 프롬프트로 만듭니다. Champion Token 효과는 CardDefinition을 참조합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          data-testid="button-unified-effect-prompt"
          className="flex shrink-0 items-center justify-center gap-2 rounded bg-primary px-3 py-2 text-xs font-black text-black disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "전체 최신 재분석 중..." : "전체 최신 재분석 및 통합 프롬프트"}
        </button>
      </div>

      {error && <div className="mt-3 rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">{error}</div>}
      {analysis && (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <div className="rounded border border-neutral-800 bg-black/30 p-2">
              <div className="text-[10px] text-neutral-500">분석 대상</div>
              <div className="mt-1 text-lg font-black">{analysis.summary.total}</div>
            </div>
            <div className="rounded border border-emerald-900 bg-emerald-950/20 p-2">
              <div className="text-[10px] text-emerald-400">SUPPORTED</div>
              <div className="mt-1 text-lg font-black text-emerald-300">{analysis.summary.supported}</div>
            </div>
            <div className="rounded border border-amber-900 bg-amber-950/20 p-2">
              <div className="text-[10px] text-amber-400">NEW MECHANIC</div>
              <div className="mt-1 text-lg font-black text-amber-300">{analysis.summary.newMechanicRequired}</div>
            </div>
            <div className="rounded border border-red-900 bg-red-950/20 p-2">
              <div className="text-[10px] text-red-400">ANALYSIS FAILED</div>
              <div className="mt-1 text-lg font-black text-red-300">{analysis.summary.analysisFailed}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {analysis.summary.fullySupported ? (
              <span className="flex items-center gap-1 rounded border border-emerald-700 bg-emerald-950/40 px-2 py-1 font-bold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> ALL WRESTLER CARDS / CHAMPION SLOTS SUPPORTED
              </span>
            ) : (
              <span className="rounded border border-amber-800 bg-amber-950/30 px-2 py-1 text-amber-300">
                중복 제거된 미구현 메커니즘 {analysis.mechanics.length}개
              </span>
            )}
            {prompt && (
              <button type="button" onClick={() => void copy()} data-testid="button-copy-unified-effect-prompt" className="flex items-center gap-1 rounded border border-neutral-600 px-2 py-1 font-bold text-neutral-200">
                <Clipboard className="h-3.5 w-3.5" /> 통합 프롬프트 복사
              </button>
            )}
          </div>

          {analysis.mechanics.length > 0 && (
            <div className="mt-3 rounded border border-neutral-800 bg-black/20 p-3">
              <div className="text-xs font-black text-neutral-300">중복 제거된 미구현 메커니즘</div>
              <ul className="mt-2 space-y-1 text-xs text-amber-200">
                {analysis.mechanics.map((mechanic) => (
                  <li key={mechanic.key}>
                    <span className="font-bold">{mechanic.label}</span>
                    <span className="ml-2 text-neutral-500">
                      ({mechanic.occurrences.length}개 위치: {mechanic.occurrences.map((item) => `${item.name}/${item.slot}`).join(", ")})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold text-neutral-300">전체 분석 결과 보기</summary>
            <div className="mt-2 max-h-80 space-y-1 overflow-y-auto rounded border border-neutral-800 bg-black/20 p-2">
              {analysis.entries.map((entry) => (
                <div key={`${entry.kind}:${entry.id}:${entry.slot}`} className="flex flex-wrap items-center gap-2 rounded border border-neutral-900 px-2 py-1.5 text-xs">
                  <span className={`rounded border px-1.5 py-0.5 font-bold ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span>
                  <span className="font-bold">{entry.name}</span>
                  <span className="text-neutral-500">{entry.label}</span>
                  {entry.note && <span className="text-neutral-500">{entry.note}</span>}
                </div>
              ))}
            </div>
          </details>

          {prompt && (
            <textarea
              readOnly
              value={prompt}
              data-testid="textarea-unified-effect-prompt"
              className="mt-3 h-64 w-full rounded border border-neutral-700 bg-neutral-950 p-3 font-mono text-[11px] leading-5 text-neutral-300 outline-none"
            />
          )}
        </>
      )}
    </section>
  );
}
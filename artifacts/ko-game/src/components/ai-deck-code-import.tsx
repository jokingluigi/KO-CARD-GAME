import { useState } from "react";
import { readSharedAIDeck } from "@/lib/ai-deck-import";
import type { AIDeckOptions } from "@/lib/ai-decks-client";
export function AIDeckCodeImport({
  options,
  busy,
  onApply,
}: {
  options: AIDeckOptions | null;
  busy: boolean;
  onApply: (deck: ReturnType<typeof readSharedAIDeck>) => void;
}) {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  return (
    <fieldset
      className="min-w-0 space-y-3 rounded-lg border border-amber-800 p-3 md:col-span-2"
      disabled={busy || !options}
    >
      <legend className="px-2 font-bold text-amber-200">
        공유 덱 코드 가져오기
      </legend>
      <p className="text-sm text-neutral-300">
        코드 또는 공유 링크를 붙여 넣으면 현재 편집 중인 챔피언과 카드 구성을
        교체합니다. 확인 후 저장하세요.
      </p>
      <label className="block text-sm" htmlFor="ai-shared-deck-code">
        덱 코드 또는 공유 링크
      </label>
      <textarea
        id="ai-shared-deck-code"
        className="min-h-24 w-full min-w-0 rounded border border-neutral-700 bg-neutral-950 p-3 text-base"
        maxLength={7000}
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError("");
          setNotice("");
        }}
      />
      <button
        type="button"
        className="min-h-12 rounded bg-amber-300 px-4 font-bold text-black disabled:opacity-40"
        disabled={!code.trim()}
        onClick={() => {
          if (!options) return;
          try {
            const result = readSharedAIDeck(code, options);
            onApply(result);
            setError("");
            setNotice(
              `${result.name} · 25장을 편집기에 적용했습니다. 저장해야 반영됩니다.${result.changed.length ? " 공유 후 정보가 바뀐 카드는 현재 능력치와 효과를 사용합니다: " + result.changed.join(", ") : ""}`,
            );
          } catch (e) {
            setNotice("");
            setError(e instanceof Error ? e.message : "덱 코드를 확인하세요.");
          }
        }}
      >
        덱 코드 적용
      </button>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-amber-100">
          {notice}
        </p>
      )}
    </fieldset>
  );
}

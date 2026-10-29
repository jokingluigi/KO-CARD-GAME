import { useEffect, useState } from "react";
import type { CardDetailRecord } from "../card-detail-dialog";
export function explicitReferences(value: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (v: unknown, depth = 0) => {
    if (!v || typeof v !== "object" || depth > 20) return;
    const obj = v as Record<string, unknown>;
    if (
      ["GENERATE", "SUMMON", "TRANSFORM_SOURCE", "TRANSFORM_TARGET"].includes(
        String(obj.action ?? obj.type),
      )
    ) {
      const values = (obj.values ?? obj) as Record<string, unknown>,
        ref = (values.definitionRef ?? values.definition) as
          { id?: string; name?: string } | undefined;
      if (typeof ref?.id === "string") ids.add(ref.id);
      else if (typeof ref?.name === "string") ids.add("name:" + ref.name);
    }
    for (const [k, x] of Object.entries(obj)) {
      if (
        [
          "tokenDefinitionId",
          "championTokenDefinitionId",
          "transformDefinitionId",
        ].includes(k) &&
        typeof x === "string"
      )
        ids.add(x);
      else walk(x, depth + 1);
    }
  };
  walk(value);
  return ids;
}
export function RelatedCards({
  id,
  onSelect,
}: {
  id: string;
  onSelect: (c: CardDetailRecord) => void;
}) {
  const [cards, setCards] = useState<CardDetailRecord[]>([]),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    setCards([]);
    setLoading(true);
    const timer = setTimeout(() => {
      setError("연결 정보를 불러오는 데 시간이 걸립니다. 다시 확인하세요.");
      setLoading(false);
      c.abort();
    }, 8000);
    setError("");
    Promise.all([
      fetch("/api/cards", { signal: c.signal }),
      fetch("/api/champions", { signal: c.signal }),
    ])
      .then((r) => {
        if (r.some((x) => !x.ok)) throw Error();
        return Promise.all(r.map((x) => x.json()));
      })
      .then((body) => {
        const all = body[0].cards ?? [];
        const source = [...all, ...(body[1].champions ?? [])].find(
            (x: { id: string }) => x.id === id,
          ),
          refs = explicitReferences(source);
        setCards(
          all.filter(
            (x: { id: string; status?: string }) =>
              (refs.has(x.id) ||
                (refs.has("name:" + (x as { name?: string }).name) &&
                  all.filter(
                    (c: { name?: string; status?: string }) =>
                      c.name === (x as { name?: string }).name &&
                      c.status === "PUBLISHED",
                  ).length === 1)) &&
              x.id !== id &&
              x.status === "PUBLISHED",
          ),
        );
      })
      .catch(() => {
        if (!c.signal.aborted)
          setError("연결 카드 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        clearTimeout(timer);
        if (!c.signal.aborted) setLoading(false);
      });
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [id, revision]);
  return (
    <section>
      <h3 className="font-bold text-amber-200">생성·소환·변신 연결 카드</h3>
      {loading ? (
        <p role="status">연결 카드 확인 중…</p>
      ) : error ? (
        <p>
          {error}
          <button
            className="min-h-11"
            onClick={() => setRevision((n) => n + 1)}
          >
            다시 확인
          </button>
        </p>
      ) : cards.length ? (
        cards.map((c) => (
          <button
            key={c.id}
            className="mr-2 min-h-11 border border-amber-900 p-2"
            onClick={() => onSelect(c)}
          >
            {c.name} · {c.cost}코스트
          </button>
        ))
      ) : (
        <p className="text-sm text-neutral-400">
          등록된 명시적 연결이 없습니다. 무작위 생성 결과는 효과 설명을
          확인하세요.
        </p>
      )}
    </section>
  );
}

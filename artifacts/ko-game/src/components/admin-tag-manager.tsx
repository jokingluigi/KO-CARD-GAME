import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { updateTagLabels, tagLabel } from "@/lib/tag-labels";
const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/tags`;
type Card = {
  id: string;
  name: string;
  tags: string[];
  status: string;
  rarity: string;
  cost: number;
  attack: number;
  health: number;
  imageUrl?: string | null;
};
const input =
  "min-h-11 min-w-0 rounded-lg border border-neutral-700 bg-black/50 px-3 py-2 text-sm outline-none focus:border-primary";
export function AdminTagManager({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const [tags, setTags] = useState<string[]>([]),
    [labels, setLabels] = useState<Record<string, string>>({}),
    [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState(""),
    [draft, setDraft] = useState(""),
    [rename, setRename] = useState(""),
    [tagSearch, setTagSearch] = useState(""),
    [cardSearch, setCardSearch] = useState("");
  const [filter, setFilter] = useState("ALL"),
    [status, setStatus] = useState("ALL"),
    [rarity, setRarity] = useState("ALL"),
    [cost, setCost] = useState("ALL"),
    [sort, setSort] = useState("NAME");
  const [checked, setChecked] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const mutation = useRef(false);
  const label = useCallback((key: string) => tagLabel(key, labels), [labels]);
  const check = useCallback(
    async (response: Response) => {
      if (response.status === 401) {
        onUnauthorized();
        throw Error("로그인이 필요합니다.");
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw Error(data.message ?? "태그 설정을 처리하지 못했습니다.");
      return data;
    },
    [onUnauthorized],
  );
  const load = useCallback(async () => {
    const data = await check(
      await fetch(base, { credentials: "include", cache: "no-store" }),
    );
    setTags(data.tags);
    setCards(data.cards);
    setLabels(data.labels ?? {});
    updateTagLabels(data.labels ?? {});
    setSelected((current) =>
      data.tags.includes(current) ? current : (data.tags[0] ?? ""),
    );
  }, [check]);
  useEffect(() => {
    void load()
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    setChecked(new Set());
    setMessage("");
  }, [selected]);
  useEffect(() => setRename(label(selected)), [selected, label]);
  async function change(
    path: string,
    method: string,
    body: object | undefined,
    success: string,
  ) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await check(
        await fetch(base + path, {
          method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
      await load();
      setMessage(
        success +
          ("affectedCards" in result
            ? ` (실제 변경 ${result.affectedCards}장)`
            : ""),
      );
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "태그를 저장하지 못했습니다.",
      );
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  const attached = cards.filter((card) => card.tags.includes(selected));
  const visible = useMemo(() => {
    const terms = cardSearch
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return cards
      .filter(
        (card) =>
          terms.every((term) =>
            [card.name, ...card.tags.map(label)]
              .join(" ")
              .toLocaleLowerCase()
              .includes(term),
          ) &&
          (filter === "ALL" ||
            (filter === "ATTACHED") === card.tags.includes(selected)) &&
          (status === "ALL" || card.status === status) &&
          (rarity === "ALL" || card.rarity === rarity) &&
          (cost === "ALL" || card.cost === Number(cost)),
      )
      .sort((a, b) =>
        sort === "COST"
          ? a.cost - b.cost || a.name.localeCompare(b.name, "ko")
          : a.name.localeCompare(b.name, "ko"),
      );
  }, [cards, cardSearch, filter, status, rarity, cost, sort, selected, label]);
  const selectedAttached = cards.filter(
    (c) => checked.has(c.id) && c.tags.includes(selected),
  ).length;
  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  async function bulk(attached: boolean) {
    const ids = [...checked];
    if (!ids.length) return;
    if (
      await change(
        "/" + encodeURIComponent(selected) + "/cards",
        "PATCH",
        { cardIds: ids, attached },
        `${ids.length}장의 ${label(selected)} 태그를 ${attached ? "연결" : "해제"}했습니다.`,
      )
    )
      setChecked(new Set());
  }
  return (
    <section data-testid="admin-tag-manager" className="min-w-0">
      <h2 className="text-xl font-black text-primary">태그 관리</h2>
      <p className="mt-2 text-sm text-neutral-400">
        선수 카드를 검색해서 여러 장을 선택한 뒤 태그를 한 번에 연결하거나
        해제하세요.
      </p>
      <form
        className="mt-5 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = draft.trim();
          if (
            name &&
            (await change("", "POST", { name }, "태그를 추가했습니다."))
          ) {
            setSelected(name);
            setDraft("");
          }
        }}
      >
        <input
          aria-label="새 태그 이름"
          className={input + " flex-1"}
          maxLength={100}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="새 태그 이름"
        />
        <button
          disabled={busy || loading || !draft.trim()}
          className="min-h-11 shrink-0 rounded-lg bg-primary px-4 text-sm font-bold text-black disabled:opacity-40"
        >
          태그 추가
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-amber-200">
          {message}
        </p>
      )}
      {loading ? (
        <p className="mt-5 text-neutral-400">태그를 불러오는 중...</p>
      ) : (
        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <input
              className={input + " w-full"}
              aria-label="태그 검색"
              placeholder="태그 검색"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
            />
            <div className="mt-3 flex max-h-64 flex-wrap gap-1 overflow-auto lg:max-h-[70vh] lg:flex-col">
              {tags
                .filter((tag) =>
                  [tag, label(tag)].some((value) =>
                    value
                      .toLocaleLowerCase()
                      .includes(tagSearch.trim().toLocaleLowerCase()),
                  ),
                )
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={busy}
                    aria-pressed={selected === tag}
                    onClick={() => setSelected(tag)}
                    className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${selected === tag ? "border-primary bg-amber-950/30 text-primary" : "border-neutral-800 text-neutral-300"}`}
                  >
                    <span className="min-w-0 break-words">{label(tag)}</span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {cards.filter((c) => c.tags.includes(tag)).length}장
                    </span>
                  </button>
                ))}
              {!tags.length && (
                <p className="py-3 text-sm text-neutral-500">
                  등록된 태그가 없습니다.
                </p>
              )}
            </div>
          </aside>
          <div className="min-w-0">
            {selected ? (
              <>
                <header className="rounded-xl border border-neutral-800 bg-white/[.025] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-black">
                        {label(selected)}
                      </h3>
                      <p className="mt-1 text-xs text-neutral-400">
                        연결된 선수 {attached.length}장
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-11 shrink-0 rounded-lg border border-red-900 px-3 text-xs text-red-300"
                      onClick={() => {
                        if (
                          window.confirm(
                            `‘${label(selected)}’ 태그를 삭제할까요? 모든 카드에서 이 태그가 제거됩니다. 카드 자체는 삭제되지 않습니다.`,
                          )
                        )
                          void change(
                            "/" + encodeURIComponent(selected),
                            "DELETE",
                            undefined,
                            "태그를 삭제했습니다.",
                          );
                      }}
                    >
                      태그 삭제
                    </button>
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await change(
                        "/" + encodeURIComponent(selected),
                        "PATCH",
                        { displayName: rename.trim() },
                        "태그 이름을 변경했습니다.",
                      );
                    }}
                  >
                    <input
                      className={input + " flex-1"}
                      aria-label="태그 이름 변경"
                      value={rename}
                      maxLength={100}
                      onChange={(e) => setRename(e.target.value)}
                    />
                    <button
                      className="min-h-11 shrink-0 rounded-lg border border-amber-600 px-3 text-sm text-amber-200 disabled:opacity-40"
                      disabled={
                        busy ||
                        !rename.trim() ||
                        rename.trim() === label(selected)
                      }
                    >
                      이름 저장
                    </button>
                  </form>
                  <p className="mt-2 text-xs text-neutral-500">
                    표시 이름을 바꿔도 연결된 선수와 기존 효과의 태그 판정은
                    유지됩니다.
                  </p>
                </header>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <input
                    className={input + " col-span-2 sm:col-span-3"}
                    aria-label="선수 카드 검색"
                    placeholder="이름 · 태그로 검색 (여러 단어 가능)"
                    value={cardSearch}
                    onChange={(e) => setCardSearch(e.target.value)}
                  />
                  <select
                    aria-label="태그 연결 필터"
                    className={input}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="ALL">모든 선수</option>
                    <option value="ATTACHED">연결된 선수</option>
                    <option value="AVAILABLE">미연결 선수</option>
                  </select>
                  <select
                    aria-label="선수 공개 상태"
                    className={input}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="ALL">모든 공개 상태</option>
                    <option value="PUBLISHED">공개</option>
                    <option value="DRAFT">초안</option>
                    <option value="DISABLED">비활성</option>
                  </select>
                  <select
                    aria-label="선수 등급"
                    className={input}
                    value={rarity}
                    onChange={(e) => setRarity(e.target.value)}
                  >
                    <option value="ALL">모든 등급</option>
                    {["NORMAL", "EPIC", "LEGENDARY", "CHAMPION"].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="선수 비용"
                    className={input}
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  >
                    <option value="ALL">모든 비용</option>
                    {[...new Set(cards.map((c) => c.cost))]
                      .sort((a, b) => a - b)
                      .map((v) => (
                        <option key={v} value={v}>
                          {v}골드
                        </option>
                      ))}
                  </select>
                  <select
                    aria-label="선수 정렬"
                    className={input}
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="NAME">이름순</option>
                    <option value="COST">비용순</option>
                  </select>
                  <button
                    type="button"
                    className={input}
                    onClick={() => {
                      setCardSearch("");
                      setFilter("ALL");
                      setStatus("ALL");
                      setRarity("ALL");
                      setCost("ALL");
                    }}
                  >
                    검색·필터 초기화
                  </button>
                </div>
                <div className="sticky top-0 z-10 mt-4 rounded-lg border border-amber-800/60 bg-neutral-950/95 p-3">
                  <p className="text-xs text-neutral-300">
                    검색 {visible.length}장 · 선택 {checked.size}장{" "}
                    {checked.size > 0 &&
                      `(연결 ${selectedAttached} · 미연결 ${checked.size - selectedAttached})`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !visible.length}
                      className={input}
                      onClick={() =>
                        setChecked(
                          new Set(visible.slice(0, 1000).map((c) => c.id)),
                        )
                      }
                    >
                      검색 결과 모두 선택 (최대 1000장)
                    </button>
                    <button
                      type="button"
                      className={input}
                      disabled={busy || !checked.size}
                      onClick={() => setChecked(new Set())}
                    >
                      선택 해제
                    </button>
                    <button
                      type="button"
                      className={
                        input +
                        " border-amber-600 text-amber-200 disabled:opacity-40"
                      }
                      disabled={
                        busy ||
                        checked.size === 0 ||
                        selectedAttached === checked.size
                      }
                      onClick={() => void bulk(true)}
                    >
                      선택 카드 연결
                    </button>
                    <button
                      type="button"
                      className={input + " text-red-200 disabled:opacity-40"}
                      disabled={busy || !selectedAttached}
                      onClick={() => void bulk(false)}
                    >
                      선택 카드에서 해제
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    검색을 바꿔도 선택을 유지합니다. 선택한 카드만 변경하며 다른
                    태그는 유지합니다.
                  </p>
                </div>
                <div
                  className="mt-3 max-h-[65vh] divide-y divide-neutral-800 overflow-y-auto rounded-lg border border-neutral-800"
                  aria-label="선수 카드 선택 목록"
                >
                  {visible.map((card) => (
                    <div
                      key={card.id}
                      className={`flex min-h-20 items-center gap-3 px-3 py-2 ${checked.has(card.id) ? "bg-amber-950/30" : ""}`}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-amber-400"
                          aria-label={card.name + " 선택"}
                          disabled={busy}
                          checked={checked.has(card.id)}
                          onChange={() => toggle(card.id)}
                        />
                        {card.imageUrl && (
                          <img
                            src={card.imageUrl}
                            alt=""
                            loading="lazy"
                            className="h-16 w-11 shrink-0 rounded object-cover"
                          />
                        )}
                        <span className="min-w-0">
                          <strong className="block break-words text-sm">
                            {card.name}
                          </strong>
                          <span className="mt-1 block text-[11px] text-neutral-400">
                            {card.cost}G · {card.attack}/{card.health} ·{" "}
                            {card.rarity} ·{" "}
                            {card.status === "PUBLISHED"
                              ? "공개"
                              : card.status === "DRAFT"
                                ? "초안"
                                : "비활성"}
                          </span>
                          <span className="mt-1 block break-words text-xs text-amber-300">
                            {card.tags.map(label).join(" · ") || "태그 없음"}
                          </span>
                        </span>
                      </label>
                      <button
                        type="button"
                        aria-label={
                          card.name +
                          (card.tags.includes(selected)
                            ? " 태그 해제"
                            : " 태그 연결")
                        }
                        disabled={busy}
                        className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs ${card.tags.includes(selected) ? "border-amber-700 text-amber-200" : "border-neutral-700 text-neutral-400"}`}
                        onClick={() =>
                          void change(
                            "/" +
                              encodeURIComponent(selected) +
                              "/cards/" +
                              encodeURIComponent(card.id),
                            "PATCH",
                            { attached: !card.tags.includes(selected) },
                            card.name + " 태그 연결을 변경했습니다.",
                          )
                        }
                      >
                        {card.tags.includes(selected)
                          ? "연결됨 · 해제"
                          : "연결"}
                      </button>
                    </div>
                  ))}
                  {!visible.length && (
                    <p className="p-5 text-sm text-neutral-500">
                      조건에 맞는 선수 카드가 없습니다.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                태그를 추가하거나 목록에서 선택하세요.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

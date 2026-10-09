import { useEffect, useMemo, useState, type ReactNode } from "react";
export function useAdminList<T>(
  items: T[],
  describe: (item: T) => string,
  perPage = 25,
) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("default"),
    [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const next = items.filter((i) =>
      describe(i).toLocaleLowerCase().includes(q),
    );
    return sort === "name"
      ? next.sort((a, b) => describe(a).localeCompare(describe(b), "ko"))
      : next;
  }, [items, query, sort, describe]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage)),
    safePage = Math.min(page, pages);
  useEffect(() => setPage(1), [query, sort]);
  return {
    records: filtered.slice((safePage - 1) * perPage, safePage * perPage),
    query,
    setQuery,
    sort,
    setSort,
    page: safePage,
    setPage,
    pages,
    total: filtered.length,
  };
}
export function AdminListControls({
  view,
  label,
}: {
  view: ReturnType<typeof useAdminList>;
  label: string;
}) {
  return (
    <div className="admin-list-controls">
      <label>
        {label} 검색
        <input
          type="search"
          value={view.query}
          onChange={(e) => view.setQuery(e.target.value)}
          placeholder="이름 또는 상태"
        />
      </label>
      <label>
        정렬
        <select
          value={view.sort}
          onChange={(e) => view.setSort(e.target.value)}
        >
          <option value="default">기존 순서</option>
          <option value="name">이름순</option>
        </select>
      </label>
      <div className="admin-list-pagination">
        <span>
          {view.total}개 · {view.page}/{view.pages}
        </span>
        <button
          type="button"
          aria-label={label + " 이전 페이지"}
          disabled={view.page === 1}
          onClick={() => view.setPage((p) => p - 1)}
        >
          이전
        </button>
        <button
          type="button"
          aria-label={label + " 다음 페이지"}
          disabled={view.page === view.pages}
          onClick={() => view.setPage((p) => p + 1)}
        >
          다음
        </button>
      </div>
      {!view.total && <p role="status">조건에 맞는 항목이 없습니다.</p>}
    </div>
  );
}

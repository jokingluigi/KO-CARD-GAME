import { useEffect, useState } from "react";
import { ADMIN_PAGES, type AdminPageId } from "@/lib/admin-navigation";
const base = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api/admin";
async function read(path: string) {
  const r = await fetch(base + "/" + path, { credentials: "include" });
  if (!r.ok) throw Error("조회 실패 (" + r.status + ")");
  return r.json();
}
export function AdminDashboard({ go }: { go: (id: AdminPageId) => void }) {
  const [data, setData] = useState<Record<string, any>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void Promise.allSettled(
      ["cards", "champions", "packs", "tower", "server-maintenance"].map(
        async (path) => ({ path, data: await read(path) }),
      ),
    ).then((results) => {
      if (!active) return;
      const values: Record<string, any> = {},
        failures: Record<string, string> = {};
      results.forEach((r, i) =>
        r.status === "fulfilled"
          ? (values[r.value.path] = r.value.data)
          : (failures[
              ["cards", "champions", "packs", "tower", "server-maintenance"][i]
            ] = String(r.reason)),
      );
      setData(values);
      setErrors(failures);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  const recent = [
    ...(data.cards?.cards ?? []).map((c: any) => ({
      ...c,
      kind: "카드",
      page: "cards",
    })),
    ...(data.champions?.champions ?? []).map((c: any) => ({
      ...c,
      kind: "챔피언",
      page: "champions",
    })),
  ]
    .filter((c) => c.updatedAt)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 8);
  return (
    <div className="admin-dashboard">
      <section className="admin-overview-strip" aria-label="콘텐츠 현황">
        {[
          ["cards", "카드", data.cards?.cards?.length],
          ["champions", "챔피언", data.champions?.champions?.length],
          ["packs", "카드팩", data.packs?.packs?.length],
          ["tower", "타워", data.tower?.seasons?.length],
        ].map(([id, label, count]) => (
          <button key={String(id)} onClick={() => go(id as AdminPageId)}>
            <span>{label}</span>
            <strong>{count === undefined ? "—" : count}</strong>
            <small>
              {errors[String(id)] ?? (loading ? "조회 중" : "등록된 콘텐츠")}
            </small>
          </button>
        ))}
      </section>
      <div className="admin-dashboard-columns">
        <section>
          <h2>운영 상태</h2>
          <dl className="admin-status-list">
            <div>
              <dt>서버 점검</dt>
              <dd>
                {data["server-maintenance"]
                  ? data["server-maintenance"].enabled
                    ? "점검 중"
                    : "정상 운영"
                  : "조회 중"}
              </dd>
            </div>
            <div>
              <dt>타워 진입</dt>
              <dd>
                {data.tower
                  ? data.tower.enabled
                    ? "활성"
                    : "비활성"
                  : "조회 중"}
              </dd>
            </div>
            <div>
              <dt>설정 경로</dt>
              <dd>
                <button onClick={() => go("system")}>점검 설정 열기 →</button>
              </dd>
            </div>
          </dl>
          {Object.entries(errors).map(([key, value]) => (
            <p role="alert" key={key}>
              {key}: {value}
            </p>
          ))}
        </section>
        <section>
          <h2>자주 사용하는 작업</h2>
          <div className="admin-quick-links">
            {(
              [
                "cards",
                "champions",
                "tower",
                "quests",
                "packs",
                "media",
              ] as AdminPageId[]
            ).map((id) => {
              const p = ADMIN_PAGES.find((p) => p.id === id)!;
              return (
                <button key={id} onClick={() => go(id)}>
                  <strong>{p.label}</strong>
                  <span>{p.description}</span>
                  <b aria-hidden>→</b>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      <section>
        <div className="admin-section-heading">
          <h2>최근 콘텐츠 수정</h2>
          <span>서버에 저장된 수정일 기준</span>
        </div>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>콘텐츠</th>
                <th>구분</th>
                <th>상태</th>
                <th>수정일</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.kind + c.id}>
                  <td>{c.name}</td>
                  <td>{c.kind}</td>
                  <td>{c.status}</td>
                  <td>{new Date(c.updatedAt).toLocaleString("ko-KR")}</td>
                  <td>
                    <button onClick={() => go(c.page)}>관리 →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !recent.length && (
            <p>조회 가능한 수정 기록이 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}
export function AdminUserDirectory({ go }: { go: (id: AdminPageId) => void }) {
  const [users, setUsers] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([read("shop"), read("prism")])
      .then(([shop, prism]) => {
        if (active)
          setUsers(
            shop.users.map((u: any) => ({
              ...u,
              ...prism.users.find((p: any) => p.id === u.id),
            })),
          );
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  const filtered = users.filter((u) =>
    (u.nickname + " " + u.email)
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <section>
      <div className="admin-directory-toolbar">
        <label>
          계정 검색
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="닉네임 또는 이메일"
          />
        </label>
        <span>{filtered.length}개 계정</span>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="admin-table-scroll">
        <table>
          <thead>
            <tr>
              <th>닉네임</th>
              <th>이메일</th>
              <th>크레딧</th>
              <th>프리즘</th>
              <th>챔피언 프리즘</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * 25, (page + 1) * 25).map((u) => (
              <tr key={u.id}>
                <td>{u.nickname}</td>
                <td>{u.email}</td>
                <td>{u.currencyBalance?.toLocaleString()}</td>
                <td>{u.prismBalance?.toLocaleString()}</td>
                <td>{u.championPrismBalance?.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-pagination">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          이전
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(filtered.length / 25))}
        </span>
        <button
          disabled={(page + 1) * 25 >= filtered.length}
          onClick={() => setPage((p) => p + 1)}
        >
          다음
        </button>
      </div>
      <h2 className="mt-8">관련 운영 도구</h2>
      <div className="admin-related-links">
        <button onClick={() => go("shop")}>크레딧 지급</button>
        <button onClick={() => go("packs")}>카드팩 지급</button>
        <button onClick={() => go("prism")}>프리즘 지급 · 회수</button>
      </div>
      <p className="mt-4 text-sm text-neutral-400">
        현재 구현된 자산 운영 도구를 사용합니다. 계정 권한 변경·제재 기능은 기존
        시스템에서 제공하지 않습니다.
      </p>
    </section>
  );
}

import { lazy, useEffect, useRef, useState, type ReactNode } from "react";

const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;

const AdminUsageStatistics = lazy(() => import("./admin-usage-statistics").then((m) => ({ default: m.AdminUsageStatistics })));
const AdminMultiplayerPerformance = lazy(() => import("./admin-multiplayer-performance"));
const AdminShopManager = lazy(() => import("./admin-shop-manager").then((m) => ({ default: m.AdminShopManager })));
const AdminShopDecks = lazy(() => import("./admin-shop-decks").then((m) => ({ default: m.AdminShopDecks })));

/** Simple pill tabs that remember the open tab in the address (?tab=...). */
function AdminTabs<T extends string>({ tabs, initial, children }: { tabs: readonly (readonly [T, string])[]; initial: T; children: (tab: T) => ReactNode }) {
  const [tab, setTab] = useState<T>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    return (tabs.find(([id]) => id === fromUrl)?.[0] ?? initial) as T;
  });
  function choose(next: T) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    history.replaceState(history.state, "", url.pathname + url.search);
  }
  return (
    <>
      <div className="admin-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => choose(id)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel">{children(tab)}</div>
    </>
  );
}

export function AdminStatisticsHub({ legacyPath, onUnauthorized }: { legacyPath: string; onUnauthorized: () => void }) {
  const initial = legacyPath.includes("champion-statistics") ? "champions" : legacyPath.includes("multiplayer-performance") ? "performance" : "cards";
  return (
    <AdminTabs tabs={[["cards", "카드"], ["champions", "챔피언"], ["performance", "대전 성능"]] as const} initial={initial}>
      {(tab) => tab === "performance" ? <AdminMultiplayerPerformance /> : <AdminUsageStatistics key={tab} kind={tab} onUnauthorized={onUnauthorized} />}
    </AdminTabs>
  );
}

export function AdminShopHub({ legacyPath, onUnauthorized }: { legacyPath: string; onUnauthorized: () => void }) {
  return (
    <AdminTabs tabs={[["products", "판매 상품"], ["decks", "완성 덱"]] as const} initial={legacyPath.includes("shop-decks") ? "decks" : "products"}>
      {(tab) => tab === "decks" ? <AdminShopDecks /> : <AdminShopManager onUnauthorized={onUnauthorized} />}
    </AdminTabs>
  );
}

type Account = { id: string; nickname: string; email: string; currencyBalance?: number; prismBalance?: number; championPrismBalance?: number };
type Pack = { id: string; name: string; status: string };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(api + path, { ...init, credentials: "include", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "요청을 처리하지 못했어요.");
  return body as T;
}

/** Find a player and give or take back credits, card packs and prisms — all in one place. */
export function AdminUserAssets({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [users, setUsers] = useState<Account[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [currencyName, setCurrencyName] = useState("크레딧");
  const [kind, setKind] = useState<"credit" | "pack" | "prism" | "champion-prism" | "revoke">("credit");
  const [amount, setAmount] = useState("");
  const [packId, setPackId] = useState("");
  const [revokeKind, setRevokeKind] = useState<"CARD" | "CHAMPION">("CARD");
  const [reason, setReason] = useState("");
  const requestRef = useRef<{ signature: string; id: string } | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  async function load() {
    try {
      const [shop, prism, packList] = await Promise.all([
        call<{ users: Account[]; currencyDisplayName?: string }>("/shop"),
        call<{ users: Account[] }>("/prism"),
        call<{ packs: Pack[] }>("/packs"),
      ]);
      setUsers(shop.users.map((u) => ({ ...u, ...prism.users.find((p) => p.id === u.id) })));
      setPacks(packList.packs);
      if (shop.currencyDisplayName) setCurrencyName(shop.currencyDisplayName);
    } catch (error) {
      if (error instanceof Error && error.message.includes("권한")) onUnauthorized();
      setMessage({ ok: false, text: error instanceof Error ? error.message : "유저 목록을 불러오지 못했어요." });
    }
  }
  useEffect(() => { void load(); }, []);

  const filtered = users.filter((u) => `${u.nickname} ${u.email}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selected = users.find((u) => u.id === selectedId) ?? null;

  async function submit() {
    if (!selected || busy) return;
    const n = Number(amount);
    if (!Number.isSafeInteger(n) || n < 1 || n > 1_000_000) { setMessage({ ok: false, text: "1 이상의 숫자를 넣어 주세요." }); return; }
    if (kind === "pack" && !packId) { setMessage({ ok: false, text: "줄 카드팩을 골라 주세요." }); return; }
    if (kind === "revoke" && !reason.trim()) { setMessage({ ok: false, text: "회수하는 이유를 적어 주세요." }); return; }
    const what = kind === "credit" ? `${currencyName} ${n.toLocaleString()}`
      : kind === "pack" ? `${packs.find((p) => p.id === packId)?.name ?? "카드팩"} ${n}개`
      : kind === "prism" ? `일반 프리즘 ${n.toLocaleString()}개`
      : kind === "champion-prism" ? `챔피언 프리즘 ${n.toLocaleString()}개`
      : `${revokeKind === "CHAMPION" ? "챔피언 " : "일반 "}프리즘 ${n.toLocaleString()}개`;
    if (!window.confirm(kind === "revoke" ? `${selected.nickname} 님에게서 ${what} 회수할까요?` : `${selected.nickname} 님에게 ${what} 지급할까요?`)) return;
    setBusy(true); setMessage(null);
    try {
      if (kind === "credit") await call("/shop/currency/grant", { method: "POST", body: JSON.stringify({ userId: selected.id, amount: n }) });
      else if (kind === "pack") await call(`/packs/${packId}/grant`, { method: "POST", body: JSON.stringify({ userId: selected.id, quantity: n }) });
      else {
        const prismKind = kind === "revoke" ? revokeKind : kind === "champion-prism" ? "CHAMPION" : "CARD";
        const body = kind === "revoke" ? { userId: selected.id, amount: n, kind: prismKind, reason: reason.trim() } : { userId: selected.id, amount: n, kind: prismKind };
        const signature = JSON.stringify({ action: kind, ...body });
        if (requestRef.current?.signature !== signature) requestRef.current = { signature, id: crypto.randomUUID() };
        await call(kind === "revoke" ? "/prism/revoke" : "/prism/grant", { method: "POST", body: JSON.stringify({ ...body, requestId: requestRef.current.id }) });
        requestRef.current = null;
      }
      setAmount(""); setReason("");
      setMessage({ ok: true, text: kind === "revoke" ? `${selected.nickname} 님에게서 ${what} 회수했어요.` : `${selected.nickname} 님에게 ${what} 지급했어요.` });
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "처리하지 못했어요." });
    } finally { setBusy(false); }
  }

  return (
    <div className="admin-user-assets">
      <section className="admin-user-assets-list">
        <div className="admin-directory-toolbar">
          <label>유저 찾기<input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="닉네임 또는 이메일" /></label>
          <span>{filtered.length}명</span>
        </div>
        <div className="admin-table-scroll">
          <table>
            <thead><tr><th>닉네임</th><th>이메일</th><th>{currencyName}</th><th>프리즘</th><th>챔피언 프리즘</th></tr></thead>
            <tbody>
              {filtered.slice(page * 25, (page + 1) * 25).map((u) => (
                <tr key={u.id} aria-selected={u.id === selectedId} className={u.id === selectedId ? "is-selected" : ""} onClick={() => { setSelectedId(u.id); setMessage(null); if (matchMedia("(max-width:1000px)").matches) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }} style={{ cursor: "pointer" }}>
                  <td>{u.nickname}</td><td>{u.email}</td><td>{u.currencyBalance?.toLocaleString() ?? "—"}</td><td>{u.prismBalance?.toLocaleString() ?? "—"}</td><td>{u.championPrismBalance?.toLocaleString() ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-pagination">
          <button disabled={!page} onClick={() => setPage((p) => p - 1)}>이전</button>
          <span>{page + 1} / {Math.max(1, Math.ceil(filtered.length / 25))}</span>
          <button disabled={(page + 1) * 25 >= filtered.length} onClick={() => setPage((p) => p + 1)}>다음</button>
        </div>
      </section>

      <section ref={panelRef} className="admin-user-assets-panel" aria-label="자산 지급">
        <h2>자산 주기 · 회수</h2>
        {!selected ? <p className="admin-muted">유저 목록에서 이름을 눌러 주세요.</p> : (
          <>
            <p className="admin-user-assets-who"><b>{selected.nickname}</b><small>{selected.email}</small></p>
            <div className="admin-tabs" role="tablist">
              {([["credit", currencyName], ["pack", "카드팩"], ["prism", "프리즘"], ["champion-prism", "챔피언 프리즘"], ["revoke", "프리즘 회수"]] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => { setKind(id); setMessage(null); }}>{label}</button>
              ))}
            </div>
            <div className="admin-user-assets-form">
              {kind === "pack" && (
                <label>카드팩<select value={packId} onChange={(e) => setPackId(e.target.value)}><option value="">카드팩 고르기</option>{packs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status !== "PUBLISHED" ? " (미공개)" : ""}</option>)}</select></label>
              )}
              {kind === "revoke" && (
                <label>종류<select value={revokeKind} onChange={(e) => setRevokeKind(e.target.value as "CARD" | "CHAMPION")}><option value="CARD">일반 프리즘</option><option value="CHAMPION">챔피언 프리즘</option></select></label>
              )}
              <label>{kind === "pack" ? "개수" : "수량"}<input type="number" min="1" max="1000000" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="숫자" /></label>
              {kind === "revoke" && <label>이유 (기록에 남아요)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예) 잘못 지급해서 회수" /></label>}
              <button type="button" className={kind === "revoke" ? "is-danger" : "is-primary"} disabled={busy} onClick={() => void submit()}>{busy ? "처리 중…" : kind === "revoke" ? "회수하기" : "지급하기"}</button>
            </div>
          </>
        )}
        {message && <p role="status" className={message.ok ? "admin-ok" : "admin-error"}>{message.text}</p>}
        <p className="admin-muted">스킨·이모티콘 지급은 ‘스킨 · 이모티콘’ 화면에서 해요.</p>
      </section>
    </div>
  );
}

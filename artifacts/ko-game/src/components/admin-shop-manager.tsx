import { useEffect, useMemo, useState } from "react";
import { Coins, Plus, Save, ShoppingBag, Trash2 } from "lucide-react";

const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/shop`;

type Pack = { id: string; name: string; status: string };
type Listing = { id: string; packDefinitionId: string; price: number; isActive: number; displayOrder: number; pack: Pack };
type User = { id: string; nickname: string; email: string; currency: number };
type AdminShopData = { listings: Listing[]; packs: Pack[]; users: User[] };

async function request<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: "include", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export function AdminShopManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<AdminShopData | null>(null);
  const [message, setMessage] = useState("상점 설정을 불러오는 중...");
  const [draft, setDraft] = useState({ packDefinitionId: "", price: "100", displayOrder: "0", isActive: true });
  const [grant, setGrant] = useState({ userId: "", amount: "100" });
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      setData(await request<AdminShopData>());
      setMessage("");
    } catch (error) {
      if (error instanceof Error && (error.message.includes("권한") || error.message.includes("로그인"))) onUnauthorized();
      else setMessage(error instanceof Error ? error.message : "상점 설정을 불러오지 못했습니다.");
    }
  }
  useEffect(() => { void refresh(); }, []);

  const availablePacks = useMemo(() => data?.packs.filter((pack) => !data.listings.some((listing) => listing.packDefinitionId === pack.id)) ?? [], [data]);

  async function saveListing(listing?: Listing) {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        packDefinitionId: listing?.packDefinitionId ?? draft.packDefinitionId,
        price: listing ? listing.price : Number(draft.price),
        displayOrder: listing ? listing.displayOrder : Number(draft.displayOrder),
        isActive: listing ? listing.isActive === 1 : draft.isActive,
      };
      const result = await request<{ listing: Listing }>(listing ? `/${listing.id}` : "", { method: listing ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setData((current) => current ? { ...current, listings: listing ? current.listings.map((item) => item.id === listing.id ? { ...item, ...result.listing, pack: item.pack } : item) : [...current.listings, { ...result.listing, pack: current.packs.find((pack) => pack.id === result.listing.packDefinitionId)! }] } : current);
      setMessage("상점 설정을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function removeListing(id: string) {
    if (!window.confirm("이 팩을 상점에서 제거할까요?")) return;
    try {
      await request(`/${id}`, { method: "DELETE" });
      setData((current) => current ? { ...current, listings: current.listings.filter((listing) => listing.id !== id) } : current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다."); }
  }

  async function grantCurrency() {
    try {
      await request("/currency/grant", { method: "POST", body: JSON.stringify({ userId: grant.userId, amount: Number(grant.amount) }) });
      setMessage("재화를 지급했습니다.");
      setGrant({ userId: "", amount: grant.amount });
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "재화 지급에 실패했습니다."); }
  }

  if (!data) return <section className="rounded-xl border border-neutral-800 bg-black/40 p-6 text-sm text-neutral-400">{message}</section>;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-black/40 p-5 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4"><div><p className="font-display text-xs font-bold tracking-[0.25em] text-primary">SHOP LISTINGS</p><h2 className="mt-2 text-xl font-black">상점 판매 팩</h2><p className="mt-2 text-sm text-neutral-500">PUBLISHED 팩만 판매할 수 있습니다. 가격과 노출 순서를 설정하세요.</p></div><ShoppingBagIcon /></div>
        {message && <p className="mb-4 rounded border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">{message}</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_110px_auto]">
          <select value={draft.packDefinitionId} onChange={(event) => setDraft({ ...draft, packDefinitionId: event.target.value })} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm">
            <option value="">판매할 PUBLISHED 팩 선택</option>{availablePacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
          </select>
          <input type="number" min="1" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="가격" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
          <input type="number" min="0" value={draft.displayOrder} onChange={(event) => setDraft({ ...draft, displayOrder: event.target.value })} placeholder="순서" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
          <button type="button" disabled={!draft.packDefinitionId || saving} onClick={() => void saveListing()} className="flex items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-black disabled:opacity-50"><Plus className="h-4 w-4" /> 등록</button>
        </div>
        <div className="mt-6 space-y-3">
          {data.listings.length === 0 && <p className="rounded border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">등록된 판매 팩이 없습니다.</p>}
          {data.listings.map((listing) => <ListingEditor key={listing.id} listing={listing} saving={saving} onSave={saveListing} onRemove={removeListing} />)}
        </div>
      </section>
      <section className="rounded-xl border border-neutral-800 bg-black/40 p-5 sm:p-7">
        <div className="mb-5 flex items-start gap-3"><Coins className="mt-1 h-5 w-5 text-amber-400" /><div><h2 className="text-xl font-black">사용자 재화 지급</h2><p className="mt-1 text-sm text-neutral-500">테스트 또는 운영 보상으로 Gold를 지급합니다.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
          <select value={grant.userId} onChange={(event) => setGrant({ ...grant, userId: event.target.value })} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm">
            <option value="">사용자 선택</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.nickname} · {user.currency.toLocaleString()} Gold</option>)}
          </select>
          <input type="number" min="1" value={grant.amount} onChange={(event) => setGrant({ ...grant, amount: event.target.value })} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
          <button type="button" disabled={!grant.userId} onClick={() => void grantCurrency()} className="flex items-center justify-center gap-2 rounded border border-amber-700 px-4 py-2 text-sm font-black text-amber-300 disabled:opacity-50"><Coins className="h-4 w-4" /> 지급</button>
        </div>
      </section>
    </div>
  );
}

function ShoppingBagIcon() {
  return <div className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-amber-300"><ShoppingBag className="h-5 w-5" /></div>;
}

function ListingEditor({ listing, saving, onSave, onRemove }: { listing: Listing; saving: boolean; onSave: (listing: Listing) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [price, setPrice] = useState(String(listing.price));
  const [displayOrder, setDisplayOrder] = useState(String(listing.displayOrder));
  const [isActive, setIsActive] = useState(listing.isActive === 1);
  return (
    <div className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 sm:grid-cols-[1fr_130px_100px_auto_auto] sm:items-center">
      <div><p className="font-black">{listing.pack.name}</p><p className="mt-1 text-xs text-neutral-600">{listing.pack.status}</p></div>
      <input type="number" min="1" value={price} onChange={(event) => setPrice(event.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" />
      <input type="number" min="0" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" />
      <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> 판매 중</label>
      <button type="button" disabled={saving} onClick={() => void onSave({ ...listing, price: Number(price), displayOrder: Number(displayOrder), isActive: isActive ? 1 : 0 })} className="flex items-center justify-center gap-2 rounded border border-neutral-700 px-3 py-2 text-xs font-black text-neutral-200 hover:border-amber-500"><Save className="h-3.5 w-3.5" /> 저장</button>
      <button type="button" onClick={() => void onRemove(listing.id)} className="flex items-center justify-center gap-2 rounded border border-red-900/70 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-950/40"><Trash2 className="h-3.5 w-3.5" /> 제거</button>
    </div>
  );
}
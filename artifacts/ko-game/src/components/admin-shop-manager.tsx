import { useEffect, useMemo, useState } from "react";
import { Copy, ImagePlus, Package, Plus, Save, ShoppingBag, Trash2, X } from "lucide-react";

const adminBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;
const base = `${adminBase}/shop`;

type Pack = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  status: string;
  deletedAt: string | null;
};

type Listing = {
  id: string;
  name: string;
  description: string;
  imageAssetId: string | null;
  imageUrl: string | null;
  productType: "PACK";
  packDefinitionId: string;
  quantity: number;
  price: number;
  enabled: boolean;
  isActive: number;
  displayOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  pack: Pack;
  packUnavailable: boolean;
  isSaleable: boolean;
};

type AdminShopData = { listings: Listing[]; packs: Pack[] };
type ListingForm = {
  name: string;
  description: string;
  imageAssetId: string | null;
  imageUrl: string | null;
  imageUploadToken: string | null;
  packDefinitionId: string;
  quantity: string;
  price: string;
  enabled: boolean;
  displayOrder: string;
  startsAt: string;
  endsAt: string;
};

const emptyForm: ListingForm = {
  name: "",
  description: "",
  imageAssetId: null,
  imageUrl: null,
  imageUploadToken: null,
  packDefinitionId: "",
  quantity: "1",
  price: "0",
  enabled: false,
  displayOrder: "0",
  startsAt: "",
  endsAt: "",
};

async function request<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 16) : "";
}

function formatDate(value: string | null): string {
  if (!value) return "상시";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "날짜 오류" : date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

export function AdminShopManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<AdminShopData | null>(null);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [form, setForm] = useState<ListingForm>(emptyForm);
  const [message, setMessage] = useState("상점 상품을 불러오는 중...");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function load() {
    try {
      setData(await request<AdminShopData>());
      setMessage("");
    } catch (error) {
      if (error instanceof Error && (error.message.includes("권한") || error.message.includes("로그인"))) {
        onUnauthorized();
        return;
      }
      setMessage(error instanceof Error ? error.message : "상점 상품을 불러오지 못했습니다.");
    }
  }

  useEffect(() => { void load(); }, []);

  function newListing() {
    setSelected(null);
    setForm({ ...emptyForm });
    setMessage("");
  }

  function editListing(listing: Listing) {
    setSelected(listing);
    setForm({
      name: listing.name,
      description: listing.description,
      imageAssetId: listing.imageAssetId,
      imageUrl: listing.imageUrl,
      imageUploadToken: null,
      packDefinitionId: listing.packDefinitionId,
      quantity: String(listing.quantity),
      price: String(listing.price),
      enabled: listing.enabled,
      displayOrder: String(listing.displayOrder),
      startsAt: toDateInput(listing.startsAt),
      endsAt: toDateInput(listing.endsAt),
    });
    setMessage("");
  }

  function update<K extends keyof ListingForm>(key: K, value: ListingForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (saving || uploading) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        name: form.name,
        description: form.description,
        imageAssetId: form.imageAssetId,
        productType: "PACK",
        packDefinitionId: form.packDefinitionId,
        quantity: Number(form.quantity),
        price: Number(form.price),
        enabled: form.enabled,
        displayOrder: Number(form.displayOrder),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      await request<{ listing: Listing }>(selected ? `/${selected.id}` : "", {
        method: selected ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      await load();
      setMessage("상품을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상품을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicateListing(listing: Listing) {
    try {
      await request(`/${listing.id}/duplicate`, { method: "POST" });
      await load();
      setMessage("상품을 복제했습니다. 복제본은 판매 OFF 상태입니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상품을 복제하지 못했습니다.");
    }
  }

  async function toggleListing(listing: Listing) {
    try {
      await request(`/${listing.id}/toggle`, { method: "POST", body: JSON.stringify({ enabled: !listing.enabled }) });
      await load();
      setMessage(listing.enabled ? "상품을 판매 중지했습니다." : "상품을 판매 ON으로 변경했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "판매 상태를 변경하지 못했습니다.");
    }
  }

  async function deleteListing(listing: Listing) {
    if (!window.confirm(`“${listing.name}” 상품을 삭제할까요?`)) return;
    try {
      await request(`/${listing.id}`, { method: "DELETE" });
      if (selected?.id === listing.id) newListing();
      await load();
      setMessage("상품을 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상품을 삭제하지 못했습니다.");
    }
  }

  async function discardPendingImage() {
    if (!form.imageAssetId || !form.imageUploadToken) return;
    await fetch(`${adminBase}/cards/images/discard`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageAssetId: form.imageAssetId, imageUploadToken: form.imageUploadToken }),
    });
  }

  async function uploadImage(file: File) {
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    const valid = (file.type === "image/png" && extension === "png")
      || (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension))
      || (file.type === "image/webp" && extension === "webp");
    if (!valid) {
      setMessage("PNG, JPG, JPEG, WEBP 이미지만 업로드할 수 있습니다.");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      await discardPendingImage();
      const uploadResponse = await fetch(`${adminBase}/cards/images/upload-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (uploadResponse.status === 401 || uploadResponse.status === 403) { onUnauthorized(); return; }
      if (!uploadResponse.ok) throw new Error("이미지 업로드 주소를 만들지 못했습니다.");
      const upload = await uploadResponse.json() as { uploadURL: string; objectPath: string };
      const putResponse = await fetch(upload.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putResponse.ok) throw new Error("이미지 파일 업로드에 실패했습니다.");
      const completeResponse = await fetch(`${adminBase}/cards/images/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath: upload.objectPath, contentType: file.type }),
      });
      if (!completeResponse.ok) throw new Error("이미지 업로드를 완료하지 못했습니다.");
      const asset = await completeResponse.json() as { imageAssetId: string; imageUrl: string; imageUploadToken: string };
      setForm((current) => ({ ...current, imageAssetId: asset.imageAssetId, imageUrl: asset.imageUrl, imageUploadToken: asset.imageUploadToken }));
      setMessage("상품 이미지를 업로드했습니다. 저장을 눌러 적용하세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이미지를 업로드하지 못했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function clearImage() {
    try {
      await discardPendingImage();
      setForm((current) => ({ ...current, imageAssetId: null, imageUrl: null, imageUploadToken: null }));
    } catch {
      setMessage("이미지를 해제하지 못했습니다.");
    }
  }

  if (!data) {
    return <section className="rounded-xl border border-neutral-800 bg-black/40 p-6 text-sm text-neutral-400">{message}</section>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-black/40 p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-xs font-bold tracking-[0.25em] text-primary">SHOP ADMIN</p>
            <h2 className="mt-2 text-xl font-black">상점 상품 관리</h2>
            <p className="mt-2 text-sm text-neutral-500">Pack Admin은 내용물과 확률을, 이 화면은 판매 상품과 가격을 관리합니다.</p>
          </div>
          <button type="button" onClick={newListing} className="flex items-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-black text-black hover:bg-yellow-400">
            <Plus className="h-4 w-4" /> 새 상품 만들기
          </button>
        </div>
        {message && <p role="status" className="mb-4 rounded border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">{message}</p>}
        <div className="grid gap-3">
          {data.listings.length === 0 && <p className="rounded border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">등록된 상품이 없습니다.</p>}
          {data.listings.map((listing) => (
            <ListingRow key={listing.id} listing={listing} selected={selected?.id === listing.id} onEdit={() => editListing(listing)} onDuplicate={() => void duplicateListing(listing)} onToggle={() => void toggleListing(listing)} onDelete={() => void deleteListing(listing)} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-black/40 p-5 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <Package className="h-5 w-5 text-primary" />
          <div><h2 className="text-xl font-black">{selected ? "상품 편집" : "새 상품 만들기"}</h2><p className="mt-1 text-sm text-neutral-500">현재는 PACK 상품만 지원합니다. 실제 구매는 아직 연결하지 않습니다.</p></div>
        </div>
        <ProductForm
          data={data}
          form={form}
          selected={selected}
          saving={saving}
          uploading={uploading}
          onUpdate={update}
          onUpload={(file) => void uploadImage(file)}
          onClearImage={() => void clearImage()}
          onCancel={newListing}
          onSave={() => void save()}
        />
      </section>
    </div>
  );
}

function ListingRow({ listing, selected, onEdit, onDuplicate, onToggle, onDelete }: { listing: Listing; selected: boolean; onEdit: () => void; onDuplicate: () => void; onToggle: () => void; onDelete: () => void }) {
  const imageUrl = listing.imageUrl || listing.pack.imageUrl;
  return (
    <article className={`grid gap-3 rounded-lg border p-3 transition sm:grid-cols-[64px_1fr_auto] sm:items-center ${selected ? "border-primary/70 bg-primary/5" : "border-neutral-800 bg-neutral-950/60"}`}>
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-neutral-800 bg-neutral-900">
        {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <ShoppingBag className="h-6 w-6 text-neutral-600" />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-black">{listing.name}</h3><span className={`rounded px-2 py-0.5 text-[10px] font-black ${listing.enabled ? "bg-emerald-950 text-emerald-300" : "bg-neutral-800 text-neutral-500"}`}>{listing.enabled ? "판매 ON" : "판매 OFF"}</span></div>
        <p className="mt-1 text-xs text-neutral-400">Pack: {listing.pack.name} · {listing.quantity}개 · {listing.price.toLocaleString()} G · 순서 {listing.displayOrder}</p>
        <p className="mt-1 text-[11px] text-neutral-600">{formatDate(listing.startsAt)} ~ {formatDate(listing.endsAt)}</p>
        {listing.packUnavailable && <p className="mt-2 text-xs font-bold text-amber-300">연결된 팩을 판매할 수 없습니다. ({listing.pack.status})</p>}
        {!listing.packUnavailable && listing.enabled && !listing.isSaleable && <p className="mt-2 text-xs font-bold text-amber-300">현재 판매 기간이 아닙니다.</p>}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <button type="button" onClick={onEdit} className="rounded border border-neutral-700 px-3 py-2 text-xs font-black text-neutral-200 hover:border-amber-400">편집</button>
        <button type="button" onClick={onDuplicate} className="flex items-center gap-1 rounded border border-neutral-700 px-3 py-2 text-xs font-black text-neutral-300 hover:border-amber-400"><Copy className="h-3.5 w-3.5" /> 복제</button>
        <button type="button" onClick={onToggle} className="rounded border border-amber-800/70 px-3 py-2 text-xs font-black text-amber-300 hover:bg-amber-950/40">{listing.enabled ? "판매 OFF" : "판매 ON"}</button>
        <button type="button" onClick={onDelete} aria-label={`${listing.name} 삭제`} className="rounded border border-red-900/70 p-2 text-red-300 hover:bg-red-950/40"><Trash2 className="h-4 w-4" /></button>
      </div>
    </article>
  );
}

function ProductForm({ data, form, selected, saving, uploading, onUpdate, onUpload, onClearImage, onCancel, onSave }: {
  data: AdminShopData;
  form: ListingForm;
  selected: Listing | null;
  saving: boolean;
  uploading: boolean;
  onUpdate: <K extends keyof ListingForm>(key: K, value: ListingForm[K]) => void;
  onUpload: (file: File) => void;
  onClearImage: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const selectedPack = data.packs.find((pack) => pack.id === form.packDefinitionId) ?? selected?.pack;
  const packOptions = useMemo(() => {
    const options = [...data.packs];
    if (selectedPack && !options.some((pack) => pack.id === selectedPack.id)) options.push(selectedPack);
    return options;
  }, [data.packs, selectedPack]);
  const previewImage = form.imageUrl || selectedPack?.imageUrl || null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">상품명<input value={form.name} onChange={(event) => onUpdate("name", event.target.value)} placeholder="KO 기본팩 5개" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm" /></label>
        <label className="text-sm font-bold">상품 타입<input value="PACK" readOnly className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-500" /></label>
        <label className="text-sm font-bold sm:col-span-2">설명<textarea value={form.description} onChange={(event) => onUpdate("description", event.target.value)} placeholder="상품 설명" className="mt-1 min-h-20 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm" /></label>
        <label className="text-sm font-bold">연결 Pack<select value={form.packDefinitionId} onChange={(event) => onUpdate("packDefinitionId", event.target.value)} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm"><option value="">PUBLISHED Pack 선택</option>{packOptions.map((pack) => <option key={pack.id} value={pack.id} disabled={pack.status !== "PUBLISHED"}>{pack.status === "PUBLISHED" ? "" : "[판매 불가] "}{pack.name}</option>)}</select></label>
        <label className="text-sm font-bold">지급 Pack 수량<input type="number" min="1" max="999" value={form.quantity} onChange={(event) => onUpdate("quantity", event.target.value)} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm" /></label>
        <label className="text-sm font-bold">가격 (Gold)<input type="number" min="0" value={form.price} onChange={(event) => onUpdate("price", event.target.value)} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm" /></label>
        <label className="text-sm font-bold">표시 순서<input type="number" min="0" value={form.displayOrder} onChange={(event) => onUpdate("displayOrder", event.target.value)} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm" /></label>
        <label className="text-sm font-bold">판매 시작일<input type="datetime-local" value={form.startsAt} onChange={(event) => onUpdate("startsAt", event.target.value)} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm" /></label>
        <label className="text-sm font-bold">판매 종료일<input type="datetime-local" value={form.endsAt} onChange={(event) => onUpdate("endsAt", event.target.value)} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm" /></label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.enabled} onChange={(event) => onUpdate("enabled", event.target.checked)} /> 판매 ON</label>
        <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-2"><button type="button" onClick={onCancel} className="rounded border border-neutral-700 px-4 py-2.5 text-sm font-bold text-neutral-300">초기화</button><button type="button" disabled={saving || uploading} onClick={onSave} className="flex items-center gap-2 rounded bg-primary px-5 py-2.5 text-sm font-black text-black disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "저장 중..." : "상품 저장"}</button></div>
      </div>

      <aside className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
        <p className="mb-3 text-xs font-black tracking-[0.2em] text-primary">PRODUCT PREVIEW</p>
        <div className="overflow-hidden rounded-lg border border-neutral-800 bg-black/50">
          <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-amber-950/60 to-neutral-950">
            {previewImage ? <img src={previewImage} alt="" className="h-full w-full object-cover" /> : <ShoppingBag className="h-12 w-12 text-amber-400/70" />}
          </div>
          <div className="p-4"><p className="font-black">{form.name || "상품명"}</p><p className="mt-1 text-xs text-neutral-500">{form.description || "상품 설명"}</p><div className="mt-4 flex items-center justify-between gap-2"><span className="text-xs font-bold text-amber-200">팩 {Number(form.quantity) || 0}개 지급</span><span className="font-black text-amber-300">{(Number(form.price) || 0).toLocaleString()} G</span></div></div>
        </div>
        <div className="mt-4">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-neutral-700 px-3 py-2.5 text-xs font-bold text-neutral-300 hover:border-amber-400"><ImagePlus className="h-4 w-4" /> {uploading ? "업로드 중..." : "상품 이미지 업로드"}<input type="file" accept=".png,.jpg,.jpeg,.webp" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} /></label>
          {form.imageUrl && <button type="button" onClick={onClearImage} className="mt-2 flex w-full items-center justify-center gap-1 text-xs text-neutral-500 hover:text-red-300"><X className="h-3 w-3" /> 상품 이미지 제거 · Pack 이미지로 대체</button>}
        </div>
        {selectedPack && <p className="mt-4 text-[11px] leading-5 text-neutral-600">연결 Pack: {selectedPack.name}<br />내용물과 확률은 Pack Admin에서만 수정합니다.</p>}
      </aside>
    </div>
  );
}
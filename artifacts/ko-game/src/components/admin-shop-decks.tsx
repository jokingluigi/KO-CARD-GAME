import { useEffect, useMemo, useState } from "react";
import {
  shopDeckRequest,
  deckCounts,
  type ShopDeckCatalog,
  type ShopDeckProduct,
  type ShopDeckCard,
} from "@/lib/shop-decks-client";
import { maxCardCopies } from "../../../../lib/game-engine/src/rules";
import { ShopDeckDetail } from "./shop-deck-detail";
import { CardDetailDialog } from "./card-detail-dialog";
import { CardArtwork } from "./card-artwork";
const blank = (): ShopDeckProduct => ({
  id: "",
  name: "",
  description: "",
  imageUrl: null,
  cardDefinitionIds: [],
  price: 0,
  recommendedChampionId: null,
  includeChampion: false,
  allowUnpublished: false,
  enabled: false,
  displayOrder: 0,
});
const input =
  "min-h-11 w-full min-w-0 rounded border border-neutral-700 bg-neutral-900 p-2 text-base";
const button =
  "min-h-11 rounded border border-neutral-700 px-3 py-2 disabled:opacity-40";
export function AdminShopDecks() {
  const [data, setData] = useState<ShopDeckCatalog | null>(null),
    [form, setForm] = useState(blank),
    [query, setQuery] = useState(""),
    [cost, setCost] = useState(""),
    [message, setMessage] = useState("불러오는 중..."),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [detail, setDetail] = useState<ShopDeckCard | null>(null);
  async function load() {
    setData(await shopDeckRequest<ShopDeckCatalog>("/admin/shop-decks"));
  }
  useEffect(() => {
    void load()
      .then(() => setMessage(""))
      .catch((e) => setMessage(e.message));
  }, []);
  const byId = useMemo(
      () => new Map(data?.cards.map((c) => [c.id, c]) ?? []),
      [data],
    ),
    counts = deckCounts(form.cardDefinitionIds);
  const legendary = form.cardDefinitionIds.filter(
    (id) => byId.get(id)?.rarity === "LEGENDARY",
  ).length;
  const problems: string[] = [];
  if (form.cardDefinitionIds.length !== 25)
    problems.push(`25장 필요 (현재 ${form.cardDefinitionIds.length}장)`);
  if (legendary > 3) problems.push("레전더리 총 3장 초과");
  for (const [id, n] of counts) {
    const c = byId.get(id);
    if (
      !c ||
      c.isToken ||
      c.isChampionToken ||
      !["WRESTLER", "TECHNIQUE"].includes(c.cardType) ||
      !["NORMAL", "EPIC", "LEGENDARY"].includes(c.rarity) ||
      !(
        c.status === "PUBLISHED" ||
        (form.allowUnpublished && c.status === "DRAFT")
      )
    )
      problems.push(`${c?.name ?? id}: 판매 불가`);
    else if (n > maxCardCopies(c.rarity))
      problems.push(`${c.name}: 수량 제한 초과`);
  }
  if (form.includeChampion && !form.recommendedChampionId)
    problems.push("포함할 챔피언 선택 필요");
  const available = (data?.cards ?? []).filter(
    (c) =>
      !c.isToken &&
      !c.isChampionToken &&
      ["WRESTLER", "TECHNIQUE"].includes(c.cardType) &&
      ["NORMAL", "EPIC", "LEGENDARY"].includes(c.rarity) &&
      (c.status === "PUBLISHED" ||
        (form.allowUnpublished && c.status === "DRAFT")) &&
      c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (cost === "" || c.cost === Number(cost)),
  );
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    await run(async () => {
      const r = await shopDeckRequest<{ item: ShopDeckProduct }>(
        `/admin/shop-decks${form.id ? "/" + encodeURIComponent(form.id) : ""}`,
        { method: form.id ? "PATCH" : "POST", body: JSON.stringify(form) },
      );
      setForm(r.item);
      await load();
      setMessage("판매용 덱을 저장했습니다.");
    });
  }
  async function upload(file: File) {
    await run(async () => {
      const r = await shopDeckRequest<{
        uploadURL: string;
        objectPath: string;
      }>("/admin/shop-decks/uploads", {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      const res = await fetch(r.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("파일 업로드 실패");
      const complete = await shopDeckRequest<{ imageUrl: string }>(
        "/admin/shop-decks/uploads/complete",
        {
          method: "POST",
          body: JSON.stringify({
            objectPath: r.objectPath,
            contentType: file.type,
          }),
        },
      );
      setForm((f) => ({ ...f, imageUrl: complete.imageUrl }));
      setMessage("대표 이미지 검증 완료");
    });
  }
  function changeCard(id: string, n: number) {
    setForm((f) => ({
      ...f,
      cardDefinitionIds:
        n > 0
          ? [...f.cardDefinitionIds, id]
          : f.cardDefinitionIds.filter(
              (value, i) =>
                value !== id || i !== f.cardDefinitionIds.indexOf(id),
            ),
    }));
  }
  const expanded = {
    ...form,
    cards: data?.cards,
    recommendedChampion:
      data?.champions.find((c) => c.id === form.recommendedChampionId) ?? null,
  };
  return (
    <section aria-label="상점 덱 관리" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">상점 덱 관리</h2>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => {
            setForm(blank());
            setMessage("");
          }}
        >
          새 판매용 덱
        </button>
      </div>
      {message && (
        <p role="status" className="break-words text-amber-200">
          {message}
        </p>
      )}
      <p className="text-sm text-neutral-400">
        공개 카드가 기본입니다. 미공개 판매 허용을 켜면 DRAFT 카드도 실제
        플레이어에게 지급·공개됩니다. 토큰은 판매할 수 없습니다. 각 상품은
        계정당 1회 구매합니다.
      </p>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[260px_1fr]">
        <aside className="max-h-72 min-w-0 space-y-2 overflow-y-auto xl:max-h-none">
          {data?.items.map((item) => (
            <div
              key={item.id}
              className="rounded border border-neutral-800 p-3"
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => setForm(item)}
                className="min-h-11 w-full break-words text-left text-amber-200"
              >
                {item.name}
              </button>
              <p className="text-sm">
                {item.enabled ? "판매 중" : "판매 중지"} ·{" "}
                {item.price.toLocaleString()} 크레딧 · 순서 {item.displayOrder}
              </p>
            </div>
          ))}
        </aside>
        <div className="min-w-0 space-y-4">
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <label className="block">
              덱 이름 (최대 30자)
              <input
                className={input}
                aria-label="판매 덱 이름"
                value={form.name}
                maxLength={30}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
            <label className="block">
              설명
              <textarea
                className={input}
                maxLength={2000}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                판매 가격
                <input
                  aria-label="판매 가격"
                  className={input}
                  type="number"
                  min={0}
                  max={2000000000}
                  step={1}
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                정렬 순서
                <input
                  aria-label="정렬 순서"
                  className={input}
                  type="number"
                  step={1}
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      displayOrder: Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <label className="block">
              대표 이미지 (PNG·WebP·JPEG 최대 5MB)
              <input
                aria-label="덱 대표 이미지 업로드"
                className="mt-2 block max-w-full text-base"
                type="file"
                accept="image/png,image/webp,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = "";
                }}
              />
            </label>
            {form.imageUrl && (
              <>
                <div className="h-40">
                  <CardArtwork
                    src={form.imageUrl}
                    alt="덱 대표 이미지 미리보기"
                    className="h-full w-full"
                    imageDisplayMode="CONTAIN"
                  />
                </div>
                <button
                  type="button"
                  className={button}
                  onClick={() => setForm((f) => ({ ...f, imageUrl: null }))}
                >
                  대표 이미지 해제
                </button>
              </>
            )}
            <label className="block">
              추천 챔피언
              <select
                className={input}
                aria-label="추천 챔피언"
                value={form.recommendedChampionId ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    recommendedChampionId: e.target.value || null,
                    includeChampion: e.target.value ? f.includeChampion : false,
                  }))
                }
              >
                <option value="">없음 (구매자의 보유 챔피언 사용)</option>
                {data?.champions
                  .filter(
                    (c) =>
                      c.status === "PUBLISHED" ||
                      (form.allowUnpublished && c.status === "DRAFT"),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={form.includeChampion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, includeChampion: e.target.checked }))
                }
              />
              추천 챔피언 소유권 함께 지급
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={form.allowUnpublished}
                onChange={(e) =>
                  setForm((f) => ({ ...f, allowUnpublished: e.target.checked }))
                }
              />
              미공개(DRAFT) 카드·챔피언 판매 허용
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, enabled: e.target.checked }))
                }
              />
              판매 활성화
            </label>
            <div className="rounded border border-amber-900 p-3" role="status">
              총 {form.cardDefinitionIds.length}/25장 · 레전더리 {legendary}/3장
              {problems.length > 0 && (
                <p className="mt-2 break-words text-sm text-red-300">
                  {problems.join(" · ")}
                </p>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {[...counts].map(([id, n]) => (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded bg-neutral-900 p-2"
                >
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 break-words text-left"
                    onClick={() => setDetail(byId.get(id) ?? null)}
                  >
                    {byId.get(id)?.name ?? id} ×{n}
                  </button>
                  <button
                    type="button"
                    aria-label={`${byId.get(id)?.name ?? id} 제거`}
                    className={button}
                    onClick={() => changeCard(id, -1)}
                  >
                    −
                  </button>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
              <input
                aria-label="카드명 검색"
                placeholder="카드명 검색"
                className={input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <input
                aria-label="코스트 검색"
                placeholder="코스트"
                className={input}
                type="number"
                min={0}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {available.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded border border-neutral-800 p-2"
                >
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 break-words text-left"
                    onClick={() => setDetail(c)}
                  >
                    {c.cost} · {c.name}
                    <small className="block text-neutral-400">
                      {c.rarity} · {counts.get(c.id) ?? 0}/
                      {maxCardCopies(c.rarity)}
                      {c.status === "DRAFT" ? " · 미공개" : ""}
                    </small>
                  </button>
                  <button
                    type="button"
                    aria-label={`${c.name} 추가`}
                    className={button}
                    disabled={
                      form.cardDefinitionIds.length >= 25 ||
                      (counts.get(c.id) ?? 0) >= maxCardCopies(c.rarity) ||
                      (c.rarity === "LEGENDARY" && legendary >= 3)
                    }
                    onClick={() => changeCard(c.id, 1)}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button}
                onClick={() => setPreview(true)}
              >
                덱 구성 미리보기
              </button>
              <button
                type="button"
                className={`${button} bg-primary text-black`}
                disabled={
                  !!problems.length ||
                  !form.name.trim() ||
                  !Number.isInteger(form.price) ||
                  form.price < 0
                }
                onClick={() => void save()}
              >
                판매 덱 저장
              </button>
              {form.id && (
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    void run(async () => {
                      const r = await shopDeckRequest<{
                        item: ShopDeckProduct;
                      }>(
                        `/admin/shop-decks/${encodeURIComponent(form.id)}/disable`,
                        { method: "POST" },
                      );
                      setForm(r.item);
                      await load();
                      setMessage(
                        "판매를 중지했습니다. 기존 구매 내역과 덱은 유지됩니다.",
                      );
                    })
                  }
                >
                  즉시 판매 중지
                </button>
              )}
            </div>
          </fieldset>
        </div>
      </div>
      {preview && (
        <ShopDeckDetail product={expanded} onClose={() => setPreview(false)} />
      )}
      <CardDetailDialog
        card={detail}
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
    </section>
  );
}

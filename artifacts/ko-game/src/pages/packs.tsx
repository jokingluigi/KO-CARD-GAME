import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gift } from "lucide-react";
import { PackOpening } from "@/components/pack-opening";
import { fetchPacks, openPack, type Pack, type PackReward } from "@/lib/collection-client";

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selected, setSelected] = useState<Pack | null>(null);
  const [rewards, setRewards] = useState<PackReward[]>([]);
  const [revealed, setRevealed] = useState(-1);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState("내 팩을 불러오는 중...");
  const available = useMemo(() => packs, [packs]);

  useEffect(() => {
    fetchPacks()
      .then((body) => { setPacks(body.packs); setMessage(""); })
      .catch((error: Error) => {
        if (error.message.includes("로그인이 필요합니다")) {
          window.location.href = import.meta.env.BASE_URL;
          return;
        }
        setMessage(error.message);
      });
  }, []);

  async function handleOpen(pack: Pack) {
    if (opening || pack.quantity < 1) return;
    setOpening(true);
    setSelected(pack);
    setMessage("");
    try {
      const result = await openPack(pack.id);
      setSelected(pack);
      setRewards(result.rewards);
      setRevealed(-1);
      setPacks(await fetchPacks().then((body) => body.packs));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팩을 열 수 없습니다.");
    } finally {
      setOpening(false);
    }
  }

  function closeOpening() {
    setSelected(null);
    setRewards([]);
    setRevealed(-1);
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-7 text-neutral-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <button type="button" onClick={() => { window.location.href = import.meta.env.BASE_URL; }} className="mb-7 flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> 메인 메뉴</button>
        <header className="mb-8 flex items-end justify-between border-b border-neutral-800 pb-6">
          <div><p className="font-display text-xs font-bold tracking-[0.25em] text-primary">PACK INVENTORY</p><h1 className="mt-2 text-3xl font-black">내 팩</h1></div>
          <Gift className="h-8 w-8 text-amber-400" />
        </header>
        {message && <p className="mb-6 rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{message}</p>}
        {available.length === 0 && !message && <div className="rounded-xl border border-dashed border-neutral-800 px-5 py-16 text-center text-sm text-neutral-500">현재 공개된 팩이 없습니다.</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((pack) => (
            <article key={pack.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-black/40">
              <div className="flex min-h-36 items-center justify-center bg-gradient-to-br from-amber-950/50 to-neutral-950 p-5">
                {pack.imageUrl ? <img src={pack.imageUrl} alt="" className="max-h-32 rounded object-contain" /> : <Gift className="h-16 w-16 text-amber-400/80" />}
              </div>
              <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{pack.name}</h2><p className="mt-1 text-sm text-neutral-500">{pack.description || "KO 카드팩"}</p></div><span className="rounded bg-amber-400 px-2 py-1 text-sm font-black text-black">×{pack.quantity}</span></div><p className="mt-4 text-xs text-neutral-400">{pack.cardsPerPack}장 · 일반 {pack.normalRate}% · 레전더리 {pack.legendaryRate}% · Champion {pack.championRate}% · Skin Chance {pack.skinChance}%</p><button type="button" disabled={opening || pack.quantity < 1} onClick={() => void handleOpen(pack)} className="mt-5 w-full rounded bg-primary px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50">{opening && selected?.id === pack.id ? "개봉 중..." : pack.quantity > 0 ? "개봉" : "보유 없음"}</button></div>
            </article>
          ))}
        </div>
        {selected && rewards.length > 0 && <PackOpening packName={selected.name} rewards={rewards} onClose={closeOpening} />}
      </div>
    </main>
  );
}
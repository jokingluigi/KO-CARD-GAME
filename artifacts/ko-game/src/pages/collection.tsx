import { useEffect, useState } from "react";
import { ArrowLeft, Box, Shield, Sparkles } from "lucide-react";
import { fetchCollection, fetchPacks, openPack, type Collection, type Pack } from "@/lib/collection-client";

export default function CollectionPage() {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [message, setMessage] = useState("수집품을 불러오는 중...");
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([fetchCollection(), fetchPacks()])
      .then(([nextCollection, nextPacks]) => { setCollection(nextCollection); setPacks(nextPacks.packs); setMessage(""); })
      .catch((error: Error) => {
        if (error.message.includes("로그인이 필요합니다")) {
          window.location.href = import.meta.env.BASE_URL;
          return;
        }
        setMessage(error.message);
      });
  }, []);
  async function handleOpen(pack: Pack) {
    setOpening(pack.id); setMessage("");
    try {
      const result = await openPack(pack.id);
      const names = result.rewards.map((reward) => {
        const card = reward.card as { name?: string } | undefined;
        const champion = reward.champion as { name?: string } | undefined;
        return card?.name ?? champion?.name ?? "보상";
      });
      setMessage(`${pack.name} 개봉 완료: ${names.join(", ")}`);
      setCollection(await fetchCollection());
    } catch (error) { setMessage(error instanceof Error ? error.message : "팩을 열 수 없습니다."); }
    finally { setOpening(null); }
  }
  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-8 text-neutral-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <button type="button" onClick={() => { window.location.href = import.meta.env.BASE_URL; }} className="mb-7 flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> 메인 메뉴</button>
        <header className="mb-8 flex items-end justify-between gap-4 border-b border-neutral-800 pb-6">
          <div><p className="font-display text-xs font-bold tracking-[0.25em] text-primary">COLLECTION</p><h1 className="mt-2 text-3xl font-black">내 수집품</h1></div>
          <div className="text-right text-sm text-neutral-500"><span className="font-bold text-white">{collection?.cards.length ?? 0}</span> 카드 · <span className="font-bold text-white">{collection?.champions.length ?? 0}</span> Champion</div>
        </header>
        {message && <p className="mb-6 rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{message}</p>}
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2"><Box className="h-5 w-5 text-primary" /><h2 className="text-xl font-black">카드팩</h2></div>
          {packs.length === 0 ? <p className="text-sm text-neutral-500">현재 공개된 카드팩이 없습니다.</p> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{packs.map((pack) => <article key={pack.id} className="rounded-xl border border-neutral-800 bg-black/40 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{pack.name}</h3><p className="mt-1 text-sm text-neutral-500">{pack.description || "카드를 획득할 수 있는 팩"}</p></div><Sparkles className="h-5 w-5 shrink-0 text-amber-400" /></div><p className="mt-4 text-xs text-neutral-400">{pack.cardsPerPack}장 · 일반 {pack.normalRate}% · 레전더리 {pack.legendaryRate}% · Champion {pack.championRate}%</p><button type="button" disabled={opening !== null} onClick={() => void handleOpen(pack)} className="mt-5 w-full rounded bg-primary px-4 py-3 text-sm font-black text-black hover:bg-yellow-400 disabled:cursor-wait disabled:opacity-50">{opening === pack.id ? "개봉 중..." : "팩 열기"}</button></article>)}</div>}
        </section>
        <section className="mb-10"><div className="mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /><h2 className="text-xl font-black">Champion</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{collection?.champions.map((champion) => <article key={champion.id} className="rounded-lg border border-neutral-800 bg-black/30 p-4"><h3 className="font-black">{champion.name}</h3><p className="mt-2 text-xs leading-5 text-neutral-500">{champion.description}</p><p className="mt-3 text-xs text-amber-300">체력 {champion.maxHealth}</p></article>)}</div></section>
        <section><div className="mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="text-xl font-black">카드</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{collection?.cards.map((card) => <article key={card.id} className="rounded-lg border border-neutral-800 bg-black/30 p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-black">{card.name}</h3><span className="text-xs text-primary">×{card.quantity}</span></div><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">{card.rarity} · 비용 {card.cost}</p><p className="mt-3 line-clamp-3 text-xs leading-5 text-neutral-400">{card.text}</p><p className="mt-3 text-xs text-amber-300">공격 {card.attack} · 체력 {card.health}</p></article>)}</div></section>
      </div>
    </main>
  );
}
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, ChevronRight, Search, Sparkles } from "lucide-react";
import {
  COSMETIC_TYPES,
  cosmeticAssetDisplay,
  isDefaultEmote,
  skinKey,
  type CosmeticType,
  type CosmeticItem,
} from "@workspace/cosmetics";
import {
  fetchCosmetics,
  equipCosmetic,
  type CosmeticInventory,
} from "@/lib/cosmetics-client";
import { CardArtwork } from "@/components/card-artwork";
import { CosmeticPreview } from "@/components/cosmetic-preview";
import { SkinBattlePreview } from "@/components/player-tools/skin-battle-preview";
import {
  WishButton,
  WishlistArrivals,
} from "@/components/player-tools/wishlist";
import { SkinComparison } from "@/components/skin-comparison";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import "@/components/wardrobe.css";
export const cosmeticLabels: Record<CosmeticType, string> = {
  CHAMPION_SKIN: "챔피언 스킨",
  CARD_SKIN: "카드 스킨",
  CARD_BACK: "카드 뒷면",
  IMAGE_EMOTE: "이모티콘",
};
function isEquipped(data: CosmeticInventory, item: CosmeticItem) {
  if (item.type === "IMAGE_EMOTE") return false;
  return item.type === "CARD_BACK"
    ? data.loadout.cardBack?.id === item.id
    : data.loadout.skins[skinKey(item.type, item.targetId)]?.id === item.id;
}
export default function Cosmetics() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<CosmeticInventory | null>(null),
    [type, setType] = useState<CosmeticType>("CHAMPION_SKIN"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const mounted = useRef(false),
    saving = useRef(false);
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 1000px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1000px)");
    const update = () => {
      setDesktop(media.matches);
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const next = await fetchCosmetics({ signal });
      if (mounted.current && !signal?.aborted) setData(next);
    } catch (e) {
      if (mounted.current && !signal?.aborted)
        setError(
          e instanceof Error ? e.message : "보유 항목을 불러오지 못했어요.",
        );
    } finally {
      if (mounted.current && !signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, []);
  const items = data?.owned.filter(({ item }) => item.type === type) ?? [];
  const visible = items
    .filter(({ item }) => {
      const target =
        (item.type === "CHAMPION_SKIN" ? data?.champions : data?.cards)?.find(
          (c) => c.id === item.targetId,
        )?.name ?? "";
      return (
        `${item.name} ${target}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()) &&
        (filter !== "equipped" || (!!data && isEquipped(data, item)))
      );
    })
    .sort((a, b) =>
      sort === "name"
        ? a.item.name.localeCompare(b.item.name, "ko")
        : Date.parse(b.acquiredAt) - Date.parse(a.acquiredAt) ||
          a.item.sortOrder - b.item.sortOrder,
    );
  const selected =
    visible.find(({ item }) => item.id === selectedId)?.item ??
    visible[0]?.item;
  function category(next: CosmeticType) {
    setType(next);
    setQuery("");
    setFilter("all");
    setSelectedId(null);
    setOpen(false);
    setNotice("");
  }
  async function equip(item: CosmeticItem, reset = false) {
    if (saving.current || item.type === "IMAGE_EMOTE") return;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const loadout = await equipCosmetic(
        skinKey(item.type, item.targetId),
        reset ? null : item.id,
      );
      if (mounted.current) {
        setData((old) => (old ? { ...old, loadout } : old));
        setNotice(
          reset
            ? "기본 외형으로 변경했어요. 다음 대전부터 적용돼요."
            : `${item.name} 장착 완료. 다음 대전부터 적용돼요.`,
        );
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "적용하지 못했어요. 다시 시도해 주세요.",
        );
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const selectionDetails =
    selected && data ? (
      <WardrobeDetails
        key={selected.id}
        item={selected}
        data={data}
        busy={busy}
        equip={equip}
      />
    ) : null;
  return (
    <main className="ko-experience-page ko-wardrobe">
      <header className="ko-wardrobe__header">
        <button
          type="button"
          className="ko-wardrobe__back"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={18} />
          메인 메뉴
        </button>
        <span>KO / COLLECTION</span>
      </header>
      <section className="ko-wardrobe__intro">
        <div>
          <p>나만의 전장 스타일</p>
          <h1>
            꾸미기<span aria-hidden="true">.</span>
          </h1>
          <p>마음에 드는 외형을 골라, 나만의 챔피언을 완성하세요.</p>
        </div>
        <div className="ko-wardrobe__total">
          <Sparkles size={18} />
          <strong>{data?.owned.length ?? "—"}</strong>
          <span>보유 아이템</span>
        </div>
      </section>
      <nav className="ko-wardrobe__tabs" aria-label="꾸미기 종류">
        {COSMETIC_TYPES.map((t) => (
          <button
            type="button"
            key={t}
            aria-label={cosmeticLabels[t]}
            aria-pressed={t === type}
            onClick={() => category(t)}
          >
            {cosmeticLabels[t]}
            <span>
              {data?.owned.filter((o) => o.item.type === t).length ?? "—"}
            </span>
          </button>
        ))}
      </nav>
      <div className="ko-wardrobe__toolbar">
        <label className="ko-wardrobe__search">
          <Search size={18} />
          <input
            aria-label="보유 아이템 검색"
            placeholder="이름 또는 캐릭터 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="보유 항목 정렬"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">최근 획득순</option>
          <option value="name">이름순</option>
        </select>
        {type !== "IMAGE_EMOTE" && (
          <button
            type="button"
            aria-pressed={filter === "equipped"}
            onClick={() => setFilter(filter === "all" ? "equipped" : "all")}
          >
            <Check size={16} />
            장착 중만
          </button>
        )}
      </div>
      <p className="ko-wardrobe__hint">
        {type === "IMAGE_EMOTE"
          ? "장착 없이 바로 사용 · 대전 화면의 ☺ 버튼에서 보유한 이모티콘을 골라보세요."
          : "스킨은 외형만 바꿔요. 장착한 외형은 다음 대전부터 적용돼요."}
      </p>
      {error && (
        <div role="alert" className="ko-wardrobe__message">
          {error}
          <button type="button" disabled={loading} onClick={() => void load()}>
            다시 확인
          </button>
        </div>
      )}
      <p
        role="status"
        className={`ko-wardrobe__notice ${notice ? "is-visible" : ""}`}
      >
        {notice}
      </p>
      <WishlistArrivals
        kind="skin"
        owned={data?.owned.map((o) => o.item.id) ?? []}
      />
      <div className="ko-wardrobe__layout">
        <section
          className="ko-wardrobe__collection"
          aria-label={`${cosmeticLabels[type]} 보유 목록`}
          aria-busy={loading}
        >
          <div className="ko-wardrobe__section-label">
            <h2>{cosmeticLabels[type]}</h2>
            <span>{data ? `${visible.length}개` : "확인 중"}</span>
          </div>
          {loading && !data ? (
            <div className="ko-wardrobe__empty" role="status">
              보유 항목을 불러오고 있어요…
            </div>
          ) : (
            <div
              className={`ko-wardrobe__grid ${type === "IMAGE_EMOTE" ? "is-emotes" : ""}`}
            >
              {visible.map(({ item }) => (
                <article key={item.id} className="ko-wardrobe__tile">
                  <button
                    type="button"
                    aria-label={`${item.name} 자세히 보기`}
                    aria-pressed={
                      selectedId === item.id ||
                      (desktop && selected?.id === item.id)
                    }
                    onClick={() => {
                      setSelectedId(item.id);
                      if (!desktop) setOpen(true);
                    }}
                  >
                    <div className="ko-wardrobe__thumbnail">
                      <CardArtwork
                        src={
                          item.imageAssets.art ??
                          item.imageAssets.portrait ??
                          item.imageAssets.intro
                        }
                        alt={item.name}
                        className="h-full w-full"
                        imageDisplayMode="CONTAIN"
                        displayOverride={cosmeticAssetDisplay(
                          item.imageAssets,
                          item.imageAssets.art
                            ? "art"
                            : item.imageAssets.portrait
                              ? "portrait"
                              : "intro",
                        )}
                        loading="lazy"
                      />
                      {isEquipped(data!, item) && (
                        <span className="ko-wardrobe__equipped">
                          <Check size={12} />
                          장착 중
                        </span>
                      )}
                      {!item.isActive && (
                        <span className="ko-wardrobe__equipped is-disabled">
                          비활성
                        </span>
                      )}
                    </div>
                    <div className="ko-wardrobe__tile-copy">
                      <h3>{item.name}</h3>
                      <span>
                        {!item.isActive
                          ? "비활성 · 소유 기록 보존"
                          : item.type === "IMAGE_EMOTE"
                            ? isDefaultEmote(item)
                              ? "기본 지급 · 바로 사용"
                              : "바로 사용"
                            : ((item.type === "CHAMPION_SKIN"
                                ? data?.champions
                                : data?.cards
                              )?.find((c) => c.id === item.targetId)?.name ??
                              cosmeticLabels[item.type])}
                      </span>
                      <ChevronRight size={16} />
                    </div>
                  </button>
                </article>
              ))}
            </div>
          )}
          {!loading && data && !visible.length && (
            <div className="ko-wardrobe__empty">
              <Sparkles size={28} />
              <h3>
                {query || filter === "equipped"
                  ? "조건에 맞는 항목이 없어요"
                  : `아직 보유한 ${cosmeticLabels[type]}이 없어요`}
              </h3>
              <p>
                {query || filter === "equipped"
                  ? "검색어나 필터를 바꿔보세요."
                  : "획득한 아이템이 이곳에 모여요."}
              </p>
              {(query || filter === "equipped") && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  전체 보유 항목 보기
                </button>
              )}
            </div>
          )}
        </section>
        {desktop && (
          <aside
            className="ko-wardrobe__detail"
            aria-label="선택 아이템 미리보기"
          >
            {selectionDetails ?? (
              <p className="ko-wardrobe__empty">
                아이템을 고르면 여기서 크게 확인할 수 있어요.
              </p>
            )}
          </aside>
        )}
      </div>
      <Dialog open={!desktop && open} onOpenChange={setOpen}>
        <DialogContent className="ko-wardrobe-sheet">
          <DialogTitle>{selected?.name ?? "아이템 미리보기"}</DialogTitle>
          <DialogDescription>
            외형을 확인하고 적용하세요. 이모티콘은 장착 없이 사용할 수 있어요.
          </DialogDescription>
          {selectionDetails}
          {error && (
            <p role="alert" className="ko-wardrobe__message">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="ko-wardrobe__notice is-visible">
              {notice}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
function WardrobeDetails({
  item,
  data,
  busy,
  equip,
}: {
  item: CosmeticItem;
  data: CosmeticInventory;
  busy: boolean;
  equip: (item: CosmeticItem, reset?: boolean) => void;
}) {
  const equipped = isEquipped(data, item),
    target = (
      item.type === "CHAMPION_SKIN" ? data.champions : data.cards
    )?.find((c) => c.id === item.targetId);
  return (
    <div className="ko-wardrobe__selection">
      <div
        className={`ko-wardrobe__stage ${item.type === "IMAGE_EMOTE" ? "is-emote" : ""}`}
      >
        <CosmeticPreview
          item={item}
          cards={data.cards}
          champions={data.champions}
          artworkHeight={item.type === "IMAGE_EMOTE" ? 100 : 300}
        />
      </div>
      <div className="ko-wardrobe__selection-copy">
        <p className="ko-wardrobe__eyebrow">
          {cosmeticLabels[item.type]}
          {isDefaultEmote(item) ? " / 기본 지급" : ""}
        </p>
        <h2>{item.name}</h2>
        {target && target.name !== item.name && (
          <p className="ko-wardrobe__target">{target.name}</p>
        )}
        {item.description && (
          <p className="ko-wardrobe__description">{item.description}</p>
        )}
        {item.type === "IMAGE_EMOTE" ? (
          <p className="ko-wardrobe__availability">
            {item.isActive
              ? "대전에서 바로 사용 가능"
              : "비활성 · 소유 기록 보존"}
          </p>
        ) : (
          <div className="ko-wardrobe__apply">
            <button
              type="button"
              className="ko-wardrobe__primary"
              disabled={busy || !item.isActive || equipped}
              onClick={() => equip(item)}
            >
              {busy ? (
                "적용 중…"
              ) : equipped ? (
                <>
                  <Check size={16} />
                  장착 중
                </>
              ) : (
                "이 외형 장착"
              )}
            </button>
            {equipped && (
              <button
                type="button"
                disabled={busy}
                onClick={() => equip(item, true)}
              >
                기본 외형으로
              </button>
            )}
          </div>
        )}
        <div className="ko-wardrobe__secondary">
          <SkinBattlePreview item={item} />
          {["CHAMPION_SKIN", "CARD_SKIN"].includes(item.type) && (
            <SkinComparison item={item} base={target?.imageUrl} />
          )}
          <WishButton
            item={{
              id: item.id,
              kind: "skin",
              name: item.name,
              image: item.imageAssets.art ?? item.imageAssets.portrait,
            }}
          />
        </div>
      </div>
    </div>
  );
}

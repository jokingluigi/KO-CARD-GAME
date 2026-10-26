import { useEffect, useState } from "react";
import {
  COSMETIC_TYPES,
  championSkinArtwork,
  type CosmeticItem,
  type CosmeticAssets,
  type CosmeticType,
} from "@workspace/cosmetics";
import {
  cosmeticsRequest,
  type CosmeticInventory,
  type CosmeticCardPreview,
  type CosmeticChampionPreview,
} from "@/lib/cosmetics-client";
import { useAdminMutableDraft } from "./admin-editor-sections";
import { CosmeticPreview } from "./cosmetic-preview";
import "./cosmetics.css";
const labels: Record<CosmeticType, string> = {
  CHAMPION_SKIN: "챔피언 스킨",
  CARD_SKIN: "선수 카드 스킨",
  CARD_BACK: "카드 뒷면",
  IMAGE_EMOTE: "이미지 이모티콘",
};
const blank = (): CosmeticItem => ({
  id: "",
  type: "CHAMPION_SKIN",
  name: "",
  description: "",
  targetId: null,
  imageAssets: {},
  isActive: true,
  sortOrder: 0,
});
type Catalog = {
  items: CosmeticItem[];
  cards: CosmeticCardPreview[];
  champions: CosmeticChampionPreview[];
};
export function AdminCosmetics() {
  const [data, setData] = useState<Catalog | null>(null),
    [form, setForm] = useState(blank),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [targetQuery, setTargetQuery] = useState(""),
    [userQuery, setUserQuery] = useState(""),
    [users, setUsers] = useState<Array<{ id: string; nickname: string }>>([]),
    [user, setUser] = useState<{ id: string; nickname: string } | null>(null),
    [inventory, setInventory] = useState<CosmeticInventory | null>(null);
  const draft = useAdminMutableDraft(form, form.id);
  const base = "/admin/cosmetics";
  async function load() {
    setData(await cosmeticsRequest<Catalog>(base));
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    await run(async () => {
      const result = await cosmeticsRequest<{ item: CosmeticItem }>(
        `${base}/items${form.id ? "/" + encodeURIComponent(form.id) : ""}`,
        { method: form.id ? "PATCH" : "POST", body: JSON.stringify(form) },
      );
      setForm(result.item);
      draft.markSaved();
      await load();
      setMessage(
        "저장했어. 대상·유형을 변경하면 해당 아이템의 기존 장착은 해제돼.",
      );
    });
  }
  async function removeItem() {
    const id = form.id;
    const name = data?.items.find((item) => item.id === id)?.name ?? form.name;
    if (
      !id ||
      !window.confirm(
        `“${name}” 아이템을 삭제할까요?\n모든 유저의 보유·장착에서 제거되며 되돌릴 수 없습니다. 진행 중인 경기와 획득 기록의 이미지 파일은 유지됩니다.`,
      )
    )
      return;
    await run(async () => {
      await cosmeticsRequest(`${base}/items/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setForm(blank());
      draft.markSaved();
      await load();
      if (user) await selectUser(user);
      setMessage("아이템을 삭제했습니다.");
    });
  }
  async function upload(file: File, key: keyof CosmeticAssets) {
    await run(async () => {
      const valid =
        ["image/png", "image/webp", "image/jpeg"].includes(file.type) &&
        file.size > 0 &&
        file.size <= 5 * 1024 * 1024;
      if (!valid)
        throw new Error(
          "PNG·WebP·JPEG, 최대 5MB만 지원해. GIF는 이번 버전에서 지원하지 않아.",
        );
      const result = await cosmeticsRequest<{
        uploadURL: string;
        objectPath: string;
      }>(`${base}/uploads`, {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      const response = await fetch(result.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error("이미지 업로드에 실패했어.");
      const image = await cosmeticsRequest<{ imageUrl: string }>(
        `${base}/uploads/complete`,
        {
          method: "POST",
          body: JSON.stringify({
            objectPath: result.objectPath,
            contentType: file.type,
          }),
        },
      );
      setForm((old) => ({
        ...old,
        imageAssets: { ...old.imageAssets, [key]: image.imageUrl },
      }));
      setMessage("이미지 검증 완료. 저장하면 적용돼.");
    });
  }
  async function selectUser(value: { id: string; nickname: string }) {
    setUser(value);
    setInventory(
      await cosmeticsRequest<CosmeticInventory>(
        `${base}/users/${encodeURIComponent(value.id)}`,
      ),
    );
  }
  async function grant(item: CosmeticItem, action: "GRANT" | "REVOKE") {
    if (!user) return;
    await run(async () => {
      await cosmeticsRequest(
        `${base}/users/${encodeURIComponent(user.id)}/grants`,
        {
          method: "POST",
          body: JSON.stringify({ cosmeticId: item.id, action }),
        },
      );
      await selectUser(user);
      setMessage(
        `${user.nickname} · ${item.name} ${action === "GRANT" ? "지급" : "회수"} 완료`,
      );
    });
  }
  const tokenId =
    form.type === "CHAMPION_SKIN"
      ? data?.champions.find((c) => c.id === form.targetId)
          ?.championTokenDefinitionId
      : null;
  const targets =
    form.type === "CHAMPION_SKIN"
      ? data?.champions
      : form.type === "CARD_SKIN"
        ? data?.cards
        : [];
  return (
    <section className="cosmetics">
      <p>
        원본 카드·챔피언과 기존 팩용 스킨은 변경하지 않아. 비활성 아이템은 새
        장착·지급에서 제외되고 소유 기록은 유지돼.
      </p>
      {message && <p role="status" className="break-words">{message}</p>}
      {!data && !message && <p role="status">불러오는 중…</p>}
      <div className="cosmetics-editor">
        <aside>
          <input
            aria-label="아이템 검색"
            placeholder="아이템 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            disabled={busy}
            onClick={() => {
              if (draft.confirm()) {
                setForm(blank());
                draft.markSaved();
              }
            }}
          >
            새 아이템
          </button>
          <div className="grid gap-2 mt-3">
            {data?.items
              .filter((i) => i.name.includes(query))
              .map((i) => (
                <button
                  key={i.id}
                  aria-pressed={i.id === form.id}
                  disabled={busy}
                  onClick={() => {
                    if (draft.confirm()) setForm(i);
                  }}
                >
                  {i.name} · {labels[i.type]}
                  {i.isActive ? "" : " · 비활성"}
                </button>
              ))}
          </div>
        </aside>
        <div className="cosmetics-form">
          <label>
            이름
            <input
              aria-label="아이템 이름"
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            유형
            <select
              aria-label="아이템 유형"
              value={form.type}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: e.target.value as CosmeticType,
                  targetId: null,
                  imageAssets: {},
                })
              }
            >
              {COSMETIC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {labels[t]}
                </option>
              ))}
            </select>
          </label>
          {(form.type === "CARD_SKIN" || form.type === "CHAMPION_SKIN") && (
            <>
              <input
                aria-label="적용 대상 검색"
                placeholder="적용 대상 검색"
                value={targetQuery}
                onChange={(e) => setTargetQuery(e.target.value)}
              />
              <label>
                적용 대상
                <select
                  aria-label="적용 대상"
                  value={form.targetId ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targetId: e.target.value || null,
                      imageAssets: Object.fromEntries(
                        Object.entries(form.imageAssets).filter(
                          ([key]) => !key.startsWith("token:"),
                        ),
                      ),
                    })
                  }
                >
                  <option value="">대상 선택</option>
                  {targets
                    ?.filter(
                      (t) =>
                        t.id === form.targetId || t.name.includes(targetQuery),
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <label>
            설명
            <textarea
              aria-label="아이템 설명"
              maxLength={2000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <label>
            정렬 순서
            <input
              aria-label="정렬 순서"
              type="number"
              value={form.sortOrder}
              onChange={(e) =>
                setForm({ ...form, sortOrder: Number(e.target.value) })
              }
            />
          </label>
          <label className="!flex">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            활성화
          </label>
          {form.type === "CHAMPION_SKIN" && (
            <p className="text-sm text-amber-200">
              챔피언 일러스트 한 장을 등록하면 기본 표시·전투 초상화·VS 인트로에
              함께 적용돼. 각성과 토큰 외형만 별도로 등록해 줘.{" "}
              {tokenId
                ? "아래에 토큰 일러스트를 등록해 줘."
                : "토큰 외형을 등록하려면 챔피언 관리에서 챔피언 토큰을 먼저 연결해 줘."}
            </p>
          )}
          <div className="cosmetics-assets">
            {(form.type === "CHAMPION_SKIN"
              ? ["art", "awakened", ...(tokenId ? [`token:${tokenId}`] : [])]
              : ["art"]
            ).map((raw) => {
              const key = raw as keyof CosmeticAssets;
              const imageUrl =
                key === "art" && form.type === "CHAMPION_SKIN"
                  ? championSkinArtwork(form.imageAssets)
                  : form.imageAssets[key];
              return (
                <label key={key}>
                  {{
                    art:
                      form.type === "CHAMPION_SKIN"
                        ? "챔피언 일러스트 · 전투·VS 공용"
                        : "기본 일러스트",
                    portrait: "전투 초상화",
                    intro: "VS 인트로",
                    awakened: "각성 초상화",
                  }[key as "art" | "portrait" | "intro" | "awakened"] ??
                    "세트 포함 챔피언 토큰 일러스트"}
                  {form.type === "CHAMPION_SKIN" ? " (선택)" : ""}
                  <input
                    type="file"
                    aria-label={`${key} 이미지 업로드`}
                    accept="image/png,image/webp,image/jpeg"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f, key);
                      e.currentTarget.value = "";
                    }}
                  />
                  {imageUrl && (
                    <>
                      <img
                        src={imageUrl}
                        alt={`${key} 미리보기`}
                        className="h-36 w-full object-contain"
                      />
                      <button
                        disabled={busy}
                        onClick={() => {
                          const assets = { ...form.imageAssets };
                          delete assets[key];
                          if (key === "art" && form.type === "CHAMPION_SKIN") {
                            delete assets.portrait;
                            delete assets.intro;
                          }
                          setForm({ ...form, imageAssets: assets });
                        }}
                      >
                        이미지 슬롯 해제
                      </button>
                    </>
                  )}
                </label>
              );
            })}
          </div>
          <div className="cosmetics-preview">
            <CosmeticPreview
              item={form}
              cards={data?.cards}
              champions={data?.champions}
            />
          </div>
          {form.id && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeItem()}
              className="border border-red-800 text-red-300"
            >
              아이템 삭제
            </button>
          )}
          <button disabled={busy} onClick={() => void save()}>
            {busy ? "처리 중…" : "아이템 저장"}
          </button>
        </div>
      </div>
      <h2 className="text-xl mt-8">플레이어 지급 · 회수</h2>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="플레이어 검색"
          placeholder="닉네임 또는 계정 ID · 2자 이상"
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
        />
        <button
          disabled={busy}
          onClick={() =>
            void run(async () =>
              setUsers(
                (
                  await cosmeticsRequest<{ users: typeof users }>(
                    `${base}/users?q=${encodeURIComponent(userQuery)}`,
                  )
                ).users,
              ),
            )
          }
        >
          플레이어 검색
        </button>
      </div>
      <nav>
        {users.map((u) => (
          <button
            key={u.id}
            disabled={busy}
            onClick={() => void run(() => selectUser(u))}
          >
            {u.nickname}
          </button>
        ))}
      </nav>
      {user && (
        <section>
          <h2>
            {user.nickname} 보유 아이템 ({inventory?.owned.length ?? 0})
          </h2>
          <div className="cosmetics-grid">
            {data?.items
              .filter((i) => i.name.includes(query))
              .map((item) => {
                const has = inventory?.owned.some((o) => o.item.id === item.id);
                return (
                  <article key={item.id} className="cosmetics-item">
                    <span>
                      {item.name} · {has ? "보유" : "미보유"}
                    </span>
                    <button
                      disabled={busy || (!has && !item.isActive)}
                      onClick={() => void grant(item, has ? "REVOKE" : "GRANT")}
                    >
                      {has ? "회수" : "지급"}
                    </button>
                  </article>
                );
              })}
          </div>
        </section>
      )}
    </section>
  );
}

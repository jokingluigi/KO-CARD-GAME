import { CardArtwork } from "./card-artwork";
import { ImageDisplaySlider } from "./image-display-slider";
import { useEffect, useState } from "react";
import {
  COSMETIC_TYPES,
  isDefaultEmote,
  championSkinArtwork,
  cosmeticAssetDisplay,
  parseCosmeticDisplay,
  skinTokenIds,
  type CosmeticDisplaySettings,
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
import { Button, Chip, EditorPane, Field, Grid, ImagePick, ListPane, ListRow, Notice, NumberInput, Panel, SaveLine, Split, Toggle, useAutosave } from "./admin-kit";
const labels: Record<CosmeticType, string> = {
  CHAMPION_SKIN: "챔피언 스킨",
  CARD_SKIN: "카드 스킨",
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
  tokens?: CosmeticCardPreview[];
};
export function AdminCosmetics() {
  const [data, setData] = useState<Catalog | null>(null),
    [form, setForm] = useState(blank),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [typeFilter, setTypeFilter] = useState<CosmeticType | "ALL">("ALL"),
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
        "저장했어요. 대상·유형을 변경하면 해당 아이템의 기존 장착은 해제돼요.",
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
          "PNG·WebP·JPEG, 최대 5MB만 지원해요. GIF는 이번 버전에서 지원하지 않아요.",
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
      if (!response.ok) throw new Error("이미지 업로드에 실패했어요.");
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
      setMessage("이미지 검증 완료. 저장하면 적용돼요.");
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
  // 챔피언 스킨에 딸린 토큰: 챔피언 능력·피니셔·챔피언 토큰에서 자동으로 찾은 것 (+ 예전에 넣어 둔 그림)
  const relatedTokens =
    form.type === "CHAMPION_SKIN"
      ? data?.champions.find((c) => c.id === form.targetId)?.skinTokenIds ?? []
      : [];
  const skinTokens = form.type === "CHAMPION_SKIN"
    ? [...new Set([...relatedTokens, ...skinTokenIds(form.imageAssets)])]
    : [];
  const tokenCard = (id: string) => data?.tokens?.find((t) => t.id === id);
  const missingTokens = skinTokens.filter((id) => !form.imageAssets[`token:${id}`]);
  const targets =
    form.type === "CHAMPION_SKIN"
      ? data?.champions
      : form.type === "CARD_SKIN"
        ? data?.cards
        : [];
  const autosave = useAutosave(form.id || null, form.id ? form : null, async (next) => {
    if (!next.name.trim()) throw new Error("이름을 써 주세요.");
    const result = await cosmeticsRequest<{ item: CosmeticItem }>(`${base}/items/${encodeURIComponent(next.id)}`, { method: "PATCH", body: JSON.stringify(next) });
    setData((d) => d && ({ ...d, items: d.items.map((i) => (i.id === result.item.id ? result.item : i)) }));
    draft.markSaved();
    return "저장됨 · 대상이나 종류를 바꾸면 기존 장착은 풀려요";
  });
  const [editing, setEditing] = useState(false);
  const items = (data?.items ?? []).filter((i) => i.name.includes(query) && (typeFilter === "ALL" || i.type === typeFilter));
  const itemStatus = (i: CosmeticItem) => i.publicationStatus === "DRAFT" ? "미공개" : i.publicationStatus === "DISABLED" || !i.isActive ? "꺼짐" : isDefaultEmote(i) ? "기본 지급" : "켜짐";
  const open = (i: CosmeticItem) => { void autosave.flush(); setForm(i); draft.markSaved(); setEditing(true); };
  return (
    <div className="ak-page">
      {message && <Notice tone={/못|실패|오류|확인/.test(message) ? "error" : "ok"}>{message}</Notice>}
      {!data && !message && <p role="status">불러오는 중…</p>}
      <Split editing={editing}
        list={<ListPane actions={<button type="button" disabled={busy} onClick={() => { void autosave.flush(); setForm(blank()); draft.markSaved(); setEditing(true); }}>+ 새 아이템</button>}
          search={query} onSearch={setQuery} placeholder="아이템 찾기" count={`${items.length}개`}
          filters={<>{(["ALL", ...COSMETIC_TYPES] as const).map((t) => <Chip key={t} on={typeFilter === t} onClick={() => setTypeFilter(t)}>{t === "ALL" ? "전체" : labels[t]}</Chip>)}</>}>
          {items.map((i) => <ListRow key={i.id} thumb={(i.type === "CHAMPION_SKIN" ? championSkinArtwork(i.imageAssets) : i.imageAssets.art) ?? null} selected={i.id === form.id} onClick={() => open(i)} title={i.name} sub={labels[i.type]} badge={itemStatus(i)} tone={itemStatus(i) === "켜짐" || itemStatus(i) === "기본 지급" ? "on" : itemStatus(i) === "미공개" ? "warn" : "off"} />)}
          {!items.length && <p className="ak-hint" style={{ margin: 8 }}>아이템이 없어요.</p>}
        </ListPane>}
        editor={<EditorPane onBack={() => { void autosave.flush(); setEditing(false); }} status={form.id ? <SaveLine state={autosave.state} /> : <span className="ak-save">새 아이템 · 이름과 종류를 정하고 ‘만들기’를 눌러 주세요</span>}
          right={form.id ? <Button kind="danger" disabled={busy} onClick={() => void removeItem()}>지우기</Button> : <Button kind="primary" disabled={busy || !form.name.trim()} onClick={() => void save()}>만들기</Button>}>
          <Panel title="기본">
            <Grid>
              <Field label="이름"><input aria-label="아이템 이름" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="종류"><select aria-label="아이템 유형" disabled={!!form.legacySkinId} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CosmeticType, targetId: null, imageAssets: {} })}>{COSMETIC_TYPES.map((t) => <option key={t} value={t}>{labels[t]}</option>)}</select></Field>
            </Grid>
            {(form.type === "CARD_SKIN" || form.type === "CHAMPION_SKIN") && (
              <Grid>
                <Field label="대상 찾기"><input aria-label="적용 대상 검색" placeholder="이름으로 찾기" value={targetQuery} onChange={(e) => setTargetQuery(e.target.value)} /></Field>
                <Field label={form.type === "CHAMPION_SKIN" ? "어느 챔피언 스킨인가요?" : "어느 카드 스킨인가요?"}>
                  <select aria-label="적용 대상" value={form.targetId ?? ""} onChange={(e) => setForm({ ...form, targetId: e.target.value || null, imageAssets: Object.fromEntries(Object.entries(form.imageAssets).filter(([key]) => !key.startsWith("token:"))) })}>
                    <option value="">고르기</option>
                    {targets?.filter((t) => t.id === form.targetId || t.name.includes(targetQuery)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
              </Grid>
            )}
            <Field label="설명"><textarea aria-label="아이템 설명" rows={2} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Grid>
              <Field label="보이는 순서" hint="작을수록 앞"><NumberInput value={form.sortOrder} min={-9999} max={9999} onChange={(sortOrder) => setForm({ ...form, sortOrder })} /></Field>
              {form.legacySkinId ? (
                <Field label="공개 상태" hint="카드팩 스킨이에요. 팩 연결과 보유 기록도 함께 관리돼요.">
                  <select aria-label="스킨 공개 상태" value={form.publicationStatus} onChange={(e) => setForm({ ...form, publicationStatus: e.target.value as CosmeticItem["publicationStatus"], isActive: e.target.value === "PUBLISHED" })}>
                    <option value="DRAFT">미공개</option><option value="PUBLISHED">공개</option><option value="DISABLED">비활성</option>
                  </select>
                </Field>
              ) : <Toggle checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label={form.isActive ? "켜짐 (장착·지급 가능)" : "꺼짐 (새 장착·지급 안 됨)"} />}
            </Grid>
            {form.type === "IMAGE_EMOTE" && <Toggle checked={isDefaultEmote(form)} onChange={(on) => { const imageAssets = { ...form.imageAssets }; if (on) imageAssets.__defaultGrant = "true"; else delete imageAssets.__defaultGrant; setForm({ ...form, imageAssets }); }} label="모든 유저에게 기본으로 주기" hint="꺼도 이미 받은 유저는 그대로 가지고 있어요." />}
          </Panel>
          <Panel title="그림" hint={form.type === "CHAMPION_SKIN" ? "일러스트 한 장이 기본 표시·전투 초상화·VS 화면에 같이 쓰여요. 각성 그림과 이 챔피언의 토큰 그림은 따로 올려요. 이 스킨을 받은 유저는 토큰 그림도 같이 받고, 장착하면 토큰에도 자동으로 적용돼요." : "PNG·WebP·JPEG, 5MB까지 올릴 수 있어요."}>
            {form.type === "CHAMPION_SKIN" && form.targetId && (
              <div className={`cosmetics-token-summary ${missingTokens.length ? "is-missing" : "is-done"}`}>
                {skinTokens.length === 0
                  ? "이 챔피언은 관련 토큰이 없어요."
                  : missingTokens.length
                    ? `관련 토큰 ${skinTokens.length}종 중 ${missingTokens.length}종 그림이 비어 있어요 (${missingTokens.map((id) => tokenCard(id)?.name ?? "토큰").join(", ")}). 비어 있으면 원래 그림으로 나와요.`
                    : `관련 토큰 ${skinTokens.length}종 그림이 모두 들어 있어요 ✓`}
              </div>
            )}
            <div className="cosmetics-assets">
              {(form.type === "CHAMPION_SKIN" ? ["art", "awakened", ...skinTokens.map((id) => `token:${id}`)] : ["art"]).map((raw) => {
                const key = raw as keyof CosmeticAssets;
                const imageUrl = key === "art" && form.type === "CHAMPION_SKIN" ? championSkinArtwork(form.imageAssets) : form.imageAssets[key];
                const title = ({ art: form.type === "CHAMPION_SKIN" ? "챔피언 일러스트" : "그림", portrait: "전투 초상화", intro: "VS 화면", awakened: "각성 그림 (선택)" } as Record<string, string>)[key] ?? `토큰 · ${tokenCard(String(key).slice(6))?.name ?? "알 수 없는 토큰"}${relatedTokens.includes(String(key).slice(6)) ? "" : " (지금은 관련 없음 · 빼 주세요)"}`;
                return (
                  <div key={key} className="ak-panel" style={{ background: "#0f1216" }}><div className="ak-panel-body">
                    <b style={{ fontSize: 13 }}>{title}</b>
                    {key.startsWith("token:") && !imageUrl && tokenCard(String(key).slice(6))?.imageUrl && <img src={tokenCard(String(key).slice(6))!.imageUrl!} alt="원래 그림" title="원래 그림" className="cosmetics-token-original" />}
                    <ImagePick label={imageUrl ? "다른 그림으로 바꾸기" : "그림 올리기"} busy={busy} onFile={(f) => void upload(f, key)} />
                    {imageUrl && <>
                      {form.type === "CARD_SKIN" || form.type === "CHAMPION_SKIN"
                        ? <SkinImageEditor slot={key} src={imageUrl} assets={form.imageAssets} champion={form.type === "CHAMPION_SKIN" && !key.startsWith("token:")} disabled={busy} onChange={(display) => setForm((old) => ({ ...old, imageAssets: { ...old.imageAssets, [key]: imageUrl, __display: JSON.stringify({ ...parseCosmeticDisplay(old.imageAssets.__display), [key]: display }) } }))} />
                        : <img src={imageUrl} alt="" className="ak-preview-img" />}
                      <Button kind="ghost" disabled={busy} onClick={() => { const assets = { ...form.imageAssets }; delete assets[key]; if (key === "art" && form.type === "CHAMPION_SKIN") { delete assets.portrait; delete assets.intro; } setForm({ ...form, imageAssets: assets }); }}>그림 빼기</Button>
                    </>}
                  </div></div>
                );
              })}
            </div>
            {form.type === "CHAMPION_SKIN" && (form.id ? <a className="ak-btn" style={{ display: "inline-flex", alignItems: "center" }} href={`/admin/battle-sprites?target=${encodeURIComponent("skin:" + form.id)}`}>이 스킨의 대전 스프라이트 고치기 →</a> : <p className="ak-hint">대전 스프라이트는 아이템을 만든 뒤에 고칠 수 있어요.</p>)}
          </Panel>
          <Panel title="미리보기"><div className="cosmetics-preview"><CosmeticPreview item={form} cards={[...(data?.cards ?? []), ...(data?.tokens ?? [])]} champions={data?.champions} /></div></Panel>
          {form.id && <Panel title="유저에게 주기 · 회수" hint="닉네임으로 유저를 찾은 뒤 이 아이템을 주거나 빼요.">
            <div className="ak-row-actions">
              <input className="ak-search" style={{ flex: 1, minWidth: 160 }} aria-label="플레이어 검색" placeholder="닉네임 또는 계정 ID (2글자 이상)" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void run(async () => setUsers((await cosmeticsRequest<{ users: typeof users }>(`${base}/users?q=${encodeURIComponent(userQuery)}`)).users)); }} />
              <Button disabled={busy || userQuery.trim().length < 2} onClick={() => void run(async () => setUsers((await cosmeticsRequest<{ users: typeof users }>(`${base}/users?q=${encodeURIComponent(userQuery)}`)).users))}>찾기</Button>
            </div>
            <div className="ak-chips">{users.map((u) => <Chip key={u.id} on={user?.id === u.id} onClick={() => void run(() => selectUser(u))}>{u.nickname}</Chip>)}</div>
            {user && (() => { const item = data?.items.find((i) => i.id === form.id); const has = inventory?.owned.some((o) => o.item.id === form.id); return item ? (
              <div className="ak-row-actions" style={{ alignItems: "center" }}>
                <span className="ak-hint" style={{ margin: 0 }}>{user.nickname} 님은 이 아이템을 {has ? "가지고 있어요" : "안 가지고 있어요"} (전체 {inventory?.owned.length ?? 0}개 보유)</span>
                <Button kind={has ? "danger" : "primary"} disabled={busy || (!has && !item.isActive)} onClick={() => void grant(item, has ? "REVOKE" : "GRANT")}>{has ? "회수하기" : "주기"}</Button>
              </div>
            ) : null; })()}
          </Panel>}
        </EditorPane>}
      />
    </div>
  );
}
function SkinImageEditor({
  slot,
  src,
  assets,
  champion,
  disabled,
  onChange,
}: {
  slot: string;
  src: string;
  assets: CosmeticAssets;
  champion: boolean;
  disabled: boolean;
  onChange: (settings: CosmeticDisplaySettings) => void;
}) {
  const settings = cosmeticAssetDisplay(assets, slot) ?? {
    imageDisplayMode: champion ? "CONTAIN" : "COVER",
    imageScale: 1,
    imagePositionX: 50,
    imagePositionY: 50,
  };
  const update = (patch: Partial<CosmeticDisplaySettings>) =>
    onChange({ ...settings, ...patch });
  return (
    <fieldset
      disabled={disabled}
      className="space-y-3 border border-neutral-800 p-3"
      aria-label={`${slot} 이미지 조정`}
    >
      <legend className="text-xs text-amber-200">이미지 위치 · 크기</legend>
      <CardArtwork
        src={src}
        alt={`${slot} 미리보기`}
        className="h-52 w-full"
        {...settings}
        interactive={!disabled}
        showHint
        onPositionChange={(position) => update(position)}
      />
      <div className="flex flex-wrap gap-2">
        {(["CONTAIN", "COVER", "CUSTOM"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            aria-pressed={settings.imageDisplayMode === mode}
            onClick={() => update({ imageDisplayMode: mode })}
          >
            {
              {
                CONTAIN: "전체 보기",
                COVER: "영역 채우기",
                CUSTOM: "직접 조정",
              }[mode]
            }
          </button>
        ))}
      </div>
      <ImageDisplaySlider
        label="확대/축소"
        value={settings.imageScale}
        min={0.5}
        max={2}
        step={0.01}
        displayValue={`${Math.round(settings.imageScale * 100)}%`}
        onChange={(imageScale) => update({ imageScale })}
        testId={`${slot}-skin-scale`}
      />
      <ImageDisplaySlider
        label="좌우 위치"
        value={settings.imagePositionX}
        min={0}
        max={100}
        step={1}
        displayValue={`${Math.round(settings.imagePositionX)}%`}
        onChange={(imagePositionX) => update({ imagePositionX })}
        testId={`${slot}-skin-x`}
      />
      <ImageDisplaySlider
        label="상하 위치"
        value={settings.imagePositionY}
        min={0}
        max={100}
        step={1}
        displayValue={`${Math.round(settings.imagePositionY)}%`}
        onChange={(imagePositionY) => update({ imagePositionY })}
        testId={`${slot}-skin-y`}
      />
      <button
        type="button"
        onClick={() =>
          onChange({
            imageDisplayMode: champion ? "CONTAIN" : "COVER",
            imageScale: 1,
            imagePositionX: 50,
            imagePositionY: 50,
          })
        }
      >
        위치·크기 초기화
      </button>
    </fieldset>
  );
}

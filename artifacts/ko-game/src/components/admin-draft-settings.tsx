import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { draftRequest, type DraftSettings } from "@/lib/draft-client";
import type { DraftConfig } from "@workspace/game-engine";
import { DraftConfigFields } from "./draft-config-fields";
import { Button, Chip, errorText, Notice, Panel, RARITY_KO, SaveLine, Toggle, useAutosave } from "./admin-kit";

type Saved = { enabled: boolean; config: DraftConfig };

function PoolChips({ items, excluded, onChange, label }: { items: Array<{ id: string; name: string; rarity?: string }>; excluded: string[]; onChange: (ids: string[]) => void; label: string }) {
  const [q, setQ] = useState("");
  const shown = items.filter((i) => !q.trim() || i.name.includes(q.trim()));
  const on = items.length - excluded.filter((id) => items.some((i) => i.id === id)).length;
  return (
    <Panel title={`${label} · ${on}/${items.length}개 나와요`} hint="눌러서 빼거나 다시 넣어요. 빠진 것은 다음 드래프트부터 안 나와요.">
      <div className="ak-row-actions">
        <input className="ak-search" style={{ flex: 1, minWidth: 140 }} placeholder="이름 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button kind="ghost" onClick={() => onChange(excluded.filter((id) => !shown.some((i) => i.id === id)))}>보이는 것 모두 넣기</Button>
        <Button kind="ghost" onClick={() => onChange([...new Set([...excluded, ...shown.map((i) => i.id)])])}>보이는 것 모두 빼기</Button>
      </div>
      <div className="ak-chips" style={{ maxHeight: 220, overflowY: "auto" }}>
        {shown.map((i) => { const isOn = !excluded.includes(i.id); return <Chip key={i.id} on={isOn} onClick={() => onChange(isOn ? [...excluded, i.id] : excluded.filter((x) => x !== i.id))}>{i.name}{i.rarity && i.rarity !== "NORMAL" ? ` · ${RARITY_KO[i.rarity] ?? i.rarity}` : ""}</Chip>; })}
      </div>
    </Panel>
  );
}

/** 드래프트 — 켜고 끄기, 나오는 카드·챔피언, 규칙. 고치면 바로 저장돼요. */
export function AdminDraftSettings() {
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState<DraftSettings | null>(null);
  const [value, setValue] = useState<Saved | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try { const s = await draftRequest<DraftSettings>(""); setSettings(s); setValue({ enabled: s.enabled, config: s.config }); }
    catch (e) { setError(errorText(e, "드래프트 설정을 불러오지 못했어요.")); }
  }
  useEffect(() => { void load(); }, []);

  const autosave = useAutosave("draft", value, async (next) => {
    const result = await draftRequest<Saved>("/settings", "PUT", next);
    const fresh = await draftRequest<DraftSettings>("");
    setSettings(fresh);
    return result.enabled ? "저장됨 · 드래프트 켜짐" : "저장됨";
  });

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!settings || !value) return <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const setConfig = (patch: Partial<DraftConfig>) => setValue({ ...value, config: { ...value.config, ...patch } });

  return (
    <div className="ak-page">
      <SaveLine state={autosave.state} />
      <Panel title="드래프트 모드" hint="챔피언을 고르고 카드 25장을 골라 한 판 하는 모드예요.">
        <Toggle checked={value.enabled} onChange={(enabled) => setValue({ ...value, enabled })} label={value.enabled ? "켜짐 (게이머가 할 수 있어요)" : "꺼짐"} />
        {settings.poolError && <Notice tone="error">{settings.poolError}</Notice>}
        {settings.poolWarning && <Notice tone="warn">{settings.poolWarning}</Notice>}
        <div className="ak-row-actions"><Button onClick={() => navigate("/draft")}>드래프트 직접 해 보기</Button></div>
      </Panel>
      <PoolChips label="카드" items={settings.cards.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity }))} excluded={value.config.excludedCardIds} onChange={(excludedCardIds) => setConfig({ excludedCardIds })} />
      <PoolChips label="챔피언" items={settings.champions.map((c) => ({ id: c.id, name: c.name }))} excluded={value.config.excludedChampionIds} onChange={(excludedChampionIds) => setConfig({ excludedChampionIds })} />
      <Panel title="고르는 규칙">
        <div className="ak-draft-rules"><DraftConfigFields config={value.config} cards={settings.cards} champions={settings.champions} onChange={(config) => setValue({ ...value, config })} /></div>
      </Panel>
    </div>
  );
}

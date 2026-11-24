import { useCallback, useEffect, useState } from "react";
import { adminFetch, Button, Chip, errorText, Field, Grid, Notice, Panel, SaveLine, STATUS_KO, useAutosave } from "./admin-kit";

type Status = "DRAFT" | "PUBLISHED" | "DISABLED";
type Reference = { name?: string | null; status?: string | null; state?: string | null } | null;
export type IntroInteraction = {
  id: string; championOneId: string; championTwoId: string; lineOne: string | null; lineTwo: string | null;
  firstSpeaker: "ONE" | "TWO"; status: Status; championOneReference?: Reference; championTwoReference?: Reference;
};
type ChampionLite = { id: string; name: string; status: string };

const toBody = (i: IntroInteraction) => ({ championOneId: i.championOneId, championTwoId: i.championTwoId, lineOne: i.lineOne ?? "", lineTwo: i.lineTwo ?? "", firstSpeaker: i.firstSpeaker, status: i.status });

/** One relationship, written from the point of view of the champion being edited. Saves by itself. */
function IntroRow({ item, me, champions, onUnauthorized, onSaved, onDelete }: {
  item: IntroInteraction; me: ChampionLite; champions: ChampionLite[]; onUnauthorized: () => void; onSaved: (i: IntroInteraction) => void; onDelete: (id: string) => void;
}) {
  const [row, setRow] = useState(item);
  const autosave = useAutosave(item.id, row, async (next) => {
    const body = await adminFetch<{ interaction?: IntroInteraction }>(`/champion-intro-interactions/${encodeURIComponent(next.id)}`, { method: "PATCH", json: toBody(next) }, onUnauthorized);
    onSaved({ ...next, ...(body.interaction ?? {}) });
  });
  const meIsOne = row.championOneId === me.id;
  const otherId = meIsOne ? row.championTwoId : row.championOneId;
  const other = champions.find((c) => c.id === otherId);
  const otherRef = meIsOne ? row.championTwoReference : row.championOneReference;
  const missing = !other;
  const myLine = meIsOne ? row.lineOne : row.lineTwo, theirLine = meIsOne ? row.lineTwo : row.lineOne;
  const setMine = (v: string) => setRow({ ...row, ...(meIsOne ? { lineOne: v } : { lineTwo: v }) });
  const setTheirs = (v: string) => setRow({ ...row, ...(meIsOne ? { lineTwo: v } : { lineOne: v }) });
  const iSpeakFirst = (row.firstSpeaker === "ONE") === meIsOne;

  return (
    <div className="ak-panel" style={{ background: "#0f1216" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <b style={{ fontSize: 14 }}>{me.name} ↔ {other?.name ?? otherRef?.name ?? "지워진 챔피언"}</b>
        <span style={{ marginLeft: "auto" }}><SaveLine state={autosave.state} idle="" /></span>
        <Button kind="danger" onClick={() => onDelete(row.id)}>지우기</Button>
      </header>
      <div className="ak-panel-body">
        {missing && <Notice tone="warn">상대 챔피언이 지워졌어요. 이 대사는 게임에 안 나와요. 지우고 새로 만들어 주세요.</Notice>}
        <Grid>
          <Field label={`${me.name}의 대사`}><input maxLength={80} value={myLine ?? ""} disabled={missing} onChange={(e) => setMine(e.target.value)} /></Field>
          <Field label={`${other?.name ?? "상대"}의 대사`}><input maxLength={80} value={theirLine ?? ""} disabled={missing} onChange={(e) => setTheirs(e.target.value)} /></Field>
        </Grid>
        <div className="ak-row-actions" style={{ alignItems: "center" }}>
          <span className="ak-hint" style={{ margin: 0 }}>먼저 말하는 쪽:</span>
          <Chip on={iSpeakFirst} onClick={() => setRow({ ...row, firstSpeaker: meIsOne ? "ONE" : "TWO" })}>{me.name}</Chip>
          <Chip on={!iSpeakFirst} onClick={() => setRow({ ...row, firstSpeaker: meIsOne ? "TWO" : "ONE" })}>{other?.name ?? "상대"}</Chip>
          <span className="ak-hint" style={{ margin: "0 0 0 12px" }}>상태:</span>
          {(["DRAFT", "PUBLISHED", "DISABLED"] as const).map((s) => <Chip key={s} on={row.status === s} onClick={() => setRow({ ...row, status: s })}>{STATUS_KO[s]}</Chip>)}
        </div>
      </div>
    </div>
  );
}

/** 상대별 특수 대사 — 두 챔피언이 만나면 대전 시작 때 나오는 대사. */
export function ChampionIntroInteractions({ champion, champions, onUnauthorized }: { champion: ChampionLite; champions: ChampionLite[]; onUnauthorized: () => void }) {
  const [items, setItems] = useState<IntroInteraction[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState("");

  const load = useCallback(async () => {
    try { setItems((await adminFetch<{ interactions: IntroInteraction[] }>("/champion-intro-interactions", undefined, onUnauthorized)).interactions); }
    catch (e) { setError(errorText(e, "특수 대사를 불러오지 못했어요.")); setItems([]); }
  }, [onUnauthorized]);
  useEffect(() => { void load(); }, [load]);

  const mine = (items ?? []).filter((i) => i.championOneId === champion.id || i.championTwoId === champion.id);
  const taken = new Set(mine.map((i) => (i.championOneId === champion.id ? i.championTwoId : i.championOneId)));

  async function add() {
    if (!adding) return;
    setError("");
    try {
      await adminFetch("/champion-intro-interactions", { method: "POST", json: { championOneId: champion.id, championTwoId: adding, lineOne: "", lineTwo: "", firstSpeaker: "ONE", status: "DRAFT" } }, onUnauthorized);
      setAdding(""); await load();
    } catch (e) { setError(errorText(e, "특수 대사를 만들지 못했어요.")); }
  }
  async function remove(id: string) {
    if (!window.confirm("이 특수 대사를 지울까요?")) return;
    try { await adminFetch(`/champion-intro-interactions/${encodeURIComponent(id)}`, { method: "DELETE" }, onUnauthorized); setItems((l) => l?.filter((i) => i.id !== id) ?? l); }
    catch (e) { setError(errorText(e, "지우지 못했어요.")); }
  }

  return (
    <Panel title={`상대별 특수 대사 (${mine.length})`} hint="이 챔피언이 특정 상대를 만나면 대전 시작 때 서로 주고받는 대사예요. ‘공개’로 둔 것만 게임에 나와요. 고치면 바로 저장돼요.">
      {error && <Notice tone="error">{error}</Notice>}
      {items === null ? <p className="ak-hint">불러오는 중…</p> : mine.map((item) => (
        <IntroRow key={item.id} item={item} me={champion} champions={champions} onUnauthorized={onUnauthorized} onDelete={(id) => void remove(id)} onSaved={(saved) => setItems((l) => l?.map((i) => (i.id === saved.id ? saved : i)) ?? l)} />
      ))}
      <div className="ak-row-actions">
        <select className="ak-search" style={{ flex: 1, minWidth: 160 }} value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">상대 챔피언 고르기</option>
          {champions.filter((c) => c.id !== champion.id && !taken.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== "PUBLISHED" ? ` (${STATUS_KO[c.status] ?? c.status})` : ""}</option>)}
        </select>
        <Button kind="primary" disabled={!adding} onClick={() => void add()}>+ 특수 대사 만들기</Button>
      </div>
    </Panel>
  );
}

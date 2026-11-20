import { useCallback, useEffect, useState } from "react";
import {
  CARD_TEXT_REVISIONS_20261120,
  CARD_TEXT_REVISIONS_20261120_SERVER_BOUND,
  CARD_TEXT_REVISION_SET,
} from "../game/cards/card-text-revisions-20261120";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
type AnyCard = Record<string, unknown> & { id: string; name: string; text: string };
type Row = { id: string; name: string; state: "PENDING" | "DONE" | "CHANGED" | "MISSING"; bound: boolean };
const IGNORED = new Set(["text", "version", "updatedAt"]);

/**
 * One-click tidy-up of card wording (spacing, spelling, unified terms) for an administrator.
 * Only cards whose stored text is still exactly the reviewed wording are touched; cards whose
 * effects are read from their wording wait until the game server reports it understands the
 * new wording. Each saved card is checked field by field and the run stops on any surprise.
 */
export function AdminCardTextTidy({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cards, setCards] = useState<Record<string, AnyCard>>({});
  const [serverReady, setServerReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");

  const load = useCallback(async () => {
    const health = await fetch(`${base}/api/healthz`, { cache: "no-store" }).then(r => r.json()).catch(() => ({}));
    setServerReady(health?.cardTextRevisions === CARD_TEXT_REVISION_SET);
    const response = await fetch(`${base}/api/admin/cards`, { credentials: "include" });
    if (response.status === 401) { onUnauthorized(); return; }
    if (!response.ok) { setLog("카드 목록을 불러오지 못했어요."); return; }
    const list = ((await response.json()) as { cards: AnyCard[] }).cards;
    const byId = Object.fromEntries(list.map(c => [c.id, c]));
    setCards(byId);
    setRows(Object.entries(CARD_TEXT_REVISIONS_20261120).map(([id, rev]) => {
      const card = byId[id];
      const bound = CARD_TEXT_REVISIONS_20261120_SERVER_BOUND.includes(id);
      if (!card) return { id, name: id, state: "MISSING", bound };
      return { id, name: card.name, bound, state: card.text === rev.to ? "DONE" : card.text === rev.from ? "PENDING" : "CHANGED" };
    }));
  }, [onUnauthorized]);
  useEffect(() => { void load(); }, [load]);

  if (!rows) return null;
  const ready = rows.filter(r => r.state === "PENDING" && (!r.bound || serverReady));
  const waiting = rows.filter(r => r.state === "PENDING" && r.bound && !serverReady);
  const done = rows.filter(r => r.state === "DONE").length;
  const changed = rows.filter(r => r.state === "CHANGED" || r.state === "MISSING");
  if (!ready.length && !waiting.length) return null;

  async function apply() {
    setBusy(true);
    let ok = 0;
    try {
      for (const row of ready) {
        const before = cards[row.id]!;
        const to = CARD_TEXT_REVISIONS_20261120[row.id]!.to;
        const response = await fetch(`${base}/api/admin/cards/${encodeURIComponent(row.id)}`, {
          method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...before, text: to }),
        });
        if (response.status === 401) { onUnauthorized(); return; }
        if (!response.ok) { setLog(`${row.name}: 저장 실패로 멈췄어요. (${ok}장 완료)`); return; }
        const after = ((await response.json()) as { card: AnyCard }).card;
        const surprise = Object.keys({ ...before, ...after }).filter(k => !IGNORED.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
        if (after.text !== to || surprise.length) { setLog(`${row.name}: 글 말고 다른 값(${surprise.join(", ") || "글"})이 달라져서 멈췄어요. (${ok}장 완료)`); return; }
        ok++;
        setLog(`${ok} / ${ready.length}장 바꾸는 중…`);
      }
      setLog(`${ok}장 문구를 정리했어요.`);
    } finally { setBusy(false); await load(); }
  }

  return (
    <section className="mb-5 rounded border border-neutral-800 bg-neutral-950 p-4 text-sm" data-testid="card-text-tidy">
      <div className="font-black">카드 문구 정리 (띄어쓰기·맞춤법·용어 통일)</div>
      <p className="mt-1 text-xs text-neutral-400">
        효과는 그대로이고 글만 바뀌어요. 지금 바꿀 수 있는 카드 {ready.length}장{done ? ` · 이미 정리됨 ${done}장` : ""}
        {waiting.length ? ` · 게임 서버 업데이트 뒤에 바꿀 카드 ${waiting.length}장` : ""}
        {changed.length ? ` · 관리자가 이미 다르게 고친 카드 ${changed.length}장은 건드리지 않아요` : ""}
      </p>
      {ready.length > 0 && <button type="button" disabled={busy} onClick={() => void apply()} data-testid="button-apply-text-tidy"
        className="mt-3 min-h-10 rounded bg-primary px-4 font-black text-black disabled:opacity-50">
        {busy ? "바꾸는 중…" : `${ready.length}장 문구 정리 적용`}
      </button>}
      {log && <p className="mt-2 text-xs text-neutral-300">{log}</p>}
    </section>
  );
}

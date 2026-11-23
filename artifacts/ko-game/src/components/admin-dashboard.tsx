import { useEffect, useState } from "react";
import { type AdminPageId } from "@/lib/admin-navigation";
const base = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api/admin";
async function read(path: string) {
  const r = await fetch(base + "/" + path, { credentials: "include" });
  if (!r.ok) throw Error("조회 실패 (" + r.status + ")");
  return r.json();
}
export function AdminDashboard({ go, goPath }: { go: (id: AdminPageId) => void; goPath?: (path: string) => void }) {
  const [data, setData] = useState<Record<string, any>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const paths = ["cards", "champions", "server-maintenance"];
    void Promise.allSettled(paths.map(async (path) => ({ path, data: await read(path) }))).then((results) => {
      if (!active) return;
      const values: Record<string, any> = {}, failures: Record<string, string> = {};
      results.forEach((r, i) => (r.status === "fulfilled" ? (values[r.value.path] = r.value.data) : (failures[paths[i]!] = String(r.reason))));
      setData(values); setErrors(failures); setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const cards: any[] = data.cards?.cards ?? [];
  const champions: any[] = data.champions?.champions ?? [];
  const recent = [
    ...cards.map((c) => ({ ...c, kind: "카드" as const })),
    ...champions.map((c) => ({ ...c, kind: "챔피언" as const })),
  ].filter((c) => c.updatedAt).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 8);
  const statusText: Record<string, string> = { PUBLISHED: "공개", DRAFT: "미공개", DISABLED: "비활성" };
  const open = (c: { kind: string; id: string }) => (c.kind === "카드" && goPath ? goPath(`/admin/cards?card=${encodeURIComponent(c.id)}`) : go(c.kind === "카드" ? "cards" : "champions"));
  const count = (list: any[], status: string) => list.filter((c) => c.status === status).length;
  const maintenance = data["server-maintenance"];
  return (
    <div className="admin-dashboard">
      <section className="admin-launchpad" aria-label="자주 하는 일">
        <div><p className="admin-launchpad-eyebrow">KO CARD GAME 관리</p><h2>오늘은 무엇을 할까요?</h2><p>카드와 챔피언은 고치면 바로 저장되는 화면이 열려요.<br />아래에서 최근에 고친 것도 바로 열 수 있어요.</p></div>
        <div className="admin-launchpad-actions">
          {([
            ["cards", "카드 편집", "만들기 · 글 고치기 · 공개"],
            ["champions", "챔피언 편집", "능력 · 퀘스트 · 대사"],
            ["users", "유저 · 자산 지급", "크레딧 · 카드팩 · 프리즘"],
            ["notices", "공지 쓰기", "메인 화면 공지"],
          ] as const).map(([id, title, description]) => <button key={id} type="button" onClick={() => go(id)}><strong>{title} →</strong><small>{description}</small></button>)}
        </div>
      </section>
      <section className="admin-overview-strip" aria-label="현황">
        <button onClick={() => go("cards")}><span>카드</span><strong>{loading ? "—" : cards.length}</strong><small>{errors.cards ?? (loading ? "불러오는 중" : `공개 ${count(cards, "PUBLISHED")} · 미공개 ${count(cards, "DRAFT")}`)}</small></button>
        <button onClick={() => go("champions")}><span>챔피언</span><strong>{loading ? "—" : champions.length}</strong><small>{errors.champions ?? (loading ? "불러오는 중" : `공개 ${count(champions, "PUBLISHED")} · 미공개 ${count(champions, "DRAFT")}`)}</small></button>
        <button onClick={() => go("system")}><span>서버</span><strong>{maintenance ? (maintenance.enabled ? "점검 중" : "정상") : "—"}</strong><small>{errors["server-maintenance"] ?? "누르면 점검 설정"}</small></button>
      </section>
      <section>
        <div className="admin-section-heading"><h2>최근에 고친 것</h2><span>누르면 바로 열려요</span></div>
        <div className="admin-table-scroll">
          <table>
            <thead><tr><th>이름</th><th>구분</th><th>상태</th><th>고친 때</th><th /></tr></thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.kind + c.id} onClick={() => open(c)} style={{ cursor: "pointer" }}>
                  <td>{c.name}</td><td>{c.kind}</td><td>{statusText[c.status] ?? c.status}</td><td>{new Date(c.updatedAt).toLocaleString("ko-KR")}</td>
                  <td><button type="button" onClick={(e) => { e.stopPropagation(); open(c); }}>열기 →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !recent.length && <p>아직 고친 기록이 없어요.</p>}
        </div>
      </section>
    </div>
  );
}

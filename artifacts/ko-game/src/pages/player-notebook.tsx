import "@/components/player-tools/player-tools.css";
import { useShelf } from "@/components/player-tools/shelf";
export default function PlayerNotebook() {
  const shelf = useShelf(),
    groups = new Map<string, typeof shelf.data.matches>();
  for (const m of shelf.data.matches)
    if (m.deckId)
      groups.set((m.mode ?? "OTHER") + ":" + m.deckId, [
        ...(groups.get((m.mode ?? "OTHER") + ":" + m.deckId) ?? []),
        m,
      ]);
  return (
    <main className="ko-player-notebook ko-experience-page min-h-screen bg-neutral-950 p-5 text-white">
      <a href="/">← 메인</a>
      <h1 className="my-5 text-2xl">내 전적 · 수집 목표</h1>
      <p>
        이 브라우저에 계정별로 저장됩니다. 다른 기기와 동기화되지 않으며 서버
        공식 전적이 아닙니다. 최근 200경기를 보관합니다.
      </p>
      {!shelf.id && <p>로그인 상태를 확인하세요.</p>}
      <h2 className="mt-6 text-xl">덱별 기록</h2>
      {[...groups].map(([id, ms]) => (
        <article key={id} className="my-3 border border-amber-900 p-3">
          <strong>
            {ms[0].deckName ?? id} · {ms[0].mode ?? "기타"}
          </strong>
          <p>
            {ms.length}전 · {ms.filter((m) => m.result === "승리").length}승 ·
            승률{" "}
            {Math.round(
              (ms.filter((m) => m.result === "승리").length / ms.length) * 100,
            )}
            %
          </p>
          <p>
            최근 상대:{" "}
            {[...new Set(ms.map((m) => m.opponent))].slice(0, 5).join(", ")}
          </p>
        </article>
      ))}
      <h2 className="mt-6 text-xl">최근 경기</h2>
      {!shelf.data.matches.length && <p>완료한 경기 기록이 아직 없습니다.</p>}
      {shelf.data.matches.map((m) => (
        <p className="my-2" key={m.id}>
          {m.result} · {m.deckName ?? "덱 구성 미확인"} · {m.opponent} ·{" "}
          {new Date(m.at).toLocaleString("ko-KR")}
        </p>
      ))}
      <h2 className="mt-6 text-xl">수집 목표</h2>
      {!shelf.data.wishes.length && (
        <p>카드 상세 또는 스킨 미리보기에서 목표를 찜하세요.</p>
      )}
      {shelf.data.wishes.map((w) => (
        <article
          className="my-3 flex items-center gap-3 border border-neutral-700 p-3"
          key={w.kind + w.id}
        >
          {w.image && (
            <img alt="" src={w.image} className="h-20 w-14 object-contain" />
          )}
          <span>
            {w.name} · {w.acquired ? "획득 확인" : "수집 중"}
          </span>
          <button
            className="min-h-11"
            onClick={() =>
              shelf.update((s) => ({
                ...s,
                wishes: s.wishes.filter(
                  (x) => x.id !== w.id || x.kind !== w.kind,
                ),
              }))
            }
          >
            목표 해제
          </button>
        </article>
      ))}
      {shelf.error && <p role="alert">{shelf.error}</p>}
    </main>
  );
}

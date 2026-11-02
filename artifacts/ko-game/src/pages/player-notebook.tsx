import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Clock3, Flag, Layers3, Trash2 } from "lucide-react";
import {
  useShelf,
  type MatchEntry,
  type Wish,
} from "@/components/player-tools/shelf";
import { GamePageHeader, SurfaceEmpty } from "@/components/game-page-header";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
function recordDate(at: number) {
  const date = new Date(at);
  return Number.isFinite(date.getTime()) ? date : null;
}
const modeName = (mode?: string) =>
  ({ AI: "AI 대전", QUICK: "빠른 대전", FRIENDLY: "친선전" })[mode ?? ""] ??
  "기타 경기";
export default function PlayerNotebook() {
  const shelf = useShelf();
  const [tab, setTab] = useState<"matches" | "wishes">("matches"),
    [mode, setMode] = useState("ALL"),
    [limit, setLimit] = useState(20),
    [remove, setRemove] = useState<Wish | null>(null);
  const matches = useMemo(
    () => [...shelf.data.matches].sort((a, b) => b.at - a.at),
    [shelf.data.matches],
  );
  const filtered = matches.filter(
      (m) => mode === "ALL" || (m.mode ?? "OTHER") === mode,
    ),
    wins = filtered.filter((m) => m.result === "승리").length;
  const groups = new Map<string, MatchEntry[]>();
  for (const match of filtered)
    if (match.deckId) {
      const id = (match.mode ?? "OTHER") + ":" + match.deckId;
      groups.set(id, [...(groups.get(id) ?? []), match]);
    }
  return (
    <main className="ko-experience-page ko-player-page">
      <div className="ko-page-content">
        <GamePageHeader
          eyebrow="PLAYER JOURNAL"
          title="내 기록"
          description="지나온 경기와 다음 수집 목표를 한곳에서."
          aside={
            <div className="ko-surface-stat">
              <strong>{matches.length}</strong>
              <span>보관된 경기 기록</span>
            </div>
          }
        />
        <nav className="ko-surface-tabs" aria-label="내 기록 분류">
          <button
            type="button"
            aria-pressed={tab === "matches"}
            onClick={() => setTab("matches")}
          >
            대전 기록 <span>{matches.length}</span>
          </button>
          <button
            type="button"
            aria-pressed={tab === "wishes"}
            onClick={() => setTab("wishes")}
          >
            수집 목표 <span>{shelf.data.wishes.length}</span>
          </button>
        </nav>
        <details className="ko-notebook-storage">
          <summary>이 기록은 어디에 저장되나요?</summary>
          <p>
            계정에 동기화하고 이 기기에도 보관해요. 오프라인 기록은 연결 후 합쳐져요.
            유저용 기록이며 공식 순위 전적이 아니에요. 최근 200경기를 보관해요.
          </p>
        </details>
        {shelf.id&&<div className="ko-journal-sync" role="status"><span>{shelf.syncStatus}</span><button type="button" onClick={()=>void shelf.retrySync()}>동기화 다시 시도</button></div>}
        {shelf.error && (
          <p className="ko-surface-message is-error" role="alert">
            {shelf.error}
          </p>
        )}
        {!shelf.id && (
          <p className="ko-surface-message" role="status">
            로그인 상태를 확인하고 있어요.
          </p>
        )}
        {tab === "matches" ? (
          <>
            <div className="ko-notebook-filters" aria-label="경기 모드 필터">
              {[
                ["ALL", "전체"],
                ["QUICK", "빠른 대전"],
                ["AI", "AI 대전"],
                ["FRIENDLY", "친선전"],
                ["OTHER", "기타"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={mode === id}
                  onClick={() => {
                    setMode(id);
                    setLimit(20);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {filtered.length ? (
              <>
                <section
                  className="ko-notebook-summary"
                  aria-label="현재 필터의 전적"
                >
                  <div>
                    <strong>{filtered.length}</strong>
                    <span>경기</span>
                  </div>
                  <div>
                    <strong>{wins}</strong>
                    <span>승리</span>
                  </div>
                  <div>
                    <strong>
                      {Math.round((wins / filtered.length) * 100)}
                      <small>%</small>
                    </strong>
                    <span>승률</span>
                  </div>
                </section>
                <div className="ko-notebook-columns">
                  <section>
                    <div className="ko-reward-section-title">
                      <h2>덱별 기록</h2>
                      <span>{groups.size}개 기록</span>
                    </div>
                    <div className="ko-notebook-decks">
                      {[...groups].map(([id, ms]) => {
                        const won = ms.filter(
                            (m) => m.result === "승리",
                          ).length,
                          rate = Math.round((won / ms.length) * 100);
                        return (
                          <article key={id} className="ko-notebook-deck">
                            <div className="ko-notebook-deck__title">
                              <span>
                                <Layers3 size={18} />
                              </span>
                              <div>
                                <p>{modeName(ms[0].mode)}</p>
                                <h3>{ms[0].deckName ?? "덱 이름 미확인"}</h3>
                              </div>
                              <strong>
                                {rate}
                                <small>%</small>
                              </strong>
                            </div>
                            <div
                              className="ko-notebook-deck__bar"
                              aria-hidden="true"
                            >
                              <span style={{ width: `${rate}%` }} />
                            </div>
                            <p>
                              {ms.length}전 · {won}승 ·{" "}
                              {ms.filter((m) => m.result === "패배").length}패
                              {ms.some((m) => m.result === "무승부")
                                ? ` · ${ms.filter((m) => m.result === "무승부").length}무`
                                : ""}
                            </p>
                            <div className="ko-notebook-deck__actions">
                              <Link
                                href={`/decks?edit=${encodeURIComponent(ms[0].deckId!)}`}
                              >
                                사용 덱 확인·편집
                                <ArrowRight size={14} />
                              </Link>
                              {ms[0].mode === "QUICK" && (
                                <Link
                                  href={`/online/quick?repeat=${encodeURIComponent(ms[0].deckId!)}`}
                                >
                                  같은 덱으로 빠른 대전
                                  <ArrowRight size={14} />
                                </Link>
                              )}
                            </div>
                          </article>
                        );
                      })}
                      {!groups.size && (
                        <p className="ko-reward-footnote">
                          덱 정보가 없는 경기예요. 최근 경기 목록에서 결과를
                          확인하세요.
                        </p>
                      )}
                    </div>
                  </section>
                  <section>
                    <div className="ko-reward-section-title">
                      <h2>최근 경기</h2>
                      <Clock3 size={16} />
                    </div>
                    <ol className="ko-notebook-matches">
                      {filtered.slice(0, limit).map((m) => (
                        <li key={m.id}>
                          <span
                            className="ko-match-result"
                            data-result={m.result}
                          >
                            {m.result}
                          </span>
                          <div>
                            <strong>{m.opponent}</strong>
                            <p>
                              {m.deckName ?? "덱 구성 미확인"} ·{" "}
                              {modeName(m.mode)}
                            </p>
                            <time dateTime={recordDate(m.at)?.toISOString()}>
                              {recordDate(m.at)?.toLocaleString("ko-KR", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }) ?? "기록 시간 미확인"}
                            </time>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {filtered.length > limit && (
                      <button
                        type="button"
                        className="ko-surface-action mt-5"
                        onClick={() => setLimit((n) => n + 20)}
                      >
                        이전 경기 더 보기
                      </button>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <SurfaceEmpty
                title={
                  matches.length
                    ? "이 모드의 기록이 없어요"
                    : "첫 경기를 기다리고 있어요"
                }
                href="/online"
                label="대전 모드로"
              >
                경기를 마치면 결과와 사용한 덱이 이곳에 모여요.
              </SurfaceEmpty>
            )}
          </>
        ) : (
          <>
            <section className="ko-notebook-summary" aria-label="수집 현황">
              <div>
                <strong>{shelf.data.wishes.length}</strong>
                <span>수집 목표</span>
              </div>
              <div>
                <strong>
                  {shelf.data.wishes.filter((w) => w.acquired).length}
                </strong>
                <span>획득 확인</span>
              </div>
            </section>
            {shelf.data.wishes.length ? (
              <div className="ko-notebook-wishes">
                {shelf.data.wishes.map((w) => (
                  <article key={w.kind + w.id} className="ko-notebook-wish">
                    <div className="ko-notebook-wish__art">
                      {w.image ? (
                        <img src={w.image} alt="" loading="lazy" />
                      ) : (
                        <Flag size={28} />
                      )}
                    </div>
                    <div>
                      <p>
                        {w.kind === "card" ? "카드" : "꾸미기"} /{" "}
                        {w.acquired ? "획득 확인" : "수집 중"}
                      </p>
                      <h2>{w.name}</h2>
                      <span className="ko-notebook-wish__status">
                        {w.acquired && <Check size={13} />}{" "}
                        {w.acquired
                          ? "목표를 달성했어요"
                          : "다음에 만나고 싶은 아이템"}
                      </span>
                      <div className="ko-notebook-wish__actions">
                        <Link
                          href={
                            w.kind === "card" ? "/collection" : "/cosmetics"
                          }
                        >
                          {w.kind === "card" ? "컬렉션 보기" : "꾸미기 보기"}
                          <ArrowRight size={13} />
                        </Link>
                        <button
                          type="button"
                          aria-label={`${w.name} 목표 해제`}
                          onClick={() => setRemove(w)}
                        >
                          <Trash2 size={14} />
                          목표 해제
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <SurfaceEmpty
                title="다음 수집 목표를 골라보세요"
                href="/collection"
                label="컬렉션 둘러보기"
              >
                카드 상세나 스킨 미리보기에서 ‘수집 목표로 찜’을 누르면 여기에
                모여요.
              </SurfaceEmpty>
            )}
          </>
        )}
      </div>
      <Dialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <DialogContent className="border-neutral-700 bg-neutral-950 text-white">
          <DialogTitle>수집 목표를 해제할까요?</DialogTitle>
          <DialogDescription>
            {remove?.name}의 목표 표시를 지워요. 보유 아이템은 그대로 유지돼요.
          </DialogDescription>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className="ko-surface-action"
              onClick={() => setRemove(null)}
            >
              유지하기
            </button>
            <button
              type="button"
              className="ko-surface-action is-primary"
              onClick={() => {
                if (remove)
                  shelf.update((s) => ({
                    ...s,
                    wishes: s.wishes.filter(
                      (w) => w.id !== remove.id || w.kind !== remove.kind,
                    ),
                  }));
                setRemove(null);
              }}
            >
              목표 해제
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

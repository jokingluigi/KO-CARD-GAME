import { useEffect, useState } from "react";
import "./admin-usage-statistics.css";
type Kind = "cards" | "champions";
type Item = Record<string, any> & {
  id: string;
  name: string;
  imageUrl?: string | null;
};
type Data = {
  kind: Kind;
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
  collectionStartedAt: string;
  lastAggregatedAt: string | null;
  lastErrorAt: string | null;
  from: string;
  to: string;
  policy: string;
  totals: { participants: number; knownDecks: number };
  detail?: Item | null;
  daily?: Item[];
  comparison?: {
    recent: number;
    previous: number | null;
    changePercent: number | null;
  } | null;
};
const count = (v: unknown) => Number(v ?? 0).toLocaleString("ko-KR");
const percent = (v: unknown) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
const time = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("ko-KR", { timeZone: "UTC", hour12: false }) +
      " UTC"
    : "아직 없음";
const questRateLabel = (item: Item) =>
  !item.quest_eligible && item.hasQuest === false
    ? "퀘스트 없음"
    : percent(item.questRate);
function Win({ item }: { item: Item }) {
  return (
    <span>
      {percent(item.winRate)}
      <small>
        표본 {count(item.samples)}경기 · 무승부 {count(item.draws)}
      </small>
      {item.sampleLabel && (
        <small className="usage-sample">{item.sampleLabel}</small>
      )}
    </span>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: unknown;
  note?: string;
}) {
  return (
    <div className="usage-metric">
      <dt>{label}</dt>
      <dd>{String(value ?? "—")}</dd>
      {note && <small>{note}</small>}
    </div>
  );
}
function Trend({
  days,
  field,
  label,
  percentage = false,
}: {
  days: Item[];
  field: string;
  label: string;
  percentage?: boolean;
}) {
  const usable = days.filter((d) => d[field] != null);
  if (!usable.length) return <p>{label}: 기록 없음</p>;
  const min = Date.parse(usable[0]!.day),
    max = Date.parse(usable.at(-1)!.day),
    peak = percentage
      ? 100
      : Math.max(1, ...usable.map((d) => Number(d[field])));
  const points = usable.map((d) => ({
    x: 32 + (max === min ? 0.5 : (Date.parse(d.day) - min) / (max - min)) * 576,
    y: 146 - (Number(d[field]) / peak) * 112,
    d,
  }));
  return (
    <figure className="usage-trend">
      <figcaption>{label}</figcaption>
      <svg viewBox="0 0 640 180" role="img" aria-label={label + " 일별 추이"}>
        <line x1="32" y1="146" x2="608" y2="146" stroke="#666" />
        <text x="4" y="34">
          {percentage ? "100%" : count(peak)}
        </text>
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#e7bb58"
          strokeWidth="2"
        />
        {points.map((p) => (
          <circle key={p.d.day} cx={p.x} cy={p.y} r="4" fill="#e7bb58">
            <title>
              {p.d.day}: {percentage ? percent(p.d[field]) : count(p.d[field])}
            </title>
          </circle>
        ))}
        <text x="32" y="172">
          {usable[0]!.day}
        </text>
        <text x="608" y="172" textAnchor="end">
          {usable.at(-1)!.day}
        </text>
      </svg>
    </figure>
  );
}
export function AdminUsageStatistics({
  kind,
  onUnauthorized,
}: {
  kind: Kind;
  onUnauthorized: () => void;
}) {
  const [period, setPeriod] = useState("30"),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("uses"),
    [direction, setDirection] = useState("desc"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setSelected(null);
    setPage(1);
    setData(null);
  }, [kind]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      period,
      q: search,
      sort,
      direction,
      page: String(page),
    });
    const base =
      import.meta.env.BASE_URL.replace(/\/$/, "") +
      "/api/admin/usage-statistics/";
    void fetch(
      base +
        kind +
        (selected ? "/" + encodeURIComponent(selected) : "") +
        "?" +
        params,
      { credentials: "include", signal: controller.signal },
    )
      .then(async (response) => {
        if (response.status === 401 || response.status === 403)
          onUnauthorized();
        const result = await response
          .json()
          .catch(() => ({ message: "통계 서버 응답을 확인할 수 없습니다." }));
        if (!response.ok)
          throw new Error(result.message ?? "통계를 불러오지 못했습니다.");
        return result as Data;
      })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "통계 조회 실패");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    kind,
    period,
    search,
    sort,
    direction,
    page,
    selected,
    refresh,
    onUnauthorized,
  ]);
  const cards = kind === "cards";
  const reorder = (key: string) => {
    if (sort === key) setDirection((v) => (v === "desc" ? "asc" : "desc"));
    else {
      setSort(key);
      setDirection(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  };
  const heading = (label: string, key: string) => (
    <button onClick={() => reorder(key)} aria-label={label + " 정렬"}>
      {label}
      {sort === key ? (direction === "desc" ? " ↓" : " ↑") : ""}
    </button>
  );
  const item = selected && data?.detail;
  return (
    <section
      className="usage-statistics"
      aria-label={cards ? "카드 사용 통계" : "챔피언 사용 통계"}
    >
      <div className="usage-controls">
        <label>
          기간
          <select
            aria-label="기간"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          >
            {[
              ["7", "최근 7일"],
              ["30", "최근 30일"],
              ["90", "최근 90일"],
              ["all", "전체 기간"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {!selected && (
          <label>
            이름 또는 ID 검색
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={cards ? "카드 검색" : "챔피언 검색"}
            />
          </label>
        )}
        <button onClick={() => setRefresh((v) => v + 1)} disabled={loading}>
          새로고침
        </button>
      </div>
      <p className="usage-policy">
        이 통계는 데이터 수집이 시작된 이후의 경기만 포함합니다. 모든 지원
        경기의 실제 유저 기록을 합산합니다.
      </p>
      {data && (
        <div className="usage-meta">
          <p>
            수집 시작: {time(data.collectionStartedAt)}
            <br />
            마지막 집계: {time(data.lastAggregatedAt)}
          </p>
          <p>
            {data.policy}
            <br />
            조회: {time(data.from)} ~ {time(data.to)} (끝 시각 미포함)
          </p>
          <p>
            유효 참가 {count(data.totals.participants)} · 시작 덱 확인{" "}
            {count(data.totals.knownDecks)}
          </p>
          {data.lastErrorAt && (
            <p role="status">
              최근 집계 실패: {time(data.lastErrorAt)} · 저장된 경기 기록으로
              재시도 중
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRefresh((v) => v + 1)}>다시 시도</button>
        </p>
      )}
      {loading && <p role="status">통계를 불러오는 중…</p>}
      {!loading && !error && data && (
        <>
          {data.totals.participants === 0 && (
            <p className="usage-empty">
              선택한 기간에 수집된 서버 확정 종료 경기가 없습니다. 아래 콘텐츠의
              수치는 아직 표본이 없습니다.
            </p>
          )}
          {selected && item ? (
            <>
              <button onClick={() => setSelected(null)}>← 목록으로</button>
              <header className="usage-detail-header">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.name + " 일러스트"} />
                )}
                <div>
                  <h2>{item.name}</h2>
                  <p className="usage-id">{item.id}</p>
                  {cards ? (
                    <>
                      <p>
                        {item.rarity} · 비용 {item.cost}
                      </p>
                      <p>{item.text || "효과 없음"}</p>
                    </>
                  ) : (
                    <>
                      <h3>
                        현재 고유 능력 · {item.abilityName} · 비용 {item.cost}
                      </h3>
                      <p>{item.abilityText || "효과 없음"}</p>
                      <h3>현재 퀘스트 · {item.questName}</h3>
                      <p>
                        {!item.definitionAvailable
                          ? "현재 정의 없음"
                          : item.hasQuest
                            ? item.questText
                            : "퀘스트 없음"}
                      </p>
                      {item.hasQuest && (
                        <>
                          <h3>현재 퀘스트 보상</h3>
                          <p>{item.questRewardText || "등록된 설명 없음"}</p>
                        </>
                      )}
                    </>
                  )}
                </div>
              </header>
              <dl className="usage-metrics">
                {cards ? (
                  <>
                    <Metric
                      label="덱 채용률"
                      value={percent(item.adoptionRate)}
                      note={`${count(item.adoptions)} / 시작 덱 확인 ${count(data.totals.knownDecks)} 참가`}
                    />
                    <Metric label="총 채용 장수" value={count(item.copies)} />
                    <Metric
                      label="실제 손패 플레이"
                      value={count(item.plays)}
                    />
                    <Metric
                      label="플레이율"
                      value={percent(item.playRate)}
                      note={`사용한 참가 ${count(item.played_matches)} / ${count(data.totals.participants)}`}
                    />
                    <Metric label="생성 횟수" value={count(item.generated)} />
                    <Metric
                      label="필드 진입·소환 횟수"
                      value={count(item.summons)}
                      note="손패 소환·효과 소환·부활·챔피언 출전 포함; 합체 자체는 필드 진입이 아님"
                    />
                  </>
                ) : (
                  <>
                    <Metric label="선택 횟수" value={count(item.selections)} />
                    <Metric
                      label="선택률"
                      value={percent(item.selectionRate)}
                    />
                    <Metric
                      label="고유 능력 발동"
                      value={count(item.ability_uses)}
                    />
                    <Metric
                      label="경기당 평균 발동"
                      value={
                        item.averageAbilityUses == null
                          ? "—"
                          : item.averageAbilityUses.toFixed(2)
                      }
                    />
                    <Metric
                      label="능력 사용 경기 비율"
                      value={percent(item.abilityMatchRate)}
                      note={`사용 경기 ${count(item.ability_matches)}`}
                    />
                    <Metric
                      label="퀘스트 완료"
                      value={count(item.quest_completed)}
                    />
                    <Metric
                      label="퀘스트 완료율"
                      value={questRateLabel(item)}
                      note={`적용 가능 표본 ${count(item.quest_eligible)}`}
                    />
                    <Metric
                      label="평균 완료 턴"
                      value={
                        item.averageQuestTurn == null
                          ? "—"
                          : item.averageQuestTurn.toFixed(2)
                      }
                      note={`전투 화면 기준(양측 턴 한 묶음) · 표본 ${count(item.quest_turn_samples)}`}
                    />
                    <Metric
                      label="퀘스트 완료 경기 승률"
                      value={percent(item.completedWinRate)}
                      note={`표본 ${count(item.completedSamples)} · 무승부 ${count(item.completed_draws)}`}
                    />
                    <Metric
                      label="퀘스트 미완료 경기 승률"
                      value={percent(item.incompleteWinRate)}
                      note={`표본 ${count(item.incompleteSamples)} · 무승부 ${count(item.incomplete_draws)}`}
                    />
                  </>
                )}
                <div className="usage-metric">
                  <dt>{cards ? "채용 승률" : "승률"}</dt>
                  <dd>
                    <Win item={item} />
                  </dd>
                </div>
                <Metric
                  label={cards ? "실제 사용 유저 수" : "실제 유저 수"}
                  value={count(item.users)}
                />
              </dl>
              {!cards && (
                <p className="usage-policy">
                  퀘스트 완료·미완료 승률 차이는 관찰 통계이며 보상의 인과
                  효과를 의미하지 않습니다.
                </p>
              )}
              {data.comparison && (
                <p>
                  최근 7일 {cards ? "플레이" : "선택"}{" "}
                  {count(data.comparison.recent)} · 이전 7일{" "}
                  {data.comparison.previous == null
                    ? "수집 기간 부족"
                    : count(data.comparison.previous)}{" "}
                  · 변화율 {percent(data.comparison.changePercent)}
                </p>
              )}
              <Trend
                days={data.daily ?? []}
                field={cards ? "plays" : "selections"}
                label={
                  cards ? "일별 손패 플레이 횟수" : "일별 챔피언 선택 횟수"
                }
              />
              <Trend
                days={data.daily ?? []}
                field="winRate"
                label={cards ? "일별 채용 승률" : "일별 챔피언 승률"}
                percentage
              />
              <div className="usage-table-scroll">
                <table>
                  <caption>실제 기록이 있는 날짜 · UTC</caption>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>{cards ? "손패 플레이" : "선택"}</th>
                      <th>승률 / 유효 표본</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily?.map((day) => (
                      <tr key={day.day}>
                        <td>{day.day}</td>
                        <td>{count(day[cards ? "plays" : "selections"])}</td>
                        <td>
                          <Win item={day} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="usage-table-scroll">
                <table>
                  <caption>
                    {cards ? "카드 통계" : "챔피언 통계"} · {count(data.total)}
                    개
                  </caption>
                  <thead>
                    <tr>
                      <th>{heading("이름", "name")}</th>
                      {cards ? (
                        <>
                          <th>
                            {heading("희귀도", "rarity")} /{" "}
                            {heading("비용", "cost")}
                          </th>
                          <th>{heading("덱 채용률", "rate")}</th>
                          <th>{heading("사용 횟수", "uses")}</th>
                          <th>{heading("플레이율", "playRate")}</th>
                          <th>{heading("채용 승률", "winRate")}</th>
                          <th>{heading("사용 유저 수", "users")}</th>
                        </>
                      ) : (
                        <>
                          <th>{heading("선택 횟수", "uses")}</th>
                          <th>{heading("선택률", "rate")}</th>
                          <th>{heading("승률", "winRate")}</th>
                          <th>{heading("고유 능력 발동", "ability_uses")}</th>
                          <th>{heading("퀘스트 완료율", "questRate")}</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <button
                            className="usage-content-button"
                            onClick={() => setSelected(row.id)}
                          >
                            {row.imageUrl && (
                              <img loading="lazy" src={row.imageUrl} alt="" />
                            )}
                            <span>{row.name}</span>
                          </button>
                        </td>
                        {cards ? (
                          <>
                            <td>
                              {row.rarity ?? "—"} / {row.cost ?? "—"}
                            </td>
                            <td>
                              {percent(row.adoptionRate)}
                              <small>{count(row.adoptions)} 참가</small>
                            </td>
                            <td>{count(row.plays)}</td>
                            <td>
                              {percent(row.playRate)}
                              <small>{count(row.played_matches)} 참가</small>
                            </td>
                            <td>
                              <Win item={row} />
                            </td>
                            <td>{count(row.users)}</td>
                          </>
                        ) : (
                          <>
                            <td>{count(row.selections)}</td>
                            <td>{percent(row.selectionRate)}</td>
                            <td>
                              <Win item={row} />
                            </td>
                            <td>{count(row.ability_uses)}</td>
                            <td>
                              {questRateLabel(row)}
                              <small>
                                {count(row.quest_completed)} /{" "}
                                {count(row.quest_eligible)} 참가
                              </small>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.items.length && <p>검색 결과가 없습니다.</p>}
              <nav aria-label="통계 페이지" className="usage-pagination">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  이전
                </button>
                <span>
                  {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
                </span>
                <button
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage((v) => v + 1)}
                >
                  다음
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </section>
  );
}

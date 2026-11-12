import { useEffect, useState } from "react";
type Data = {
  startedAt: string;
  revision: string;
  heapMB: number;
  rssMB: number;
  eventLoopP95Ms: number;
  progressQueue?: { pending: number; retries: number; oldest_seconds: number };
  metrics: Record<
    string,
    { count: number; p50: number; p95: number; max: number }
  >;
};
const labels: Record<string, string> = {
  actionMs: "서버 행동 처리",
  queueMs: "행동 대기",
  validationMs: "행동 검증",
  engineMs: "전투 판정",
  persistenceMs: "전투 저장",
  cacheMs: "재요청 보관",
  serializationMs: "전송 데이터 변환",
  messageBytes: "전송 크기 (바이트)",
  socketBufferedBytes: "송신 대기 (바이트)",
  "client.actionAckMs": "클라이언트 입력→응답",
  "client.stateApplyMs": "클라이언트 수신→화면 갱신",
  "client.frameGapMs": "클라이언트 프레임 간격",
};
export default function AdminMultiplayerPerformance() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch(
          import.meta.env.BASE_URL.replace(/\/$/, "") +
            "/api/admin/multiplayer-performance",
          { credentials: "include", cache: "no-store" },
        );
        if (!r.ok)
          throw Error(
            r.status === 403
              ? "관리자 권한이 필요합니다."
              : "측정값을 불러오지 못했습니다.",
          );
        const json = await r.json();
        if (active) {
          setData(json);
          setError("");
        }
      } catch (e) {
        if (active) setError(String(e instanceof Error ? e.message : e));
      }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="space-y-5 p-4">
      <h2 className="text-xl font-bold">멀티플레이 성능</h2>
      <p>
        최근 최대 1,024개 표본 · 시간 단위 ms · p95는 표본의 95%가 이 시간
        이내였다는 뜻입니다. 클라이언트 표본은 서버 측정과 별개이며, 모든 유저의
        평균 FPS를 뜻하지 않습니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            서버 힙 {data.heapMB}MB · 전체 메모리 {data.rssMB}MB · 이벤트 루프
            p95 {data.eventLoopP95Ms}ms
          </p>
          {data.progressQueue && (
            <p>
              진행도 저장 대기 {data.progressQueue.pending}건 · 최장{" "}
              {Math.round(data.progressQueue.oldest_seconds)}초 · 재시도{" "}
              {data.progressQueue.retries}회
            </p>
          )}
          <p className="break-all text-xs">
            측정 시작 {data.startedAt} · 빌드 {data.revision}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {["구간", "표본", "p50", "p95", "최대"].map((s) => (
                    <th key={s} className="p-2">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.metrics).map(([name, m]) => (
                  <tr key={name} className="border-t border-slate-700">
                    <td className="p-2">{labels[name] ?? name}</td>
                    <td>{m.count}</td>
                    <td>{m.p50}</td>
                    <td>{m.p95}</td>
                    <td>{m.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!Object.keys(data.metrics).length && (
              <p>아직 대전 표본이 없습니다. 실제 대전이 진행되면 갱신됩니다.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

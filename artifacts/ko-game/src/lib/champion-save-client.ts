import { championSaveValuesMatch } from "../../../../lib/game-engine/src/champion-save-values";
export class ChampionSaveUncertainError extends Error {
  constructor() {
    super(
      "저장 응답이 끊겨 저장 여부를 확인하지 못했습니다. 입력 내용은 유지했습니다. 다시 저장하면 먼저 서버의 저장 결과를 확인합니다.",
    );
    this.name = "ChampionSaveUncertainError";
  }
}
/** Retry only a read after an ambiguous write. A new champion keeps one idempotency key for this editor session. */
export async function requestChampionSave(input: {
  base: string;
  id?: string;
  creationId: string;
  version?: number;
  payload: Record<string, unknown>;
  request?: typeof fetch;
  timeoutMs?: number;
}): Promise<Response> {
  const request = input.request ?? fetch,
    id = input.id ?? input.creationId;
  const confirm = async () => {
    try {
      const response = await request(
        `${input.base}/champions/${encodeURIComponent(id)}`,
        {
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!response.ok) return null;
      const body = await response.json();
      const saved = body.champion;
      return saved &&
        (!input.id || Number(saved.version) > Number(input.version ?? 0)) &&
        championSaveValuesMatch(input.payload, saved)
        ? new Response(JSON.stringify({ champion: saved, recovered: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : null;
    } catch {
      return null;
    }
  };
  let response: Response;
  try {
    response = await request(
      input.id
        ? `${input.base}/champions/${encodeURIComponent(input.id)}`
        : `${input.base}/champions`,
      {
        method: input.id ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(!input.id ? { "Idempotency-Key": input.creationId } : {}),
        },
        body: JSON.stringify(input.payload),
        signal: AbortSignal.timeout(input.timeoutMs ?? 30000),
      },
    );
  } catch {
    const saved = await confirm();
    if (saved) return saved;
    throw new ChampionSaveUncertainError();
  }
  if (response.status >= 500 || response.status === 409) {
    const saved = await confirm();
    if (saved) return saved;
    if (response.status >= 500) throw new ChampionSaveUncertainError();
  }
  if (response.ok) {
    try {
      const body = await response.clone().json();
      if (
        body.champion &&
        (!input.id ||
          Number(body.champion.version) > Number(input.version ?? 0)) &&
        championSaveValuesMatch(input.payload, body.champion)
      )
        return response;
    } catch {}
    const saved = await confirm();
    if (saved) return saved;
    throw new ChampionSaveUncertainError();
  }
  return response;
}

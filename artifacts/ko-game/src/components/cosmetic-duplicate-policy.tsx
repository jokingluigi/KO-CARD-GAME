import { useEffect, useState } from "react";
export function CosmeticDuplicatePolicy() {
  const [values, setValues] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    const c = new AbortController();
    void fetch(
      (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") +
        "/api/packs/duplicate-policy",
      {
        credentials: "include",
        signal: AbortSignal.any([c.signal, AbortSignal.timeout(5000)]),
      },
    )
      .then(async (r) => {
        if (!r.ok) throw Error("policy");
        const data = await r.json();
        if (
          ["SKIN", "CHAMPION_SKIN", "IMAGE_EMOTE"].every(
            (key) =>
              Number.isSafeInteger(data.rewards?.[key]) &&
              data.rewards[key] > 0,
          ) &&
          !c.signal.aborted
        )
          setValues(data.rewards);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  return (
    <aside className="ko-duplicate-policy">
      <strong>이미 보유한 꾸미기가 나오면?</strong>
      <p>
        {values
          ? `일반 프리즘으로 전환돼요. 선수 스킨 +${values.SKIN} · 챔피언 스킨 +${values.CHAMPION_SKIN} · 이모티콘 +${values.IMAGE_EMOTE}`
          : "중복 꾸미기 보상 수량은 개봉 결과에서 확인할 수 있어요."}
      </p>
      <small>중복 챔피언 해금 보상과는 별도입니다.</small>
    </aside>
  );
}

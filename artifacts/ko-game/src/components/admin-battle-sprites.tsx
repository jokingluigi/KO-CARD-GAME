import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { BattleSprite } from "@workspace/cosmetics";
import { cosmeticsRequest } from "@/lib/cosmetics-client";
import { BattleSpriteEditor } from "./battle-sprite-editor";
import { useAdminMutableDraft } from "./admin-editor-sections";
import "./admin-battle-sprites.css";
type Target = {
  key: string;
  kind: "default" | "skin";
  id: string;
  championId: string;
  championName: string;
  name: string;
  imageUrl: string | null;
  config: BattleSprite | null;
  revision: string;
};
export function AdminBattleSprites() {
  const [, navigate] = useLocation();
  const [targets, setTargets] = useState<Target[]>([]),
    [key, setKey] = useState(""),
    [value, setValue] = useState<BattleSprite | null>(null),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const activeKey = useRef("");
  const selected = targets.find((t) => t.key === key);
  const draft = useAdminMutableDraft({ value, uploading }, key);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await cosmeticsRequest<{ targets: Target[] }>(
        "/admin/battle-sprites",
      );
      const params = new URLSearchParams(location.search);
      const target =
        result.targets.find(
          (t) => t.key === (activeKey.current || params.get("target")),
        ) ||
        result.targets.find(
          (t) =>
            t.championId === params.get("champion") &&
            (params.get("skin")
              ? t.id === params.get("skin")
              : t.kind === "default"),
        ) ||
        result.targets[0];
      setTargets(result.targets);
      activeKey.current = target?.key ?? "";
      setKey(activeKey.current);
      setValue(target?.config ?? null);
      draft.markSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function choose(next: string) {
    if (next === key || uploading || saving || !draft.confirm()) return;
    const target = targets.find((t) => t.key === next);
    if (!target) return;
    activeKey.current = target.key;
    setKey(target.key);
    setValue(target.config);
    setMessage("");
    setError("");
    const url = new URL(location.href);
    url.searchParams.set("target", target.key);
    history.replaceState(history.state, "", url);
  }
  async function save() {
    if (!selected || uploading || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await cosmeticsRequest<{
        config: BattleSprite | null;
        revision: string;
      }>(
        `/admin/battle-sprites/${selected.kind}/${encodeURIComponent(selected.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ sprite: value, revision: selected.revision }),
        },
      );
      setTargets((rows) =>
        rows.map((t) => (t.key === selected.key ? { ...t, ...result } : t)),
      );
      setValue(result.config);
      draft.markSaved();
      setMessage("스프라이트 설정을 저장했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  const champions = targets.filter((t) => t.kind === "default");
  return (
    <section className="ko-sprite-workspace" aria-label="대전 스프라이트 관리">
      <header>
        <div>
          <p className="text-xs text-neutral-400">CHAMPION SPRITE STUDIO</p>
          <h2 className="text-2xl font-black">대전 스프라이트</h2>
          <p>
            챔피언·선택 스킨의 이미지와 표정 반응을 큰 화면에서 등록하고
            확인합니다.
          </p>
        </div>
      </header>
      <div className="ko-sprite-workspace-toolbar">
        <label>
          챔피언
          <select
            aria-label="스프라이트 챔피언 선택"
            disabled={loading || saving || uploading}
            value={selected?.championId ?? ""}
            onChange={(e) => choose("default:" + e.target.value)}
          >
            {champions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.championName}
              </option>
            ))}
          </select>
        </label>
        <label>
          외형 스킨
          <select
            aria-label="스프라이트 스킨 선택"
            disabled={loading || saving || uploading}
            value={key}
            onChange={(e) => choose(e.target.value)}
          >
            {targets
              .filter((t) => t.championId === selected?.championId)
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          disabled={saving || uploading || loading}
          onClick={() => {
            if (draft.confirm()) void load();
          }}
        >
          다시 불러오기
        </button>
        <button
          type="button"
          disabled={!selected || loading || saving || uploading}
          onClick={() => {
            if (selected && draft.confirm())
              navigate(
                `/?source=admin&testChampionId=${encodeURIComponent(selected.championId)}`,
              );
          }}
        >
          실제 테스트 게임
        </button>
        <button
          type="button"
          className="ko-sprite-save"
          disabled={!selected || loading || saving || uploading || !draft.dirty}
          onClick={() => void save()}
        >
          {uploading
            ? "이미지 업로드 중…"
            : saving
              ? "저장 중…"
              : "스프라이트 저장"}
        </button>
      </div>
      {error && (
        <p role="alert" className="border border-red-800 p-3 text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="border border-emerald-800 p-3 text-emerald-200"
        >
          {message}
        </p>
      )}
      {loading ? (
        <p role="status">스프라이트 목록을 불러오는 중…</p>
      ) : !selected ? (
        <p>등록된 챔피언이 없습니다. 챔피언 관리에서 먼저 등록해 주세요.</p>
      ) : (
        <>
          <p className="ko-sprite-workspace-context">
            <strong>
              {selected.championName} · {selected.name}
            </strong>{" "}
            {draft.dirty ? "· 저장하지 않은 변경 있음" : ""}
            <span>
              다른 스킨의 표정을 가져오지 않습니다. 변경 사항은 저장 후 새
              대전에 적용됩니다. 실제 테스트 게임은 현재 장착한 스킨을
              사용합니다.
            </span>
          </p>
          <BattleSpriteEditor
            championName={selected.championName}
            fallbackImage={selected?.imageUrl}
            inheritedMotion={
              selected.kind === "skin"
                ? targets.find(
                    (t) =>
                      t.kind === "default" &&
                      t.championId === selected.championId,
                  )?.config?.motion
                : undefined
            }
            key={selected.key}
            value={value}
            workspace
            onBusyChange={setUploading}
            onChange={(next) => {
              if (activeKey.current === selected.key) {
                setValue(next);
                setMessage("");
              }
            }}
          />
        </>
      )}
    </section>
  );
}

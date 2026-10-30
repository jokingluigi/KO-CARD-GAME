import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { BattleSprite } from "@workspace/cosmetics";
import { sameSavedSprite } from "@/lib/sprite-save-policy";
import {
  CosmeticsTimeoutError,
  cosmeticsRequest,
} from "@/lib/cosmetics-client";
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
    [savePhase, setSavePhase] = useState(""),
    [uncertain, setUncertain] = useState(false),
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
        undefined,
        { timeoutMs: 60000, label: "스프라이트 목록" },
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
    setUncertain(false);
    const url = new URL(location.href);
    url.searchParams.set("target", target.key);
    history.replaceState(history.state, "", url);
  }
  function acceptSaved(
    target: Target,
    result: { config: BattleSprite | null; revision: string },
  ) {
    setTargets((rows) =>
      rows.map((t) => (t.key === target.key ? { ...t, ...result } : t)),
    );
    setValue(result.config);
    draft.markSaved();
    setUncertain(false);
    setError("");
    setMessage("스프라이트 설정을 저장했습니다.");
  }
  async function confirmSaved(target: Target, expected: BattleSprite | null) {
    const result = await cosmeticsRequest<{ targets: Target[] }>(
      "/admin/battle-sprites",
      undefined,
      { timeoutMs: 60000, label: "스프라이트 저장 여부 확인" },
    );
    const found = result.targets.find((t) => t.key === target.key);
    if (found && sameSavedSprite(found.config, expected)) {
      acceptSaved(target, found);
      return true;
    }
    return false;
  }
  async function checkUncertain() {
    if (!selected || saving || uploading) return;
    setSaving(true);
    setSavePhase("서버에 저장됐는지 확인 중…");
    try {
      if (!(await confirmSaved(selected, value)))
        setError(
          "아직 서버에서 동일한 설정을 확인하지 못했어요. 현재 편집은 유지했습니다.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 여부 확인 실패");
    } finally {
      setSaving(false);
      setSavePhase("");
    }
  }
  async function save() {
    if (!selected || uploading || saving) return;
    setSaving(true);
    setUncertain(false);
    setError("");
    setMessage("");
    setSavePhase("스프라이트 설정 저장 응답 확인 중…");
    const waiting = setTimeout(
      () =>
        setSavePhase(
          "이미지 검증이 오래 걸리고 있어요. 중복 저장하지 않고 응답을 기다리고 있습니다…",
        ),
      8000,
    );
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
        { timeoutMs: 120000, label: "스프라이트 설정 저장" },
      );
      acceptSaved(selected, result);
    } catch (e) {
      if (e instanceof CosmeticsTimeoutError || e instanceof TypeError) {
        clearTimeout(waiting);
        setUncertain(true);
        setSavePhase("응답이 끊겨 실제 저장 여부를 확인 중…");
        try {
          if (await confirmSaved(selected, value)) return;
        } catch {
          /* Keep the draft and offer a read-only check, not another mutation. */
        }
      }
      setError(
        e instanceof TypeError
          ? "연결이 끊겨 저장 여부를 확정하지 못했어요. 편집 내용은 유지했습니다. 저장 여부 다시 확인을 눌러주세요."
          : e instanceof Error
            ? e.message
            : "저장에 실패했습니다.",
      );
    } finally {
      clearTimeout(waiting);
      setSaving(false);
      setSavePhase("");
    }
  }
  const champions = targets.filter((t) => t.kind === "default");
  return (
    <section
      className="ko-sprite-workspace"
      aria-label="대전 스프라이트 관리"
      aria-busy={saving || uploading}
    >
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
      {saving && (
        <p role="status" aria-live="polite">
          {savePhase}
        </p>
      )}
      {uncertain && !saving && (
        <button
          type="button"
          className="min-h-11 border border-amber-700 px-3"
          onClick={() => void checkUncertain()}
        >
          저장 여부 다시 확인
        </button>
      )}
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
          <fieldset disabled={saving} className="min-w-0">
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
          </fieldset>
        </>
      )}
    </section>
  );
}

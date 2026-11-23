import {useAdminDraftGuard} from './admin-editor-sections';
import {AdminEditorSections} from './admin-editor-sections';
import { useEffect, useState } from "react";
import { Save, Sparkles } from "lucide-react";

const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/prism`;
type Rarity = "NORMAL" | "EPIC" | "LEGENDARY";
type Setting = {
  rarity: Rarity;
  craftCost: number | null;
  disenchantReward: number | null;
  configured: boolean;
};
type User = { id: string; email: string; nickname: string; prismBalance: number; championPrismBalance: number };
type FormValues = { craftCost: string; disenchantReward: string };
type ChampionSetting = { craftCost: number | null; duplicateReward: number | null; configured: boolean };

async function request<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "프리즘 관리자 요청을 처리하지 못했습니다.");
  return body as T;
}

export function AdminPrismManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [forms, setForms] = useState<Record<Rarity, FormValues>>({
    NORMAL: { craftCost: "", disenchantReward: "" },
    EPIC: { craftCost: "", disenchantReward: "" },
    LEGENDARY: { craftCost: "", disenchantReward: "" },
  });
  const [message, setMessage] = useState("프리즘 설정을 불러오는 중...");
  const [savingRarity, setSavingRarity] = useState<Rarity | null>(null);
  const [championSetting, setChampionSetting] = useState<ChampionSetting>({ craftCost: null, duplicateReward: null, configured: false });
  const [championForm, setChampionForm] = useState({ craftCost: "", duplicateReward: "" });
  const [savingChampion, setSavingChampion] = useState(false);

  useAdminDraftGuard(settings.length>0,{forms,championForm},JSON.stringify([settings,championSetting]));
  async function load() {
    try {
      const result = await request<{ settings: Setting[]; users: User[]; championPrismSetting: ChampionSetting }>();
      setSettings(result.settings);
      setChampionSetting(result.championPrismSetting);
      setChampionForm({
        craftCost: result.championPrismSetting.craftCost?.toString() ?? "",
        duplicateReward: result.championPrismSetting.duplicateReward?.toString() ?? "",
      });
      setForms({
        NORMAL: {
          craftCost: result.settings.find((setting) => setting.rarity === "NORMAL")?.craftCost?.toString() ?? "",
          disenchantReward: result.settings.find((setting) => setting.rarity === "NORMAL")?.disenchantReward?.toString() ?? "",
        },
        EPIC: { craftCost: result.settings.find((setting) => setting.rarity === "EPIC")?.craftCost?.toString() ?? "", disenchantReward: result.settings.find((setting) => setting.rarity === "EPIC")?.disenchantReward?.toString() ?? "" },
        LEGENDARY: {
          craftCost: result.settings.find((setting) => setting.rarity === "LEGENDARY")?.craftCost?.toString() ?? "",
          disenchantReward: result.settings.find((setting) => setting.rarity === "LEGENDARY")?.disenchantReward?.toString() ?? "",
        },
      });
      setMessage("");
    } catch (error) {
      if (error instanceof Error && (error.message.includes("권한") || error.message.includes("로그인"))) {
        onUnauthorized();
        return;
      }
      setMessage(error instanceof Error ? error.message : "프리즘 설정을 불러오지 못했습니다.");
    }
  }

  async function saveChampionSetting() {
    const craftCost = championForm.craftCost.trim() === "" ? Number.NaN : Number(championForm.craftCost);
    const duplicateReward = championForm.duplicateReward.trim() === "" ? Number.NaN : Number(championForm.duplicateReward);
    setSavingChampion(true);
    setMessage("");
    try {
      await request("/champion-settings", { method: "PUT", body: JSON.stringify({ craftCost, duplicateReward }) });
      await load();
      setMessage("챔피언 프리즘 설정을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "챔피언 프리즘 설정을 저장하지 못했습니다.");
    } finally {
      setSavingChampion(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function updateForm(rarity: Rarity, key: keyof FormValues, value: string) {
    setForms((current) => ({ ...current, [rarity]: { ...current[rarity], [key]: value } }));
  }

  async function saveSetting(rarity: Rarity) {
    const form = forms[rarity];
    const craftCost = form.craftCost.trim() === "" ? Number.NaN : Number(form.craftCost);
    const disenchantReward = form.disenchantReward.trim() === "" ? Number.NaN : Number(form.disenchantReward);
    setSavingRarity(rarity);
    setMessage("");
    try {
      await request(`/settings/${rarity}`, { method: "PUT", body: JSON.stringify({ craftCost, disenchantReward }) });
      await load();
      setMessage(`${rarity} 프리즘 설정을 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "프리즘 설정을 저장하지 못했습니다.");
    } finally {
      setSavingRarity(null);
    }
  }



  return (
    <div className="space-y-6">
      {message && <p role="status" className="mb-4 rounded border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">{message}</p>}
      <AdminEditorSections panels={[{"id":"admin-prism-manager-0","label":"카드 제작 · 분해"},{"id":"admin-prism-manager-1","label":"챔피언 제작"}]}>{[<><section className="rounded-xl border border-neutral-800 bg-black/40 p-5 sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <Sparkles className="mt-1 h-5 w-5 text-amber-400" />
          <div><p className="text-sm text-neutral-400">값을 비워 두면 그 등급은 제작·분해가 꺼져요. 프리즘 지급·회수는 ‘유저 · 자산 지급’ 화면에서 해요.</p></div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {(["NORMAL", "EPIC", "LEGENDARY"] as Rarity[]).map((rarity) => {
            const setting = settings.find((item) => item.rarity === rarity);
            return (
              <section key={rarity} className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                <div className="flex items-center justify-between gap-3"><h3 className="font-black">{rarity}</h3><span className={`rounded px-2 py-1 text-[10px] font-black ${setting?.configured ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}`}>{setting?.configured ? "설정됨" : "사용 중지"}</span></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold">제작 비용<input type="number" min="0" step="1" value={forms[rarity].craftCost} onChange={(event) => updateForm(rarity, "craftCost", event.target.value)} placeholder="정수 입력" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5" /></label>
                  <label className="text-sm font-bold">분해 획득량<input type="number" min="0" step="1" value={forms[rarity].disenchantReward} onChange={(event) => updateForm(rarity, "disenchantReward", event.target.value)} placeholder="정수 입력" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5" /></label>
                </div>
                <button type="button" disabled={savingRarity === rarity} onClick={() => void saveSetting(rarity)} className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-black text-black disabled:opacity-50"><Save className="h-4 w-4" /> {savingRarity === rarity ? "저장 중..." : "설정 저장"}</button>
              </section>
            );
          })}
        </div>
      </section></>,
<><section className="rounded-xl border border-rose-900/60 bg-black/40 p-5 sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <Sparkles className="mt-1 h-5 w-5 text-rose-300" />
          <div><h2 className="text-xl font-black">챔피언 제작·중복 보상 설정</h2><p className="mt-2 text-sm text-neutral-500">챔피언 프리즘은 일반 카드 프리즘과 별도 재화입니다. 설정되지 않으면 해당 기능이 비활성화됩니다.</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">챔피언 제작 비용<input type="number" min="0" step="1" value={championForm.craftCost} onChange={(event) => setChampionForm((current) => ({ ...current, craftCost: event.target.value }))} placeholder="정수 입력" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5" /></label>
          <label className="text-sm font-bold">중복 챔피언 보상<input type="number" min="0" step="1" value={championForm.duplicateReward} onChange={(event) => setChampionForm((current) => ({ ...current, duplicateReward: event.target.value }))} placeholder="정수 입력" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5" /></label>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className={`rounded px-2 py-1 text-[10px] font-black ${championSetting.configured ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}`}>{championSetting.configured ? "설정됨" : "사용 중지"}</span>
          <button type="button" disabled={savingChampion} onClick={() => void saveChampionSetting()} className="flex items-center gap-2 rounded bg-rose-400 px-4 py-2.5 text-sm font-black text-black disabled:opacity-50"><Save className="h-4 w-4" /> {savingChampion ? "저장 중..." : "설정 저장"}</button>
        </div>
      </section></>]}</AdminEditorSections>

    </div>
  );
}
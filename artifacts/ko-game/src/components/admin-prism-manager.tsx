import {useAdminDraftGuard} from './admin-editor-sections';
import {AdminEditorSections} from './admin-editor-sections';
import { useEffect, useRef, useState } from "react";
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
  const [users, setUsers] = useState<User[]>([]);
  const [forms, setForms] = useState<Record<Rarity, FormValues>>({
    NORMAL: { craftCost: "", disenchantReward: "" },
    EPIC: { craftCost: "", disenchantReward: "" },
    LEGENDARY: { craftCost: "", disenchantReward: "" },
  });
  const [userId, setUserId] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [revokeAmount, setRevokeAmount] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeKind, setRevokeKind] = useState<"CARD" | "CHAMPION">("CARD");
  const [revoking, setRevoking] = useState(false);
  const revokeRequestRef = useRef<{signature:string;id:string} | null>(null);
  const [message, setMessage] = useState("프리즘 설정을 불러오는 중...");
  const [savingRarity, setSavingRarity] = useState<Rarity | null>(null);
  const [championSetting, setChampionSetting] = useState<ChampionSetting>({ craftCost: null, duplicateReward: null, configured: false });
  const [championForm, setChampionForm] = useState({ craftCost: "", duplicateReward: "" });
  const [savingChampion, setSavingChampion] = useState(false);
  const [granting, setGranting] = useState(false);

  useAdminDraftGuard(settings.length>0,{forms,championForm},JSON.stringify([settings,championSetting]));
  async function load() {
    try {
      const result = await request<{ settings: Setting[]; users: User[]; championPrismSetting: ChampionSetting }>();
      setSettings(result.settings);
      setUsers(result.users);
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

  async function grant() {
    const amount = grantAmount.trim() === "" ? Number.NaN : Number(grantAmount);
    if (!userId) { setMessage("프리즘을 지급할 사용자를 선택해 주세요."); return; }
    setGranting(true);
    setMessage("");
    try {
      await request("/grant", { method: "POST", body: JSON.stringify({ userId, amount }) });
      setGrantAmount("");
      await load();
      setMessage("프리즘을 지급했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "프리즘을 지급하지 못했습니다.");
    } finally {
      setGranting(false);
    }
  }

  async function revoke() {
    const user = users.find(item => item.id === userId), amount = Number(revokeAmount);
    if (!user || !Number.isSafeInteger(amount) || amount < 1 || !revokeReason.trim()) {setMessage("사용자, 회수량과 사유를 확인해 주세요.");return;}
    if (!window.confirm(`${user.nickname} (${user.email}) 계정의 ${revokeKind === "CHAMPION" ? "챔피언 " : ""}프리즘 ${amount.toLocaleString()}개를 회수할까요?\n사유: ${revokeReason}`)) return;
    const signature = JSON.stringify({userId,amount,kind:revokeKind,reason:revokeReason.trim()});
    if (revokeRequestRef.current?.signature !== signature) revokeRequestRef.current = {signature,id:crypto.randomUUID()};
    setRevoking(true);
    try {
      await request("/revoke", {method:"POST",body:JSON.stringify({userId,amount,kind:revokeKind,reason:revokeReason.trim(),requestId:revokeRequestRef.current!.id})});
      revokeRequestRef.current = null;
      setRevokeAmount("");setRevokeReason("");await load();setMessage("프리즘을 회수하고 기록을 남겼습니다.");
    } catch(error) {setMessage(error instanceof Error ? error.message : "프리즘 회수에 실패했습니다.");}
    finally {setRevoking(false);}
  }

  return (
    <div className="space-y-6">
      <AdminEditorSections panels={[{"id":"admin-prism-manager-0","label":"카드 제작 · 분해"},{"id":"admin-prism-manager-1","label":"챔피언 제작"},{"id":"admin-prism-manager-2","label":"프리즘 지급"},{"id":"admin-prism-manager-3","label":"프리즘 회수"}]}>{[<><section className="rounded-xl border border-neutral-800 bg-black/40 p-5 sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <Sparkles className="mt-1 h-5 w-5 text-amber-400" />
          <div><p className="font-display text-xs font-bold tracking-[0.25em] text-primary">PRISM ECONOMY</p><h2 className="mt-2 text-xl font-black">카드 제작 설정</h2><p className="mt-2 text-sm text-neutral-500">제작과 분해 값이 설정되지 않았거나 유효하지 않으면 사용자 기능은 안전하게 비활성화됩니다.</p></div>
        </div>
        {message && <p role="status" className="mb-4 rounded border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">{message}</p>}
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
          <div><p className="font-display text-xs font-bold tracking-[0.25em] text-rose-300">CHAMPION PRISM ECONOMY</p><h2 className="mt-2 text-xl font-black">챔피언 제작·중복 보상 설정</h2><p className="mt-2 text-sm text-neutral-500">챔피언 프리즘은 일반 카드 프리즘과 별도 재화입니다. 설정되지 않으면 해당 기능이 비활성화됩니다.</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">챔피언 제작 비용<input type="number" min="0" step="1" value={championForm.craftCost} onChange={(event) => setChampionForm((current) => ({ ...current, craftCost: event.target.value }))} placeholder="정수 입력" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5" /></label>
          <label className="text-sm font-bold">중복 챔피언 보상<input type="number" min="0" step="1" value={championForm.duplicateReward} onChange={(event) => setChampionForm((current) => ({ ...current, duplicateReward: event.target.value }))} placeholder="정수 입력" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5" /></label>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className={`rounded px-2 py-1 text-[10px] font-black ${championSetting.configured ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}`}>{championSetting.configured ? "설정됨" : "사용 중지"}</span>
          <button type="button" disabled={savingChampion} onClick={() => void saveChampionSetting()} className="flex items-center gap-2 rounded bg-rose-400 px-4 py-2.5 text-sm font-black text-black disabled:opacity-50"><Save className="h-4 w-4" /> {savingChampion ? "저장 중..." : "설정 저장"}</button>
        </div>
      </section></>,
<><section className="rounded-xl border border-neutral-800 bg-black/40 p-5 sm:p-7">
        <h2 className="text-xl font-black">사용자 프리즘 지급</h2>
        <p className="mt-2 text-sm text-neutral-500">관리자 테스트용 지급이며, 모든 지급은 프리즘 변동 로그에 기록됩니다.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
          <select value={userId} onChange={(event) => setUserId(event.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm"><option value="">사용자 선택</option>{users.map((user) => <option key={user.id} value={user.id}>{user.nickname} · {user.email} · ◆ {user.prismBalance.toLocaleString()}</option>)}</select>
          <input type="number" min="1" max="1000000" step="1" value={grantAmount} onChange={(event) => setGrantAmount(event.target.value)} placeholder="지급량" className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm" />
          <button type="button" disabled={granting} onClick={() => void grant()} className="rounded bg-amber-400 px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{granting ? "지급 중..." : "프리즘 지급"}</button>
        </div>
      </section></>,
<><section className="rounded-xl border border-red-900/50 bg-black/40 p-5 sm:p-7">
        <h2 className="text-xl font-black">사용자 프리즘 회수</h2>
        <p className="mt-2 text-sm text-neutral-500">대상 계정과 회수량을 확인하세요. 회수 내역과 사유가 기록됩니다.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <select aria-label="프리즘 회수 대상" value={userId} onChange={e=>setUserId(e.target.value)} className="min-w-0 rounded border bg-neutral-900 p-3 text-base"><option value="">사용자 선택</option>{users.map(user=><option key={user.id} value={user.id}>{user.nickname} · 일반 ◆ {user.prismBalance.toLocaleString()} · 챔피언 ◈ {(user.championPrismBalance ?? 0).toLocaleString()}</option>)}</select>
          <select aria-label="회수 프리즘 종류" value={revokeKind} onChange={e=>setRevokeKind(e.target.value as "CARD"|"CHAMPION")} className="rounded border bg-neutral-900 p-3 text-base"><option value="CARD">일반 카드 프리즘</option><option value="CHAMPION">챔피언 프리즘</option></select>
          <input aria-label="프리즘 회수량" type="number" min="1" max="1000000" step="1" value={revokeAmount} onChange={e=>setRevokeAmount(e.target.value)} placeholder="회수량" className="min-w-0 rounded border bg-neutral-900 p-3 text-base" />
          <input aria-label="프리즘 회수 사유" maxLength={300} value={revokeReason} onChange={e=>setRevokeReason(e.target.value)} placeholder="회수 사유" className="min-w-0 rounded border bg-neutral-900 p-3 text-base" />
          <button type="button" disabled={revoking || !userId || !revokeAmount || !revokeReason.trim()} onClick={()=>void revoke()} className="min-h-11 rounded border border-red-600 px-4 py-2 font-bold text-red-300 disabled:opacity-40">{revoking ? "회수 중…" : "프리즘 회수"}</button>
        </div>
      </section></>]}</AdminEditorSections>

    </div>
  );
}
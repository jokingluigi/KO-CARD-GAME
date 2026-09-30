import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { cardRecordToDefinition, championRecordToDefinition, type CardDefinition, type ChampionDefinition } from '@/game';
import { TOWER_SANDBOX_KEY, TOWER_TEST_RELICS, createTowerSandbox, towerSandboxEligible, type TowerSandboxSetup } from '@/lib/tower-sandbox';
import { ROUTES } from '@/lib/routes';

export function AdminTowerTest({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [, navigate] = useLocation();
  const [cards, setCards] = useState<CardDefinition[]>([]);
  const [champions, setChampions] = useState<ChampionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<TowerSandboxSetup>({ floor: 1, seed: 'tower-test-1', championId: '', enemyChampionId: '', playerDeck: [], enemyDeck: [] });
  const [choices, setChoices] = useState({ playerDeck: '', enemyDeck: '' });
  useEffect(() => {
    let cancelled = false;
    const load = async (path: string) => {
      const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/admin/${path}`, { credentials: 'include' });
      if (response.status === 401 || response.status === 403) { onUnauthorized(); throw new Error('관리자 권한이 필요합니다.'); }
      if (!response.ok) throw new Error('테스트 카탈로그를 불러오지 못했습니다.');
      return response.json();
    };
    void Promise.all([load('cards'), load('champions')]).then(([cardData, championData]) => {
      if (cancelled) return;
      const definitions = cardData.cards.map(cardRecordToDefinition) as CardDefinition[];
      const championDefinitions = championData.champions.map(championRecordToDefinition) as ChampionDefinition[];
      setCards(definitions); setChampions(championDefinitions);
      setSetup(s => ({ ...s, championId: championDefinitions[0]?.id ?? '', enemyChampionId: championDefinitions[1]?.id ?? championDefinitions[0]?.id ?? '' }));
    }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onUnauthorized]);
  const eligible = cards.filter(towerSandboxEligible);
  const control = 'min-h-11 w-full min-w-0 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-base';
  function start() {
    try {
      createTowerSandbox(setup, cards, champions);
      sessionStorage.setItem(TOWER_SANDBOX_KEY, JSON.stringify(setup));
      navigate(`${ROUTES.MAIN_MENU}?source=admin&towerTest=1`);
    } catch (e) { setError(e instanceof Error ? e.message : '테스트를 시작하지 못했습니다.'); }
  }
  return <section className="min-w-0 space-y-5" data-testid="admin-tower-test">
    <div><h2 className="text-xl font-black">타워 단일 전투 테스트</h2><p className="mt-2 text-sm leading-6 text-neutral-400">실제 카드 효과와 기존 AI로 전투합니다. 보상·컬렉션·계정 덱·타워 클리어 기록은 변경되지 않습니다. 새로고침하면 같은 Seed로 전투를 다시 시작합니다.</p></div>
    <p className="rounded border border-neutral-700 p-3 text-sm text-neutral-400">단일 전투와 24종 유물을 검사합니다. 시즌 대화·히든 조건·보상 지급 검사는 별도 전체 도전 테스트가 필요합니다.</p>
    {loading ? <p role="status">카탈로그 불러오는 중…</p> : <>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label>시작 층<select className={control} value={setup.floor} onChange={e => setSetup(s => ({ ...s, floor: Number(e.target.value) }))}>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>{i + 1}층{i === 15 ? ' · 최종 보스' : (i + 1) % 4 === 0 ? ' · 보스' : ''}</option>)}</select></label>
        <label>Seed<input className={control} maxLength={120} value={setup.seed} onChange={e => setSetup(s => ({ ...s, seed: e.target.value }))} /></label>
        {(['playerDeck', 'enemyDeck'] as const).map((key, index) => {
          const championKey = index === 0 ? 'championId' : 'enemyChampionId';
          return <div className="min-w-0 space-y-3 rounded border border-neutral-800 p-4" key={key}>
            <h3 className="font-bold">{index === 0 ? '플레이어' : '상대 AI'} · {setup[key].length}/25장</h3>
            <label className="block">챔피언<select className={control} value={setup[championKey]} onChange={e => setSetup(s => ({ ...s, [championKey]: e.target.value }))}>{champions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="block">추가할 카드<select className={control} value={choices[key]} onChange={e => setChoices(s => ({ ...s, [key]: e.target.value }))}><option value="">선택하세요</option>{eligible.map(c => <option key={c.id} value={c.id}>{c.cost} · {c.name}</option>)}</select></label>
            <div className="flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded border border-neutral-600 px-3 disabled:opacity-40" disabled={!choices[key] || setup[key].length >= 25} onClick={() => setSetup(s => ({ ...s, [key]: [...s[key], choices[key]] }))}>1장 추가</button>
              <button type="button" className="min-h-11 rounded border border-neutral-600 px-3 disabled:opacity-40" disabled={!eligible.length || setup[key].length === 25} onClick={() => setSetup(s => ({ ...s, [key]: [...s[key], ...Array.from({ length: 25 - s[key].length }, (_, i) => eligible[i % eligible.length]!.id)] }))}>남은 자리 자동 채우기</button>
            </div>
            <ol className="max-h-64 overflow-y-auto">{setup[key].map((id, i) => <li className="flex min-w-0 items-center justify-between gap-2 border-b border-neutral-800 py-1" key={`${id}:${i}`}><span className="min-w-0 break-words text-sm">{i + 1}. {cards.find(c => c.id === id)?.name ?? id}</span><button type="button" className="min-h-11 shrink-0 px-3 text-sm text-neutral-400" aria-label={`${i + 1}번째 카드 제외`} onClick={() => setSetup(s => ({ ...s, [key]: s[key].filter((_, n) => n !== i) }))}>제외</button></li>)}</ol>
          </div>;
        })}
      </div>
      <fieldset className="min-w-0 space-y-2"><legend className="mb-2 font-bold">강제 지급 유물 · {(setup.relicTypes ?? []).length}/3</legend>{TOWER_TEST_RELICS.map(relic => {
        const selected = setup.relicTypes?.includes(relic.type) ?? false;
        return <label key={relic.type} className="flex min-h-11 items-start gap-3 rounded border border-neutral-800 p-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={selected} disabled={!selected && (setup.relicTypes?.length ?? 0) >= 3} onChange={() => setSetup(s => ({ ...s, relicTypes: selected ? (s.relicTypes ?? []).filter(type => type !== relic.type) : [...(s.relicTypes ?? []), relic.type] }))} /><span className="min-w-0"><strong className="block text-sm">{relic.name}</strong><span className="text-sm leading-6 text-neutral-400">{relic.description}</span></span></label>;
      })}</fieldset>
      <button type="button" onClick={start} disabled={setup.playerDeck.length !== 25 || setup.enemyDeck.length !== 25 || !setup.championId || !setup.enemyChampionId} className="min-h-12 w-full rounded bg-primary px-5 py-3 font-black text-black disabled:opacity-40 sm:w-auto">테스트 전투 시작</button>
    </>}
    {error && <p role="alert" className="break-words text-sm text-red-300">{error}</p>}
  </section>;
}

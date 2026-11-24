import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Check, Crown, LoaderCircle, Lock, Swords } from 'lucide-react';
import { fetchDecks, type Deck } from '@/lib/decks-client';
import { fetchBosses, startBoss, storeBossHandoff, type BossSummary } from '@/lib/boss-client';
import '@/components/boss-mode.css';

export default function BossMode() {
  const [, navigate] = useLocation();
  const [bosses, setBosses] = useState<BossSummary[] | null>(null);
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [deckId, setDeckId] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([fetchBosses(), fetchDecks()]).then(([list, deckList]) => {
      if (!alive) return;
      setBosses(list.bosses);
      const valid = deckList.filter((deck) => deck.isValid);
      setDecks(valid);
      setDeckId((current) => current || valid.find((deck) => deck.isSelected)?.id || valid[0]?.id || '');
      setChosen((current) => current ?? list.bosses.find((boss) => !boss.locked && !boss.cleared)?.id ?? list.bosses[0]?.id ?? null);
    }).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : '보스전 정보를 불러오지 못했어요.'); });
    return () => { alive = false; };
  }, [retry]);

  const boss = useMemo(() => bosses?.find((entry) => entry.id === chosen) ?? null, [bosses, chosen]);
  const clearedCount = bosses?.filter((entry) => entry.cleared).length ?? 0;

  async function challenge() {
    if (!boss || !deckId || starting) return;
    setStarting(true); setError(null);
    try {
      const handoff = await startBoss(boss.id, deckId);
      storeBossHandoff(handoff);
      navigate(`/ai-match?boss=${encodeURIComponent(handoff.matchId)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '보스전을 시작하지 못했어요.');
      setStarting(false);
    }
  }

  return (
    <main className="kboss" data-testid="boss-mode">
      <header className="kboss__head">
        <button type="button" className="kboss__back" onClick={() => navigate('/online')} aria-label="뒤로"><ArrowLeft className="h-5 w-5" /></button>
        <div>
          <h1><Crown className="h-6 w-6" aria-hidden="true" /> 보스전</h1>
          <p>스테이지를 차례로 깨면 다음 보스가 열려요. 처음 깨면 보상을 받아요.</p>
        </div>
        {bosses && bosses.length > 0 && <span className="kboss__progress">{clearedCount} / {bosses.length} 클리어</span>}
      </header>

      {error && <div className="kboss__error" role="alert">{error} <button type="button" onClick={() => setRetry((x) => x + 1)}>다시 시도</button></div>}
      {!bosses && !error && <p className="kboss__loading"><LoaderCircle className="h-5 w-5 animate-spin" /> 보스를 불러오는 중…</p>}
      {bosses && bosses.length === 0 && <p className="kboss__empty">아직 열린 보스가 없어요. 곧 찾아올게요!</p>}

      {bosses && bosses.length > 0 && (
        <div className="kboss__body">
          <ol className="kboss__stages" aria-label="보스 스테이지">
            {bosses.map((entry, index) => (
              <li key={entry.id}>
                <button type="button" className={`kboss__stage ${entry.id === chosen ? 'is-chosen' : ''} ${entry.locked ? 'is-locked' : ''} ${entry.cleared ? 'is-cleared' : ''}`} onClick={() => setChosen(entry.id)}>
                  <span className="kboss__stage-no">STAGE {index + 1}</span>
                  <span className="kboss__stage-art">{entry.imageUrl ? <img src={entry.imageUrl} alt="" /> : <Crown className="h-7 w-7" />}</span>
                  <span className="kboss__stage-text"><b>{entry.locked ? '???' : entry.name}</b><small>{entry.locked ? '앞 스테이지를 깨면 열려요' : entry.subtitle || `${entry.phaseCount}페이즈`}</small></span>
                  <span className="kboss__stage-state">{entry.locked ? <Lock className="h-4 w-4" /> : entry.cleared ? <Check className="h-4 w-4" /> : <Swords className="h-4 w-4" />}</span>
                </button>
              </li>
            ))}
          </ol>

          {boss && (
            <section className="kboss__detail" aria-label="보스 정보">
              <div className="kboss__portrait">{boss.imageUrl && !boss.locked ? <img src={boss.imageUrl} alt="" /> : <Crown className="h-16 w-16" />}</div>
              <h2>{boss.locked ? '잠긴 보스' : boss.name}</h2>
              {!boss.locked && boss.subtitle && <p className="kboss__subtitle">{boss.subtitle}</p>}
              {!boss.locked && boss.description && <p className="kboss__desc">{boss.description}</p>}
              <ul className="kboss__facts">
                <li><span>페이즈</span><b>{boss.locked ? '?' : `${boss.phaseCount}단계`}</b></li>
                <li><span>첫 클리어 보상</span><b>{boss.cleared ? '받음 ✓' : `${boss.firstClearReward.toLocaleString()} 크레딧`}</b></li>
                {boss.cleared && <li><span>클리어 횟수</span><b>{boss.clearCount}번</b></li>}
              </ul>
              <label className="kboss__deck">
                <span>출전 덱</span>
                {decks && decks.length > 0 ? (
                  <select value={deckId} onChange={(event) => setDeckId(event.target.value)}>
                    {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}{deck.champion ? ` · ${deck.champion.name}` : ''}</option>)}
                  </select>
                ) : <button type="button" className="kboss__link" onClick={() => navigate('/decks')}>사용할 수 있는 덱이 없어요 · 덱 만들기 ›</button>}
              </label>
              <button type="button" className="kboss__go" data-testid="button-boss-start" disabled={boss.locked || !deckId || starting} onClick={() => void challenge()}>
                {starting ? '준비 중…' : boss.locked ? '잠겨 있어요' : boss.cleared ? '다시 도전' : '도전하기'}
              </button>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

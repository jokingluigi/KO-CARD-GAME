import { towerMusicFor } from '@/lib/tower-music';
import { TowerDialogueView } from '@/components/tower-dialogue-view';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { CardRenderer } from '@/components/card-renderer';
import { GameStatePreview } from '@/components/game-state-preview';
import { fetchGameMedia, emptyGameMediaCatalog, type GameMediaCatalog, type GameAction, type CardDefinition } from '@/game';
import { towerActionPayload } from '@/lib/tower-action-payload';
import { towerDiagnostic, towerRequest, towerCommand, TowerRequestError, type TowerView, type TowerHomeData } from '@/lib/tower-client';
import { fetchCurrentUser } from '@/lib/auth-client';
import { readStoredBgmMute, readStoredBgmVolume, BGM_MUTE_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY } from '@/audio/audio-settings';
import type { AttackAnimationState } from '@/components/attack-animation-utils';
import { combatHitSound } from '@/audio/combat-hit-sound';
import { audioManager } from '@/audio/audio-manager';

const button = 'min-h-12 rounded border border-neutral-600 px-4 py-3 text-base font-bold disabled:opacity-40';
export default function Tower() {
  const [, navigate] = useLocation();
  const [home, setHome] = useState<TowerHomeData | null>(null);
  const [view, setView] = useState<TowerView>({ run: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [starterId, setStarterId] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [showDeck, setShowDeck] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [media, setMedia] = useState<GameMediaCatalog>(emptyGameMediaCatalog);
  const [bgmMuted, setBgmMuted] = useState(readStoredBgmMute);
  const [bgmVolume, setBgmVolume] = useState(readStoredBgmVolume);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [attackQueue, setAttackQueue] = useState<AttackAnimationState[]>([]);
  const [attackImpactTriggered, setAttackImpactTriggered] = useState(false);
  const [bossIntroGameId, setBossIntroGameId] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<TowerView | null>(null);
  const enqueueAttack = useCallback((animation: AttackAnimationState) => setAttackQueue(queue => [...queue, animation]), []);
  useEffect(() => {
    if (!settlement || presentationBusy || attackQueue.length) return;
    const timer = window.setTimeout(() => { setView(previous => ({ ...previous, ...settlement })); setSettlement(null); }, 1500);
    return () => window.clearTimeout(timer);
  }, [settlement, presentationBusy, attackQueue.length]);
  const run = view.run;
  useEffect(() => {
    const scene = view.scenes?.find(item => item.id === run?.encounter.sceneId);
    const track = towerMusicFor(run?.phase, run?.encounter.bossSlot, view.music, scene);
    if (track) audioManager.playMatchBgm(track.assetUrl, track.volume);
    else audioManager.stopBgm();
  }, [run?.phase, run?.encounter.bossSlot, run?.encounter.sceneId, view.music, view.scenes]);
  useEffect(() => { audioManager.setBgmMuted(bgmMuted); audioManager.setBgmVolume(bgmVolume); }, [bgmMuted, bgmVolume]);
  useEffect(() => () => audioManager.stopGameAudio(), []);

  const cards = view.cards ?? home?.cards ?? [];
  const champion = (view.champions ?? home?.champions)?.find(c => c.id === run?.championId);
  async function loadRun(id?: string, restart = false) {
    const loaded = await towerRequest<TowerView>(id ? `/runs/${id}` : '/runs/current');
    let result = loaded;
    if (restart && loaded.run?.phase === 'BATTLE') {
      const restarted = await towerRequest<TowerView>(`/runs/${loaded.run.id}/restart`, { version: loaded.run.version });
      result = { ...loaded, ...restarted };
    }
    setView(result); return result;
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const auth = await fetchCurrentUser();
        if (!auth.authenticated) { navigate('/'); return; }
        const availability = await towerRequest<{ enabled: boolean }>('/availability');
        if (!availability.enabled) { if (!cancelled) setError('타워 모드는 현재 사용할 수 없습니다.'); return; }
        const saved = new URLSearchParams(window.location.search).get('run');
        const restored = await loadRun(saved ?? undefined, true);
        if (cancelled) return;
        // Existing runs use their own immutable catalog even if a newer season is invalid.
        try {
          const homeData = await towerRequest<TowerHomeData>('/home');
          if (cancelled) return;
          setHome(homeData); setStarterId(homeData.starters[0]?.id ?? '');
        } catch (error) { if (!restored.run) throw error; }
        void fetchGameMedia().then(value => { if (!cancelled) setMedia(value); }).catch(() => {});
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '타워를 불러오지 못했습니다.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  async function operate(work: () => Promise<TowerView>, detail = false) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = await work();
      if(run?.phase!=='BATTLE' && result.run?.phase==='BATTLE' && result.battle) setBossIntroGameId(result.battle.gameId);
      if (detail && result.run) await loadRun(result.run.id);
      else if (run?.phase === 'BATTLE' && result.run?.phase !== 'BATTLE' && result.battle?.status === 'FINISHED') {
        setSettlement(result); setView(previous => ({ ...previous, battle: result.battle }));
      } else setView(previous => ({ ...previous, ...result }));
      if (result.run) window.history.replaceState(null, '', `${window.location.pathname}?${towerDiagnostic ? 'towerTest=1&' : ''}run=${encodeURIComponent(result.run.id)}`);
      setSelectedCardId(null); setSelectedAttackerId(null); setReplaceIndex(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '타워 진행을 저장하지 못했습니다.');
      if (e instanceof TowerRequestError && ['STALE_RUN', 'REQUEST_TIMEOUT', 'RUN_ENDED'].includes(e.code)) {
        try { await loadRun(run?.id); } catch (reloadError) { setError(reloadError instanceof Error ? reloadError.message : '진행 상태를 다시 불러오지 못했습니다.'); }
      }
    } finally { busyRef.current = false; setBusy(false); }
  }
  const command = (value: Parameters<typeof towerCommand>[1]) => { if (run) void operate(() => towerCommand(run, value)); };
  const action = (value: GameAction) => {
    const payload = towerActionPayload(value);
    if (run && !presentationBusy && !settlement && !attackQueue.length) void operate(() => towerRequest(`/runs/${run.id}/action`, { version: run.version, action: payload }));
  };
  function cardDisplay(id: string) {
    const c = cards.find(c => c.id === id);
    return c ? <CardRenderer name={c.name} cardType={c.cardType} cost={c.cost} attack={c.attack} health={c.health} rulesText={c.rulesText} imageUrl={c.imageUrl} rarity={c.rarity} size="detail" /> : <p>카드 정보를 불러오지 못했습니다.</p>;
  }
  const rewardText = (reward: { type: string; amount: number; targetId?: string }) => `${reward.type === 'CURRENCY' ? '크레딧' : reward.type === 'PACK' ? '팩' : reward.type === 'CHAMPION' ? '챔피언' : cards.find(c => c.id === reward.targetId)?.name ?? '카드'} ${reward.amount}${reward.type === 'CURRENCY' ? '' : '개'}`;
  const deck = run?.deck ?? home?.starters.find(s => s.id === starterId)?.cardIds ?? [];
  const deckList = <div className="grid min-w-0 gap-2">{deck.map((id, index) => <button key={`${id}:${index}`} className={`${button} flex min-w-0 items-center justify-between gap-3 text-left ${replaceIndex === index ? 'border-primary bg-primary/10' : ''}`} disabled={busy || run?.phase !== 'REPLACE'} onClick={() => setReplaceIndex(index)}><span className="min-w-0 break-words">{index + 1}. {cards.find(c => c.id === id)?.name ?? id}</span><span className="shrink-0 text-neutral-400">{cards.find(c => c.id === id)?.cost}G</span></button>)}</div>;
  if (loading) return <main className="p-6 text-white" role="status">타워 도전을 불러오는 중…</main>;
  if (run?.phase === 'BATTLE' && view.battle) return <>
    <div className="fixed left-2 top-2 z-[220] max-w-[calc(100%-1rem)] rounded bg-neutral-950/95 px-3 py-2 text-sm text-white"><span>{towerDiagnostic && '관리자 테스트 · '}{run.encounter.bossSlot === 'hiddenBoss' ? '히든 보스' : `${run.floor}/16층`} · 유물 {run.relicIds.length}/3</span>{busy && <span role="status"> · 저장 중…</span>}{error && <p role="alert" className="break-words text-red-300">{error}</p>}</div>
    <GameStatePreview cinematicIntro={run.encounter.bossSlot && bossIntroGameId===view.battle.gameId ? {id:run.id+":"+view.battle.gameId,kind:run.encounter.bossSlot==='hiddenBoss'?'HIDDEN_BOSS':'BOSS',title:view.battle.players[1]?.champion?.name??'BOSS',subtitle:'FLOOR '+run.floor,art:view.battle.players[1]?.champion?.imageUrl}:undefined} state={view.battle} mediaCatalog={media} selectedCardId={selectedCardId} selectedAttackerId={selectedAttackerId} playError={error || null} turnSecondsRemaining={60} showTurnTimer={false} autoPresentOwnActions canEndTurn={!busy && !presentationBusy && !settlement && !attackQueue.length} guidedTutorial={false}
      onEndTurn={() => action({ type: 'END_TURN', playerId: 'player-1' })} onMulligan={cardInstanceIds => action({ type: 'MULLIGAN', playerId: 'player-1', cardInstanceIds })}
      bgmMuted={bgmMuted} bgmVolume={bgmVolume} onBgmMutedChange={value => { setBgmMuted(value); localStorage.setItem(BGM_MUTE_STORAGE_KEY, String(value)); audioManager.setBgmMuted(value); }} onBgmVolumeChange={value => { setBgmVolume(value); localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(value)); audioManager.setBgmVolume(value); }}
      onSurrender={() => action({ type: 'SURRENDER', playerId: 'player-1' })} onEmote={emote => action({ type: 'EMOTE', playerId: 'player-1', emote })}
      onSelectCard={id => { if (!busy) setSelectedCardId(id); }} onSelectSlot={boardSlot => { if (selectedCardId) action({ type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: selectedCardId, boardSlot }); }}
      onUseTechnique={cardInstanceId => action({ type: 'BEGIN_TARGETED_ACTION', playerId: 'player-1', action: { type: 'PLAY_TECHNIQUE', cardInstanceId } })}
      playAnimation={null} onPlayAnimationComplete={() => {}} attackAnimation={attackQueue[0] ?? null} attackImpactTriggered={attackImpactTriggered} onOpponentAttackPresentation={enqueueAttack} onAttackImpact={() => { setAttackImpactTriggered(true); const animation = attackQueue[0]; if (animation) { const sound = combatHitSound(animation.damage, animation.finishingBlow); if (sound) audioManager.playAttack(sound, 90, 1); } }} onAttackAnimationComplete={() => { setAttackQueue(queue => queue.slice(1)); setAttackImpactTriggered(false); }}
      onSelectAttacker={id => { if (!busy) setSelectedAttackerId(id); }} onAttackWrestler={cardInstanceId => { if (selectedAttackerId) action({ type: 'ATTACK', playerId: 'player-1', attackerInstanceId: selectedAttackerId, target: { type: 'WRESTLER', playerId: 'player-2', cardInstanceId } }); }}
      onAttackPlayer={() => { if (selectedAttackerId) action({ type: 'ATTACK', playerId: 'player-1', attackerInstanceId: selectedAttackerId, target: { type: 'PLAYER', playerId: 'player-2' } }); }}
      onUseActive={cardInstanceId => action({ type: 'BEGIN_TARGETED_ACTION', playerId: 'player-1', action: { type: 'USE_ACTIVE', cardInstanceId } })} onUseChampionAbility={() => action({ type: 'BEGIN_TARGETED_ACTION', playerId: 'player-1', action: { type: 'USE_CHAMPION_ABILITY' } })}
      onCancelEffectTargeting={() => action({ type: 'CANCEL_EFFECT_TARGET', playerId: 'player-1' })} onEffectTarget={targetId => action({ type: view.battle!.targetingState?.phase === 'PRE_COMMIT' ? 'CONFIRM_PRECOMMIT_TARGET' : 'SELECT_EFFECT_TARGET', playerId: 'player-1', targetId })}
      onPresentationBusyChange={setPresentationBusy} onReturnToMainMenu={() => navigate('/')} />
  </>;
  const scene = view.scenes?.find(s => s.id === run?.encounter.sceneId);
  return <main className="ko-tower min-h-dvh min-w-0 bg-neutral-950 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white">
    <div className="mx-auto max-w-4xl space-y-6"><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-black">TOWER</h1><button className={button} onClick={() => navigate('/')}>메인 메뉴</button></header>
      {towerDiagnostic && <p className="rounded border border-amber-500 p-3 text-amber-200">관리자 테스트 · 실제 보상과 계정 클리어 기록은 지급되지 않습니다.{view.rewardPreview && <span className="block break-words">보상 미리보기: 첫 클리어 {rewardText(view.rewardPreview.firstReward)} · 반복 클리어 {rewardText(view.rewardPreview.repeatReward)}</span>}</p>}
      {error && <p role="alert" className="break-words rounded border border-red-500/50 p-3 text-red-300">{error}</p>}{busy && <p role="status">저장 중…</p>}
      {!run && home && !towerDiagnostic && <><div><h2 className="text-xl font-bold">{home.season.name}</h2><p className="mt-2 break-words text-neutral-400">{home.season.description}</p></div><button className={button} disabled>이어 하기 · 진행 중 도전 없음</button><button className={`${button} ml-2 border-primary`} onClick={() => setChoosing(true)}>새 도전</button>
        {choosing && <section className="space-y-4"><h2 className="text-xl font-bold">보유 챔피언 · 스타터 덱 선택</h2>{!home.starters.length && <p>보유 챔피언에게 사용 가능한 스타터 덱이 없습니다. 운영자에게 문의해 주세요.</p>}<select aria-label="챔피언과 스타터 덱" className="min-h-12 w-full min-w-0 rounded border border-neutral-600 bg-neutral-900 p-3 text-base" value={starterId} onChange={e => setStarterId(e.target.value)}>{home.starters.map(s => <option key={s.id} value={s.id}>{home.champions.find(c => c.id === s.championId)?.name} · {s.name}</option>)}</select>{deckList}<button className={`${button} w-full border-primary`} disabled={busy || !starterId} onClick={() => { const starter = home.starters.find(s => s.id === starterId); if (starter) void operate(() => towerRequest('/runs', { championId: starter.championId, starterId }), true); }}>25장으로 도전 시작</button></section>}</>}
      {run && <><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{run.encounter.bossSlot === 'hiddenBoss' ? '히든 보스' : `FLOOR ${run.floor} / 16`}</h2><span>{champion?.name} · 덱 {run.deck.length}장 · 유물 {run.relicIds.length}/3</span></div>
        {run.phase === 'HUB' && <section className="space-y-4"><p>다음 대전 · {run.encounter.bossSlot ? '보스' : '일반 전투'} · {run.encounter.difficulty}</p><button className={`${button} w-full border-primary`} disabled={busy} onClick={() => command({ type: 'CHALLENGE' })}>도전</button><button className={button} onClick={() => setShowDeck(value => !value)}>현재 덱 {showDeck ? '닫기' : '보기'}</button>{showDeck && deckList}</section>}
        {run.phase === 'DIALOGUE' && <section className="space-y-5"><div className="flex flex-wrap gap-3"><button className={button} onClick={() => { const value = !bgmMuted; setBgmMuted(value); localStorage.setItem(BGM_MUTE_STORAGE_KEY, String(value)); }}>{bgmMuted ? '대화 OST 음소거 해제' : '대화 OST 음소거'}</button><label>음악 음량<input aria-label="대화 OST 전체 음량" type="range" min={0} max={100} value={bgmVolume} onChange={e => { const value = Number(e.target.value); setBgmVolume(value); localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(value)); }} /></label></div><TowerDialogueView scene={scene} characters={view.characters ?? []} index={run.dialogueIndex} /><div className="flex gap-3"><button className={`${button} flex-1`} disabled={busy} onClick={() => command({ type: 'DIALOGUE_NEXT' })}>다음</button><button className={button} disabled={busy} onClick={() => command({ type: 'DIALOGUE_SKIP' })}>건너뛰기</button></div></section>}
        {run.phase === 'CARD_REWARD' && <section className="space-y-5"><h3 className="text-xl font-bold">승리 · 카드 1장 선택</h3><div className="grid justify-items-center gap-6 sm:grid-cols-3">{run.cardOptions.map(id => <div key={id} className="min-w-0 space-y-3">{cardDisplay(id)}<button className={`${button} w-full`} disabled={busy} onClick={() => command({ type: 'SELECT_CARD', cardId: id })}>선택</button></div>)}</div><button className={button} disabled={busy} onClick={() => command({ type: 'SKIP_CARD' })}>보상 건너뛰기</button></section>}
        {run.phase === 'REPLACE' && <section className="space-y-4"><h3 className="text-xl font-bold">교체할 카드 선택</h3><p>새 카드: {cards.find(c => c.id === run.selectedCardId)?.name}</p>{deckList}<button className={`${button} sticky bottom-3 w-full border-primary bg-neutral-950`} disabled={busy || replaceIndex === null} onClick={() => { if (replaceIndex !== null) command({ type: 'REPLACE_CARD', deckIndex: replaceIndex }); }}>선택한 카드 교체 확정</button></section>}
        {run.phase === 'RELIC_REWARD' && <section className="space-y-4"><h3 className="text-xl font-bold">보스 격파 · 유물 선택</h3>{run.relicOptions.map(id => { const relic = view.relics?.find(r => r.id === id); return <article key={id} className="space-y-3 rounded border border-neutral-700 p-4">{relic?.imageUrl && <img src={relic.imageUrl} alt="" className="h-16 w-16 object-contain" />}<h4 className="text-lg font-bold">{relic?.name ?? id}</h4><p className="break-words leading-7 text-neutral-300">{relic?.description}</p><button className={`${button} w-full`} disabled={busy} onClick={() => command({ type: 'SELECT_RELIC', relicId: id })}>이 유물 선택</button></article>; })}</section>}
        {run.phase === 'RESULT' && <section className="space-y-4"><h3 className="text-2xl font-black">{run.hiddenClear ? '히든 클리어' : run.regularClear ? '타워 클리어' : '도전 종료'}</h3><p>도달 층 {run.floor} · 격파 보스 {run.defeatedBossSlots.length}명</p><p>일반 클리어: {run.regularClear ? '달성' : '미달성'} · 히든 클리어: {run.hiddenClear ? '달성' : '미달성'}</p>{deckList}<button className={button} onClick={() => { setView({ run: null }); setChoosing(true); navigate(towerDiagnostic ? '/admin/tower' : '/tower'); }}>새 도전</button></section>}
        {!!view.rewardReceipts?.length && <section className="space-y-2 rounded border border-green-600/50 p-4"><h3 className="font-bold">지급된 보스 보상</h3>{view.rewardReceipts.map(receipt => <p key={receipt.slot}>{receipt.slot === 'hiddenBoss' ? '히든 보스' : receipt.slot === 'finalBoss' ? '최종 보스' : `${receipt.slot.replace('boss', '')}번째 보스`} · {receipt.firstClear ? '첫 클리어' : '반복 클리어'} · {rewardText(receipt.reward)}</p>)}</section>}
        {!!run.relicIds.length && <section className="space-y-2"><h3 className="font-bold">보유 유물</h3>{run.relicIds.map(id => <p className="break-words text-sm leading-6 text-neutral-400" key={id}>{view.relics?.find(r => r.id === id)?.name ?? id} · {view.relics?.find(r => r.id === id)?.description}</p>)}</section>}
        {!run.ended && run.phase !== 'DIALOGUE' && <button className={`${button} text-neutral-400`} disabled={busy} onClick={() => { if (window.confirm('이 도전을 종료할까요? 덱과 기록은 보존됩니다.')) command({ type: 'ABANDON' }); }}>도전 종료</button>}
      </>}
    </div>
  </main>;
}

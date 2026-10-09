import {describeTowerEffect} from '../../../../lib/game-engine/src/tower/effects';
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
  const [championId,setChampionId]=useState('');
  const [towers,setTowers]=useState<Array<{id:string;name:string;description:string;totalFloors:number;imageUrl?:string;recommendedDifficulty?:string}>>([]);
  const [towerId,setTowerId]=useState('');
  const [showBossInfo,setShowBossInfo]=useState(false);
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
    const lineTrack=run?.phase==='DIALOGUE'?scene?.lines[run.dialogueIndex]?.music:undefined;
    const track = lineTrack??(run?.phase==='BATTLE'&&run.encounter.music?run.encounter.music:towerMusicFor(run?.phase, run?.encounter.bossSlot, view.music, scene));
    if (track) audioManager.playMatchBgm(track.assetUrl, track.volume);
    else audioManager.stopBgm();
  }, [run?.phase, run?.encounter.bossSlot, run?.encounter.sceneId, view.music, view.scenes,run?.encounter.music,run?.dialogueIndex]);
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
          const list= towerDiagnostic?{towers:[]}:await towerRequest<{towers:typeof towers}>('/towers');
          setTowers(list.towers);const first=list.towers[0]?.id;setTowerId(first??'');
          const homeData = await towerRequest<TowerHomeData>('/home'+(first?'?towerId='+encodeURIComponent(first):''));
          if (cancelled) return;
          setHome(homeData); setStarterId(homeData.starters[0]?.id ?? '');setChampionId(homeData.champions[0]?.id??'');
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
  useEffect(()=>{const cancel=()=>{if(showBossInfo){setShowBossInfo(false);return;}if(showDeck){setShowDeck(false);return;}if(busy||!run)return;if(run.phase==='DIALOGUE')command({type:'DIALOGUE_SKIP'});else if(run.phase==='REPLACE')command({type:'CANCEL_CARD_SELECTION'});};window.addEventListener('ko-gamepad-cancel',cancel);return()=>window.removeEventListener('ko-gamepad-cancel',cancel);},[run,busy,showBossInfo,showDeck]);
  function cardDisplay(id: string) {
    const c = cards.find(c => c.id === id);
    return c ? <CardRenderer name={c.name} cardType={c.cardType} cost={c.cost} attack={c.attack} health={c.health} rulesText={c.rulesText} imageUrl={c.imageUrl} rarity={c.rarity} size="detail" /> : <p>카드 정보를 불러오지 못했습니다.</p>;
  }
  const rewardText = (reward: any):string => reward?.type==='MULTIPLE' ? reward.rewards.map(rewardText).join(' + ') || '보상 없음' : !reward ? '보상 없음' : `${reward.type === 'CURRENCY' ? '크레딧' : reward.type === 'PACK' ? '팩' : reward.type === 'CHAMPION' ? '챔피언' : cards.find(c => c.id === reward.targetId)?.name ?? '카드'} ${reward.amount}${reward.type === 'CURRENCY' ? '' : '개'}`;
  const deck = run?.deck ?? home?.starters.find(s => s.id === starterId)?.cardIds ?? [];
  const deckList = <div className="grid min-w-0 gap-2">{deck.map((id, index) => <button key={`${id}:${index}`} className={`${button} flex min-w-0 items-center justify-between gap-3 text-left ${replaceIndex === index ? 'border-primary bg-primary/10' : ''}`} disabled={busy || run?.phase !== 'REPLACE'} onClick={() => setReplaceIndex(index)}><span className="min-w-0 break-words">{index + 1}. {cards.find(c => c.id === id)?.name ?? id}</span><span className="shrink-0 text-neutral-400">{cards.find(c => c.id === id)?.cost}G</span></button>)}</div>;
  if (loading) return <main className="p-6 text-white" role="status">타워 도전을 불러오는 중…</main>;
  if (run?.phase === 'BATTLE' && view.battle) return <>
    <div className="pointer-events-none fixed left-2 top-2 z-[220] max-w-[calc(100%-1rem)] rounded bg-neutral-950/95 px-3 py-2 text-sm text-white"><span>{towerDiagnostic && '관리자 테스트 · '}{run.encounter.bossSlot === 'hiddenBoss' ? '히든 보스' : `${run.floor}/${run.totalFloors??16}층`} · 유물 {run.relicIds.length}</span>{busy && <span role="status"> · 저장 중…</span>}{error && <p role="alert" className="break-words text-red-300">{error}</p>}</div>
    {showBossInfo&&<div role="dialog" aria-modal="true" aria-label="타워 전투 효과 정보" className="fixed inset-0 z-[230] bg-black/95 p-4 text-white"><div className="mx-auto max-h-[90dvh] max-w-xl space-y-4 overflow-y-auto"><button aria-label="닫기" className={button} onClick={()=>setShowBossInfo(false)}>닫기</button>{view.battle.tower?.configuredRules?.map(rule=>{const key=rule.sourceType+':'+rule.sourceId+':'+rule.effect.id,rt=view.battle!.tower?.configuredRuntime,use=rt?.uses[key];const used=rule.effect.limit.scope==='RUN'?rt?.runUses[key]??0:rule.effect.limit.scope==='BATTLE'?use?.battleCount??0:use?.turn===view.battle!.turn?use.turnCount:0;return <article key={key} className="space-y-2 border-b border-neutral-700 py-3"><h3>{rule.sourceType==='TOWER_BOSS'?'보스 능력':'유물'} · {rule.effect.name}</h3><p className="break-words text-sm">{describeTowerEffect(rule.effect)}</p><p>남은 발동: {rule.effect.limit.scope==='UNLIMITED'?'무제한':Math.max(0,rule.effect.limit.count-used)}</p></article>;})}{view.relics?.filter(r=>run.relicIds.includes(r.id)&&!r.effects?.length).map(r=><p key={r.id}>{r.name} · {r.description}</p>)}</div></div>}
    <GameStatePreview onBattleInfo={()=>setShowBossInfo(true)} cinematicIntro={run.encounter.bossSlot && bossIntroGameId===view.battle.gameId ? {id:run.id+":"+view.battle.gameId,kind:run.encounter.bossSlot==='hiddenBoss'?'HIDDEN_BOSS':'BOSS',title:view.battle.players[1]?.champion?.name??'BOSS',subtitle:'FLOOR '+run.floor,art:view.battle.players[1]?.champion?.imageUrl}:undefined} state={view.battle} mediaCatalog={media} backgroundAssetUrl={run.encounter.backgroundUrl} selectedCardId={selectedCardId} selectedAttackerId={selectedAttackerId} playError={error || null} turnSecondsRemaining={60} showTurnTimer={false} autoPresentOwnActions canEndTurn={!busy && !presentationBusy && !settlement && !attackQueue.length} guidedTutorial={false}
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
      {towerDiagnostic && <p className="rounded border border-amber-500 p-3 text-amber-200">관리자 테스트 · 실제 보상과 계정 클리어 기록은 지급되지 않습니다.{view.rewardPreview && <span className="block break-words">보상 미리보기: 첫 클리어 {rewardText(view.rewardPreview.firstReward??{type:"MULTIPLE",rewards:view.rewardPreview.firstRewards??[]})} · 반복 클리어 {rewardText(view.rewardPreview.repeatReward??{type:"MULTIPLE",rewards:view.rewardPreview.repeatRewards??[]})}</span>}</p>}
      {error && <p role="alert" className="break-words rounded border border-red-500/50 p-3 text-red-300">{error}</p>}{busy && <p role="status">저장 중…</p>}
      {!run && home && !towerDiagnostic && <><section className="space-y-3"><h2 className="text-xl font-bold">타워 선택</h2>{towers.map(t=><button className={button+' w-full text-left '+(t.id===towerId?'border-primary':'')} key={t.id} disabled={busy} onClick={()=>{setTowerId(t.id);void towerRequest<TowerHomeData>('/home?towerId='+encodeURIComponent(t.id)).then(h=>{setHome(h);setStarterId(h.starters[0]?.id??'');setChampionId(h.champions[0]?.id??'');}).catch(e=>setError(e.message));}}>{t.imageUrl&&<img src={t.imageUrl} alt="" className="max-h-40 w-full object-contain"/>}<strong>{t.name}</strong><p>{t.totalFloors}층 · {t.recommendedDifficulty}</p><p className="break-words text-sm text-neutral-400">{t.description}</p></button>)}</section><div><h2 className="text-xl font-bold">{home.season.name}</h2><p className="mt-2 break-words text-neutral-400">{home.season.description}</p></div><button className={button} disabled>이어 하기 · 진행 중 도전 없음</button><button className={`${button} ml-2 border-primary`} onClick={() => setChoosing(true)}>새 도전</button>
        {choosing && <section className="space-y-4"><h2 className="text-xl font-bold">보유 챔피언 · 스타터 덱 선택</h2>{!home.starters.length && <p>보유 챔피언에게 사용 가능한 스타터 덱이 없습니다. 운영자에게 문의해 주세요.</p>}{home.season.v2&&<div className="grid min-w-0 grid-cols-2 gap-3">{home.champions.map(c=><button aria-pressed={championId===c.id} className={button+(championId===c.id?' border-primary text-primary':'')} key={c.id} onClick={()=>setChampionId(c.id)}>{c.imageUrl&&<img alt="" src={c.imageUrl} className="mx-auto max-h-24 max-w-full object-contain"/>}{c.name}</button>)}</div>}<div className="space-y-3">{home.starters.map(s=><button aria-pressed={s.id===starterId} className={button+" w-full text-left "+(s.id===starterId?"border-primary":"")} key={s.id} onClick={()=>setStarterId(s.id)}>{s.imageUrl&&<img alt="" src={s.imageUrl} className="max-h-32 max-w-full object-contain"/>}<strong>{s.name}</strong><p>{s.difficultyLabel}</p><p className="break-words text-sm">{s.description}</p></button>)}</div>{deckList}<button className={`${button} w-full border-primary`} disabled={busy || !starterId} onClick={() => { const starter = home.starters.find(s => s.id === starterId); if (starter) void operate(() => towerRequest('/runs', { championId: home.season.v2?(championId||starter.championId):starter.championId, starterId,towerId }), true); }}>25장으로 도전 시작</button></section>}</>}
      {run && <><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{run.encounter.bossSlot === 'hiddenBoss' ? '히든 보스' : `FLOOR ${run.floor} / ${run.totalFloors??16}`}</h2><span>{champion?.name} · 덱 {run.deck.length}장 · 유물 {run.relicIds.length}</span></div>
        {run.phase === 'HUB' && <section className="space-y-4"><p>다음 대전 · {run.encounter.bossSlot ? '보스' : '일반 전투'} · {run.encounter.difficulty}</p><button className={`${button} w-full border-primary`} disabled={busy} onClick={() => command({ type: 'CHALLENGE' })}>도전</button><button className={button} onClick={() => setShowDeck(value => !value)}>현재 덱 {showDeck ? '닫기' : '보기'}</button>{showDeck && deckList}</section>}
        {run.phase === 'DIALOGUE' && <section className="space-y-5"><div className="flex flex-wrap gap-3"><button className={button} onClick={() => { const value = !bgmMuted; setBgmMuted(value); localStorage.setItem(BGM_MUTE_STORAGE_KEY, String(value)); }}>{bgmMuted ? '대화 OST 음소거 해제' : '대화 OST 음소거'}</button><label>음악 음량<input aria-label="대화 OST 전체 음량" type="range" min={0} max={100} value={bgmVolume} onChange={e => { const value = Number(e.target.value); setBgmVolume(value); localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(value)); }} /></label></div><TowerDialogueView scene={scene} characters={view.characters ?? []} index={run.dialogueIndex} /><div className="flex gap-3"><button className={`${button} flex-1`} disabled={busy} onClick={() => command({ type: 'DIALOGUE_NEXT' })}>다음</button><button className={button} disabled={busy} onClick={() => command({ type: 'DIALOGUE_SKIP' })}>건너뛰기</button></div></section>}
        {run.phase === 'CARD_REWARD' && <section className="space-y-5"><h3 className="text-xl font-bold">승리 · 카드 1장 선택</h3><div className="grid justify-items-center gap-6 sm:grid-cols-3">{run.cardOptions.map(id => <div key={id} className="min-w-0 space-y-3">{cardDisplay(id)}<button className={`${button} w-full`} disabled={busy} onClick={() => command({ type: 'SELECT_CARD', cardId: id })}>선택</button></div>)}</div><button className={button} disabled={busy} onClick={() => command({ type: 'SKIP_CARD' })}>보상 건너뛰기</button></section>}
        {run.phase === 'REPLACE' && <section className="space-y-4"><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>command({type:'CANCEL_CARD_SELECTION'})}>보상 다시 선택</button><button className={button} disabled={busy} onClick={()=>command({type:'SKIP_CARD'})}>보상 전체 스킵</button></div><h3 className="text-xl font-bold">교체할 카드 선택</h3><p>새 카드: {cards.find(c => c.id === run.selectedCardId)?.name}</p>{deckList}{replaceIndex!==null&&<p className="border border-primary p-3">{cards.find(c=>c.id===deck[replaceIndex])?.name} → {cards.find(c=>c.id===run.selectedCardId)?.name} · 덱 25장 유지</p>}<button className={`${button} sticky bottom-3 w-full border-primary bg-neutral-950`} disabled={busy || replaceIndex === null} onClick={() => { if (replaceIndex !== null) command({ type: 'REPLACE_CARD', deckIndex: replaceIndex }); }}>선택한 카드 교체 확정</button></section>}
        {run.phase === 'RELIC_REWARD' && <section className="space-y-4"><h3 className="text-xl font-bold">보스 격파 · 유물 선택</h3>{run.relicOptions.map(id => { const relic = view.relics?.find(r => r.id === id); return <article key={id} className="space-y-3 rounded border border-neutral-700 p-4">{relic?.imageUrl && <img src={relic.imageUrl} alt="" className="h-16 w-16 object-contain" />}<h4 className="text-lg font-bold">{relic?.name ?? id}</h4><p className="break-words leading-7 text-neutral-300">{relic?.description}</p><button className={`${button} w-full`} disabled={busy} onClick={() => command({ type: 'SELECT_RELIC', relicId: id })}>이 유물 선택</button></article>; })}</section>}
        {run.phase === 'RESULT' && <section className="space-y-4"><h3 className="text-2xl font-black">{run.hiddenClear ? '히든 클리어' : run.regularClear ? '타워 클리어' : '도전 종료'}</h3><p>도달 층 {run.floor} · 격파 보스 {run.defeatedBossSlots.length}명</p><p>일반 클리어: {run.regularClear ? '달성' : '미달성'} · 히든 클리어: {run.hiddenClear ? '달성' : '미달성'}</p>{deckList}<button className={button} onClick={() => { setView({ run: null }); setChoosing(true); navigate(towerDiagnostic ? '/admin/tower' : '/tower'); }}>새 도전</button></section>}
        {!!view.rewardReceipts?.length && <section className="space-y-2 rounded border border-green-600/50 p-4"><h3 className="font-bold">지급된 보스 보상</h3>{view.rewardReceipts.map(receipt => <p key={receipt.slot}>{receipt.slot === 'hiddenBoss' ? '히든 보스' : receipt.slot === 'finalBoss' ? '최종 보스' : `${receipt.slot.replace('boss', '')}번째 보스`} · {receipt.firstClear ? '첫 클리어' : '반복 클리어'} · {rewardText(receipt.reward)}</p>)}</section>}
        {!!run.relicIds.length && <section className="space-y-2"><h3 className="font-bold">보유 유물</h3>{run.relicIds.map(id => <p className="break-words text-sm leading-6 text-neutral-400" key={id}>{view.relics?.find(r => r.id === id)?.name ?? id} · {view.relics?.find(r => r.id === id)?.description}</p>)}</section>}
        {!run.ended && run.phase !== 'DIALOGUE' && <button className={`${button} text-neutral-400`} disabled={busy} onClick={() => { if (window.confirm('이 도전을 종료할까요? 덱과 기록은 보존됩니다.')) command({ type: 'ABANDON' }); }}>도전 종료</button>}
      </>}
    </div>
  </main>;
}

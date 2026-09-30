import { useEffect, useRef } from 'react';
import { audioManager } from '@/audio/audio-manager';
import type { GameMediaItem } from '@/game/media';
import type { TowerMusicTrack } from '../../../../lib/game-engine/src/tower/types';

export function TowerMusicEditor({ label, value, tracks, onChange }: { label: string; value?: TowerMusicTrack; tracks: GameMediaItem[]; onChange: (track: TowerMusicTrack | undefined) => void }) {
  const previewed = useRef(false);
  useEffect(() => () => { if (previewed.current) audioManager.stopBgm(); }, []);
  return <fieldset className="min-w-0 space-y-3 rounded border border-neutral-700 p-3"><legend>{label}</legend>
    <label className="block">음악<select className="min-h-12 w-full min-w-0 rounded border border-neutral-600 bg-neutral-950 p-3" value={value?.assetUrl ?? ''} onChange={event => {
      const selected = tracks.find(track => track.assetUrl === event.target.value);
      onChange(selected ? { name: selected.name, assetUrl: selected.assetUrl, volume: selected.volume } : undefined);
    }}><option value="">지정 안함 · 음악 없음</option>{value && !tracks.some(track => track.assetUrl === value.assetUrl) && <option value={value.assetUrl}>{value.name} · 저장된 음악</option>}{tracks.map(track => <option key={track.id} value={track.assetUrl}>{track.name}</option>)}</select></label>
    {value && <><label className="block">트랙 음량 · {value.volume}%<input className="min-h-11 w-full" aria-label={`${label} 음량`} type="range" min={0} max={100} value={value.volume} onChange={event => onChange({ ...value, volume: Number(event.target.value) })} /></label><div className="flex flex-wrap gap-2"><button type="button" className="min-h-12 rounded border border-neutral-600 px-4" onClick={() => { previewed.current = true; audioManager.unlockAudio(); audioManager.previewBgm(value.assetUrl, value.volume); }}>OST 미리 듣기</button><button type="button" className="min-h-12 rounded border border-neutral-600 px-4" onClick={() => { if (previewed.current) audioManager.stopBgm(); previewed.current = false; }}>듣기 중지</button></div></>}
    {!tracks.length && <p className="text-sm text-amber-300">게임 미디어 관리에서 BGM을 등록하면 여기서 선택할 수 있습니다.</p>}
    <p className="text-xs text-neutral-400">게임의 음악 음소거·전체 음량 설정도 적용됩니다.</p>
  </fieldset>;
}

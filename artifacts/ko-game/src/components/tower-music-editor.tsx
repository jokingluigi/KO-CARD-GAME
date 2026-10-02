import { useEffect, useRef, useState } from 'react';
import { audioManager } from '@/audio/audio-manager';
import { uploadTowerMusic } from '@/lib/tower-music-upload';
import type { TowerMusicTrack } from '../../../../lib/game-engine/src/tower/types';
export function TowerMusicEditor({label,value,onChange,onUploadingChange}:{label:string;value?:TowerMusicTrack;onChange:(track:TowerMusicTrack|undefined)=>void;onUploadingChange?:(busy:boolean)=>void}){
 const previewed=useRef(false);const [uploading,setUploading]=useState(false);const [error,setError]=useState('');
 useEffect(()=>()=>{if(previewed.current)audioManager.stopBgm();},[]);
 async function attach(file:File){setUploading(true);onUploadingChange?.(true);setError('');try{const track=await uploadTowerMusic(file,`${import.meta.env.BASE_URL.replace(/\/$/,'')}/api/admin`);if(previewed.current)audioManager.stopBgm();previewed.current=false;onChange({...track,volume:value?.volume??100});}catch(e){setError(e instanceof Error?e.message:'음악 업로드 실패');}finally{setUploading(false);onUploadingChange?.(false);}}
 return <fieldset disabled={uploading} className="min-w-0 space-y-3 rounded border border-neutral-700 p-3"><legend>{label}</legend>
  <label className="block text-sm">음악 파일 첨부<input aria-label={`${label} 음악 파일 첨부`} type="file" accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav" className="mt-2 block min-h-12 w-full min-w-0 text-sm" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void attach(file);}}/></label>
  <p className="break-all text-sm text-amber-200">{uploading?'음악 파일 업로드 중…':value?`첨부된 음악: ${value.name}`:'첨부된 음악 없음'}</p>
  {value&&<><label className="block">음량 · {value.volume}%<input aria-label={`${label} 음량`} type="range" min={0} max={100} value={value.volume} className="min-h-11 w-full" onChange={event=>onChange({...value,volume:Number(event.target.value)})}/></label><div className="flex flex-wrap gap-2"><button type="button" className="min-h-12 rounded border px-4" onClick={()=>{previewed.current=true;audioManager.unlockAudio();audioManager.previewBgm(value.assetUrl,value.volume);}}>OST 미리 듣기</button><button type="button" className="min-h-12 rounded border px-4" onClick={()=>{if(previewed.current)audioManager.stopBgm();previewed.current=false;}}>듣기 중지</button><button type="button" className="min-h-12 rounded border px-4" onClick={()=>{if(previewed.current)audioManager.stopBgm();previewed.current=false;onChange(undefined);}}>첨부 해제</button></div></>}
  {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}<p className="text-xs text-neutral-400">MP3·OGG·WAV · 최대 20MB. 업로드 후 설정을 저장하면 적용됩니다. 게임의 음악 음소거·전체 음량 설정도 적용됩니다.</p>
 </fieldset>;
}

import type { TowerMusicTrack } from '../../../../lib/game-engine/src/tower/types';
/** Persist an uploaded attachment without enabling it in other game music pools. */
export async function uploadTowerMusic(file: File, apiBase: string, request: typeof fetch = fetch): Promise<TowerMusicTrack> {
 const extension=file.name.toLowerCase().split('.').pop();
 if(!['mp3','ogg','wav'].includes(extension??''))throw new Error('MP3, OGG, WAV 파일만 첨부할 수 있습니다.');
 if(!file.size||file.size>20*1024*1024)throw new Error('음악 파일은 20MB 이하로 첨부해 주세요.');
 const contentType=file.type||({mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav'}[extension!]!);
 const name=file.name.slice(0,120);
 async function json(path:string,body:unknown){const response=await request(`${apiBase}${path}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.message??'음악 파일을 저장하지 못했습니다.');}return response.json();}
 const info=await json('/game-media/uploads/request-url',{mediaType:'BGM',name,size:file.size,contentType});
 const sent=await request(info.uploadURL,{method:'PUT',headers:{'Content-Type':info.contentType},body:file});if(!sent.ok)throw new Error('음악 파일 업로드에 실패했습니다.');
 const completed=await json('/game-media/uploads/complete',{mediaType:'BGM',objectPath:info.objectPath,contentType:info.contentType});
 try{await json('/game-media',{mediaType:'BGM',name,assetId:completed.assetId,assetUrl:completed.assetUrl,fileName:file.name,contentType:info.contentType,width:null,height:null,volume:100,gameEnabled:false,titleEnabled:false,uploadToken:completed.uploadToken});}
 catch(error){await json('/game-media/uploads/discard',{mediaType:'BGM',assetId:completed.assetId,uploadToken:completed.uploadToken}).catch(()=>{});throw error;}
 return {name,assetUrl:completed.assetUrl,volume:100};
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadTowerMusic } from './tower-music-upload';
test('Tower attachment persists its audio without joining other BGM pools',async()=>{
 const calls:Array<{url:string;body?:any}>=[];
 const request=(async(url:any,init:any)=>{calls.push({url:String(url),body:typeof init.body==='string'?JSON.parse(init.body):undefined});const payload=String(url).endsWith('request-url')?{uploadURL:'https://upload.invalid/audio',objectPath:'/bgm/qa.mp3',contentType:'audio/mpeg'}:String(url).endsWith('complete')?{assetId:'/bgm/qa.mp3',assetUrl:'/api/storage/bgm/qa.mp3',uploadToken:'signed'}:{};return new Response(JSON.stringify(payload),{status:200});}) as typeof fetch;
 const result=await uploadTowerMusic(new File(['audio'],'qa.mp3',{type:'audio/mpeg'}),'/api/admin',request);
 assert.equal(result.assetUrl,'/api/storage/bgm/qa.mp3');assert.equal(calls.length,4);assert.equal(calls[3].body.gameEnabled,false);assert.equal(calls[3].body.titleEnabled,false);assert.equal(calls[3].body.uploadToken,'signed');
});
test('Tower attachments reject unsupported and empty files before upload',async()=>{
 const request=(async()=>{throw new Error('unexpected network');}) as typeof fetch;
 await assert.rejects(uploadTowerMusic(new File(['a'],'qa.exe'),'/api/admin',request),/MP3/);
 await assert.rejects(uploadTowerMusic(new File([],'qa.mp3'),'/api/admin',request),/20MB/);
});

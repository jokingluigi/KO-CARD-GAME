/** Local actual audio playback capture; no synthesized or post-added impact audio. */
import {chromium} from './black-gold-playwright.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa-results/external-assets';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:out,size:{width:390,height:844}}});
const page=await context.newPage();
try{
 await page.goto('http://127.0.0.1:5186/qa/cinematic.html');
 await page.getByTestId('attack').waitFor();
 await page.evaluate(async()=>{
  const ctx=new AudioContext();await ctx.resume();const dest=ctx.createMediaStreamDestination();
  const sources=new WeakMap();const original=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){if(!sources.has(this)){const s=ctx.createMediaElementSource(this);s.connect(dest);s.connect(ctx.destination);sources.set(this,s);}return original.call(this);};
  const chunks=[];const recorder=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'});
  recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  window.capture={ctx,recorder,chunks};
 });
 for(const action of ['attack','blocked','finisher']){await page.getByTestId(action).click();await page.waitForTimeout(1100);}
 const bytes=await page.evaluate(()=>new Promise(resolve=>{const c=window.capture;c.recorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(c.chunks).arrayBuffer())));c.recorder.stop();}));
 await writeFile(out+'/browser-audio.webm',Buffer.from(bytes));
 const video=page.video();await context.close();await video.saveAs(out+'/browser-video.webm');
 console.log('Captured actual browser media-element playback; mux alignment is not calibrated.');
}finally{await browser.close();}

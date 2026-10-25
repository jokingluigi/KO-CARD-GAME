import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareIntroPortraits} from './match-assets';
test('selected pair waits for downloads; duplicates and absent URLs do not add work',async()=>{
 const previous=globalThis.Image;const requested:string[]=[];let loaded=0;
 class ImageMock {complete=false;naturalWidth=0;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;set src(value:string){requested.push(value);setTimeout(()=>{loaded++;this.onload?.();},15);}}
 Object.defineProperty(globalThis,'Image',{configurable:true,value:ImageMock});
 try{await prepareIntroPortraits(['/a.png','/b.png','/a.png',null],100);assert.equal(loaded,2);assert.deepEqual(requested,['/a.png','/b.png']);}
 finally{Object.defineProperty(globalThis,'Image',{configurable:true,value:previous});}
});
test('a stalled image cannot indefinitely block an opening',async()=>{
 const previous=globalThis.Image;class ImageMock {complete=false;naturalWidth=0;set src(_value:string){}}
 Object.defineProperty(globalThis,'Image',{configurable:true,value:ImageMock});
 try{await prepareIntroPortraits(['/never.png'],15);}
 finally{Object.defineProperty(globalThis,'Image',{configurable:true,value:previous});}
});

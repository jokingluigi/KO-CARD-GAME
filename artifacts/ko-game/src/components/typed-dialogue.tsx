import {useEffect,useState} from 'react';
import {prefersReducedMotion} from './presentation-config';
export function TypedDialogue({text}:{text:string}){
 const [count,setCount]=useState(()=>prefersReducedMotion()?text.length:0);
 useEffect(()=>{if(prefersReducedMotion()){setCount(text.length);return;}setCount(0);let frame=0;const begin=performance.now();const tick=(now:number)=>{const progress=Math.min(1,(now-begin)/Math.min(450,Math.max(80,text.length*12)));setCount(Math.ceil(text.length*progress));if(progress<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[text]);
 return <span aria-label={text}><span aria-hidden="true">{text.slice(0,count)}</span></span>;
}

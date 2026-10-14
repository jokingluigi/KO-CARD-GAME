import {useEffect,useRef,type CSSProperties} from 'react';
import {prefersReducedMotion} from './presentation-config';
export type ZoneFlight={id:string;fromX:number;fromY:number;toX:number;toY:number;kind:'BOARD'|'GRAVEYARD'|'HAND';image?:string;delay:number};
export function ZoneTransfer({flight}:{flight:ZoneFlight}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!ref.current||prefersReducedMotion())return;let animation:Animation|undefined;try{animation=ref.current.animate([{transform:'translate('+flight.fromX+'px,'+flight.fromY+'px) rotate(-8deg)',opacity:0},{offset:.12,opacity:1},{offset:.5,transform:'translate('+((flight.fromX+flight.toX)/2)+'px,'+((flight.fromY+flight.toY)/2-35)+'px) rotate(5deg)'},{transform:'translate('+flight.toX+'px,'+flight.toY+'px)',opacity:0}],{duration:400,delay:flight.delay,easing:'cubic-bezier(.2,.7,.3,1)',fill:'both'});}catch{}return()=>animation?.cancel();},[flight.id]);
 return <div ref={ref} aria-hidden="true" data-zone-transfer={flight.kind} className={'ko-zone-flight ko-zone-flight--'+flight.kind.toLowerCase()} style={{backgroundImage:flight.image?'url("'+flight.image+'")':undefined,'--zone-delay':flight.delay+'ms'} as CSSProperties}>{!flight.image&&<span>KO</span>}</div>;
}

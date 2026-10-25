import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../src/index.css';
import {MatchIntroOverlay, type MatchIntroPlayer} from '../src/components/online-match-intro';
function Scene() {
 const [player,setPlayer]=useState<MatchIntroPlayer>({displayName:'P',championName:'챔피언',portraitUrl:'/broken.png',originalPortraitUrl:null,dialogueLine:'기존 대사 테스트'});
 const [start]=useState(Date.now());const [skip,setSkip]=useState(false);
 (window as any).updatePortrait=(value:Partial<MatchIntroPlayer>)=>setPlayer(p=>({...p,...value}));
 return skip?<output>mulligan boundary</output>:<MatchIntroOverlay self={player} opponent={{...player,portraitUrl:'/original.svg'}} firstSpeaker="self" startedAt={start} gameplayStartsAt={start+4500} onSkipRequest={()=>setSkip(true)}/>;
}
createRoot(document.getElementById('root')!).render(<Scene/>);

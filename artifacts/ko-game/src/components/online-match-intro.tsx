import {prefersReducedMotion} from "./presentation-config";
import type {CosmeticDisplaySettings} from "@workspace/cosmetics";
import { cachedPortrait, loadPortrait } from '../game/portrait-loading';
import { useEffect, useMemo, useState, useRef, useLayoutEffect, type CSSProperties } from "react";

import styles from "./online-match-intro.module.css";

export interface MatchIntroPlayer {
  displayName: string;
  championName: string;
  portraitUrl: string | null;
  portraitSettings?:CosmeticDisplaySettings;
  originalPortraitUrl?:string|null;
  dialogueLine: string | null;
}

export interface MatchIntroOverlayProps {
  self: MatchIntroPlayer;
  opponent: MatchIntroPlayer;
  firstSpeaker: "self" | "opponent" | null;
  startedAt: number;
  gameplayStartsAt: number;
  onSkipRequest: () => void;
  matchLabel?: string;
}

type Speaker = "self" | "opponent";

interface DialogueTurn {
  speaker: Speaker;
  line: string;
  startAt: number;
}

interface PortraitProps {
  player: MatchIntroPlayer;
  side: Speaker;
}

function Portrait({ player, side }: PortraitProps) {
  const [ready, setReady] = useState<Record<string,string>>({});
  useEffect(() => {
    let active = true;
    // Load independently: an unavailable skin must never hold the original hostage.
    for (const url of new Set([player.portraitUrl, player.originalPortraitUrl].filter((v):v is string=>Boolean(v)))) {
      void loadPortrait(url).then(src => { if(active && src) setReady(current=>({...current,[url]:src})); });
    }
    return () => { active = false; };
  }, [player.portraitUrl, player.originalPortraitUrl]);
  const portraitUrl = [player.portraitUrl, player.originalPortraitUrl]
    .filter((url):url is string=>Boolean(url)).map(url=>ready[url]??cachedPortrait(url)).find(Boolean);

  return (
    <div className={styles.portraitWrap} data-testid={`portrait-${side}`}>
      <div className={styles.portraitFrame}>
        <span className={styles.portraitFallback} aria-hidden="true">
          {portraitUrl ? '' : <small role="status">초상화 불러오는 중…</small>}
        </span>
        {portraitUrl ? (
          <img
            className={styles.portraitImage}
            key={portraitUrl}
            src={portraitUrl}
            style={portraitUrl===player.portraitUrl && player.portraitSettings ? {
              objectFit:player.portraitSettings.imageDisplayMode==='CONTAIN'?'contain':'cover',
              objectPosition:`${player.portraitSettings.imagePositionX}% ${player.portraitSettings.imagePositionY}%`,
              transform:`scale(${player.portraitSettings.imageScale})`,transformOrigin:`${player.portraitSettings.imagePositionX}% ${player.portraitSettings.imagePositionY}%`,
            }:undefined}
            alt={`${player.championName} portrait`}
            data-testid={`img-champion-portrait-${side}`}
            decoding="async"
            fetchPriority="high"
          />
        ) : null}
        <svg className={styles.portraitOutline} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 0H7L0 7ZM93 0H100V7ZM100 93V100H93ZM7 100H0V93Z" />
          <polygon points="7,0 93,0 100,7 100,93 93,100 7,100 0,93 0,7" />
        </svg>
      </div>
    </div>
  );
}

function IdentityBlock({ player, side }: PortraitProps) {
  return (
    <div className={styles.identity} data-testid={`identity-${side}`}>
      <span className={styles.role}>{side === "self" ? "PLAYER ONE" : "PLAYER TWO"}</span>
      <span className={styles.displayName} data-testid={`text-display-name-${side}`}>
        {player.displayName}
      </span>
      <span className={styles.championName} data-testid={`text-champion-name-${side}`}>
        {player.championName}
      </span>
    </div>
  );
}

function DialogueBlock({
  player,
  side,
  visible,
}: PortraitProps & { visible: boolean }) {
  const line = player.dialogueLine?.trim();
  if (!line) return null;

  return (
    <div
      className={styles.dialogue}
      data-visible={visible}
      data-testid={`dialogue-${side}`}
      aria-live="polite"
    >
      <span className={styles.dialogueLabel}>{player.championName}</span>
      <span className={styles.dialogueText}>「{line}」</span>
    </div>
  );
}

export function MatchIntroOverlay({
  self,
  opponent,
  firstSpeaker,
  startedAt,
  gameplayStartsAt,
  onSkipRequest,
  matchLabel = "ONLINE MATCH",
}: MatchIntroOverlayProps) {
  const [now, setNow] = useState(() => Date.now());
  const introRoot=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>()=>{
    if(prefersReducedMotion() || Date.now()-startedAt<800)return;
    for(const side of ['self','opponent'] as Speaker[]){
      const source=introRoot.current?.querySelector<HTMLElement>(`[data-testid="portrait-${side}"]`);
      const target=document.querySelector(side==='self'?'.ko-player-champion .ko-portrait-window':'.ko-opponent-champion .ko-portrait-window');if(!source||!target)continue;
      const a=source.getBoundingClientRect(),r=target.getBoundingClientRect();if(!r.width||!a.width)continue;
      const g=source.cloneNode(true) as HTMLElement;
      g.removeAttribute('data-testid');g.inert=true;g.setAttribute('aria-hidden','true');g.dataset.introHandoff=side;
      Object.assign(g.style,{position:'fixed',left:a.x+'px',top:a.y+'px',width:a.width+'px',height:a.height+'px',margin:'0',zIndex:'215',pointerEvents:'none',transformOrigin:'0 0',animation:'none',visibility:'visible',display:'block',transform:'none'});
      document.body.appendChild(g);const ratio=Math.min(r.width/a.width,r.height/a.height);
      try{g.animate([{translate:'0px 0px',scale:'1',opacity:1},{translate:`${r.x+(r.width-a.width*ratio)/2-a.x}px ${r.y+(r.height-a.height*ratio)/2-a.y}px`,scale:String(ratio),opacity:0}],{duration:280,easing:'cubic-bezier(.2,.7,.3,1)'}).finished.catch(()=>{}).finally(()=>g.remove());}catch{g.remove();}
    }
  },[startedAt]);

  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    updateClock();
    const intervalId = window.setInterval(updateClock, 50);
    return () => window.clearInterval(intervalId);
  }, [startedAt, gameplayStartsAt]);

  const elapsed = Math.max(0, now - startedAt);
  const introDuration = Math.max(
    3000,
    Math.min(4200, gameplayStartsAt > startedAt ? gameplayStartsAt - startedAt : 3600),
  );

  const turns = useMemo<DialogueTurn[]>(() => {
    const speakerOrder: Speaker[] = firstSpeaker === "self"
      ? ["self", "opponent"]
      : ["opponent", "self"];
    const players = { self, opponent };
    const availableTurns = speakerOrder
      .map((speaker) => ({
        speaker,
        line: players[speaker].dialogueLine?.trim() ?? "",
      }))
      .filter((turn): turn is { speaker: Speaker; line: string } => Boolean(turn.line));

    return availableTurns.map((turn, index) => ({
      ...turn,
      startAt: index === 0 ? 1000 : 1700,
    }));
  }, [firstSpeaker, opponent, self]);

  const versusAt = turns.length === 2 ? 2600 : turns.length === 1 ? 2050 : 1450;
  const activeSpeaker = turns.reduce<Speaker | null>((active, turn) => (
    elapsed >= turn.startAt && elapsed < versusAt ? turn.speaker : active
  ), null);
  const skipAvailable = elapsed >= 900;
  const sceneStyle = {
    "--intro-duration": `${introDuration}ms`,
    "--intro-elapsed": `${elapsed}ms`,
    "--versus-at": `${versusAt}ms`,
  } as CSSProperties;

  return (
    <div
      ref={introRoot}
      className={styles.overlay}
      style={sceneStyle}
      role="dialog"
      aria-label={matchLabel === "ONLINE MATCH" ? "Online match introduction" : `${matchLabel} introduction`}
      data-testid="match-intro-overlay"
      data-intro-phase={elapsed >= versusAt ? "versus" : activeSpeaker ?? "entrance"}
    >
      <main className={styles.scene}>
        <div className={styles.sceneHeader} aria-hidden="true">
          {matchLabel}
        </div>

        <section
          className={styles.player}
          data-side="self"
          data-active={activeSpeaker === null || activeSpeaker === "self"}
          aria-label={`Your champion: ${self.championName}`}
        >
          <Portrait player={self} side="self" />
          <IdentityBlock player={self} side="self" />
          <DialogueBlock player={self} side="self" visible={turns.some((turn) => turn.speaker === "self" && elapsed >= turn.startAt)} />
        </section>

        <div className={styles.versusColumn} aria-hidden="true">
          <div className={styles.impactFlash} />
          <div className={styles.versus} data-testid="text-versus">
            VS
          </div>
        </div>

        <section
          className={styles.player}
          data-side="opponent"
          data-active={activeSpeaker === null || activeSpeaker === "opponent"}
          aria-label={`Opponent champion: ${opponent.championName}`}
        >
          <Portrait player={opponent} side="opponent" />
          <IdentityBlock player={opponent} side="opponent" />
          <DialogueBlock player={opponent} side="opponent" visible={turns.some((turn) => turn.speaker === "opponent" && elapsed >= turn.startAt)} />
        </section>

        {skipAvailable ? (
          <button
            className={styles.skipButton}
            type="button"
            onClick={onSkipRequest}
            data-testid="button-skip-match-intro"
            aria-label="Skip match introduction"
          >
            SKIP
          </button>
        ) : null}
      </main>
    </div>
  );
}

import {boundPortraitFrames} from "./motion/battle-motion-bounds";
import './battle-atmosphere.css';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import type { SpriteMotionSettings, SpriteEvent } from "@workspace/cosmetics";
import { createPortal } from "react-dom";
import {
  normalizeImageDisplaySettings,
  type ImageDisplaySettings,
} from "../game/cards/types";
import { readCombatPreferences, impactMultiplier } from "./combat-preferences";
import { prefersReducedMotion } from "./presentation-config";
import { useScreenImpact } from "./screen-impact";
import { damageImpact } from "./screen-impact-policy";

import {
  CHAMPION_MOTION,
  motionFrames,
  motionDuration,
  type ChampionMotionCue,
  resolveMotion,
  expressionLead,
} from "./champion-sprite-motion";
import "./champion-sprite-visual.css";
import { spawnAbilityFlare, spawnHealGlow } from "./battle-moments";
import { audioManager } from "../audio/audio-manager";
import { spawnArrivalBlast } from "./card-arrival";
import { spawnImpactBurst } from "./impact-burst";
import { auraStyle, hitSilhouette, idleFidget, landingThud, speakBounce, turnLean } from "./champion-life";
export function ChampionSpriteVisual({
  children,
  cue,
  state = "IDLE",
  self,
  identity,
  reacting = false,
  image,
  display,
  accent = "#b99a60",
  origin,
  viewerPlayerId,
  playerId,
  preview = false,
  motion,
  setIdentity,
  waiting = false,
}: {
  waiting?: boolean;
  children: ReactNode;
  cue?: ChampionMotionCue;
  state?: string;
  self: boolean;
  identity: string;
  reacting?: boolean;
  image?: string;
  display?: Partial<ImageDisplaySettings>;
  accent?: string;
  origin?: { x: number; y: number };
  viewerPlayerId?: string;
  playerId?: string;
  preview?: boolean;
  motion?: SpriteMotionSettings;
  setIdentity?: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    body = useRef<HTMLDivElement>(null),
    ink = useRef<HTMLDivElement>(null),
    sheen = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(220);
  const [centered, setCentered] = useState(false),
    [motionFloor, setMotionFloor] = useState(0.35);
  const continuity = useRef<{
    identity: string;
    set?: string;
    transform: string;
    filter: string;
  } | null>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    // 잔렉 방지: 크기 감시기가 이미 알려주는 높이를 쓰고, 다시 재지 않는다.
    let lastHeight = -1;
    const update = (measured?: number) => {
      if (!host.current) return;
      const height = measured ?? host.current.getBoundingClientRect().height;
      if (Math.abs(height - lastHeight) < 0.5) return;
      lastHeight = height;
      setHeight(height);
      const css = getComputedStyle(host.current);
      setCentered(
        css.getPropertyValue("--sprite-battle-axis").trim() === "vertical",
      );
      setMotionFloor(
        Number(css.getPropertyValue("--sprite-motion-floor")) || 0.35,
      );
    };
    update();
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.borderBoxSize?.[0];
      update(box ? box.blockSize : entries[entries.length - 1]?.contentRect.height);
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const motionKey = JSON.stringify(motion ?? {});
  const profile = resolveMotion(motion);
  const motionAmount=readCombatPreferences().spriteMotion;
  const phase =
    Array.from(identity).reduce(
      (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
      self ? 17 : 79,
    ) % 5000;
  const played = useRef<string | undefined>(undefined);
  const [reduced, setReduced] = useState(prefersReducedMotion),
    [moving, setMoving] = useState(false),
    [link, setLink] = useState<{
      x: number;
      y: number;
      length: number;
      angle: number;
    } | null>(null);
  const screen = useScreenImpact();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const update = () => {
      setReduced(prefersReducedMotion());
      setRevision((x) => x + 1);
    };
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("ko-combat-preferences", update);
    media.addEventListener("change", update);
    return () => {
      window.removeEventListener("ko-combat-preferences", update);
      media.removeEventListener("change", update);
    };
  }, []);
  useLayoutEffect(() => {
    setMoving(false);
    setLink(null);
    if (!cue || played.current === cue.id || !body.current) {
      continuity.current = null;
      return;
    }
    played.current = cue.id;
    if (document.hidden) return;
    const node = body.current,
      anchor = host.current!,
      rect = anchor.getBoundingClientRect(),
      motions: Animation[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      motions.forEach((a) => a.cancel());
      setMoving(false);
      setLink(null);
    };
    const scene = document.querySelector(".ko-game-shell");
    const target = (owner: string, slot?: number) => {
      const side = owner === viewerPlayerId ? "player" : "opponent";
      return slot !== undefined
        ? scene?.querySelectorAll<HTMLElement>(
            `.ko-${side}-board-row .ko-board-slot`,
          )[slot]
        : scene?.querySelector<HTMLElement>(
            `.ko-${side}-champion .ko-portrait-window`,
          );
    };
    const center = (n: Element) => {
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const point = {
      x: rect.left + (rect.width * (origin?.x ?? (self ? 75 : 25))) / 100,
      y: rect.top + (rect.height * (origin?.y ?? 58)) / 100,
    };
    const source = cue.sourcePlayerId
      ? target(cue.sourcePlayerId, cue.sourceSlot)
      : undefined;
    const c = source ? center(source) : null,
      at = center(anchor),
      length = c ? Math.hypot(at.x - c.x, at.y - c.y) : 0;
    const direction =
      c && length > 1
        ? { x: (at.x - c.x) / length, y: (at.y - c.y) / length }
        : undefined;
    const aim=cue.target ? target(cue.target.playerId,cue.target.slot) : null;
    const aimed=aim ? center(aim) : null;
    const aimLength=aimed?Math.hypot(aimed.x-at.x,aimed.y-at.y):0;
    const gestureDirection=aimed&&aimLength>1?{x:(aimed.x-at.x)/aimLength,y:(aimed.y-at.y)/aimLength}:direction;
    const preferences = readCombatPreferences(),
      intensity = impactMultiplier(preferences.intensity),
      decorated = preferences.quality !== "LOW",
      duration = reduced
        ? Math.min(180, motionDuration(cue.kind, motion))
        : motionDuration(cue.kind, motion);
    const animate = (
      n: HTMLElement | null,
      frames: Keyframe[],
      ms = duration,
    ) => {
      if (n?.animate)
        try {
          const a = n.animate(frames, { duration: ms, easing: "linear" });
          motions.push(a);
        } catch {}
    };
    setMoving(true);
    const css = getComputedStyle(anchor);
    const vertical =
      css.getPropertyValue("--sprite-battle-axis").trim() === "vertical";
    const minimum =
      Number(css.getPropertyValue("--sprite-motion-floor")) || 0.35;
    const frames = boundPortraitFrames(motionFrames(
      cue,
      self,
      Math.max(minimum, Math.min(1, rect.height / 220)),
      intensity * readCombatPreferences().spriteMotion,
      reduced,
      gestureDirection,
      motion,
      vertical,
    ),rect,{width:innerWidth,height:innerHeight});
    const saved = continuity.current;
    if (saved?.identity === identity && saved.set === setIdentity) {
      frames[0] = {
        ...frames[0],
        transform: saved.transform,
        filter: saved.filter,
      };
    }
    continuity.current = null;
    // 공격할 때 챔피언 몸은 움직이지 않는다 (표정만 바뀜).
    const still = cue.kind === "SPELL" || cue.kind === "WRESTLER_ATTACK";
    if (!still) animate(node, frames);
    const emphasized = [
      "TURN",
      "ABILITY",
      "LEGENDARY_SUMMON",
      "AWAKEN",
      "HEAVY_HIT",
    ].includes(cue.kind);
    if (emphasized && decorated)
      animate(ink.current, [
        { opacity: 0, transform: "scale(.85)" },
        { opacity: reduced ? 0.15 : 0.45, transform: "scale(1)", offset: 0.3 },
        { opacity:.09, transform:"scale(1.04)", offset:.72 },
        { opacity: 0, transform: "scale(1.08)", offset:1 },
      ]);
    if (cue.kind === "HEAL")
      animate(sheen.current, [
        { opacity: 0, maskPosition: "0% 100%" },
        { opacity: reduced ? 0.12 : 0.3, maskPosition: "0% 50%", offset: 0.45 },
        { opacity: 0, maskPosition: "0% 0%" },
      ]);
    if (!preview && !reduced && decorated) {
      // Hearthstone-style moments on the champion sprite itself.
      if (cue.kind === "ABILITY") { spawnAbilityFlare(null, at, rect.height * .75); audioManager.playImpactOverlay(import.meta.env.BASE_URL + "sfx/ability-cast.wav", 44, 6); }
      if (cue.kind === "HEAL") spawnHealGlow({ x: at.x, y: at.y, size: Math.max(90, rect.height * .7) });
      if (cue.kind === "AWAKEN") { spawnArrivalBlast({ x: at.x, y: at.y, width: rect.width * .8, height: rect.height * .8, kind: "LEGENDARY" }); }
      // 29. 이모트: 챔피언이 앞으로 살짝 튀어나왔다 돌아간다
      // 6·7·12·19: 잔상 돌진, 무게 실린 착지, 피격 실루엣, 턴 시작 다가오기
      if (["ABILITY", "LEGENDARY_SUMMON", "AWAKEN"].includes(cue.kind)) landingThud(anchor);
      if (cue.kind === "TURN") turnLean(anchor);
      if (cue.kind === "EMOTE") animate(anchor, [{ scale: "1", filter: "brightness(1)" }, { scale: "1.08", filter: "brightness(1.18)", offset: .22 }, { scale: ".98", offset: .55 }, { scale: "1", filter: "brightness(1)" }], 560);
      if ((cue.kind === "HIT" || cue.kind === "HEAVY_HIT") && !cue.basicAttack) {
        const damage = cue.damage ?? (cue.kind === "HEAVY_HIT" ? 5 : 1);
        spawnImpactBurst({ x: at.x, y: at.y, dx: direction?.x ?? 0, dy: direction?.y ?? 1, damage, crackAt: { x: at.x, y: rect.bottom - 10 } });
      }
      if (cue.kind === "HIT" || cue.kind === "HEAVY_HIT") hitSilhouette(anchor, cue.kind === "HEAVY_HIT");
      if (cue.kind === "HIT" || cue.kind === "HEAVY_HIT")
        animate(anchor, [{ filter: "brightness(1)" }, { filter: "brightness(2.4) saturate(.4)", offset: .08 }, { filter: "brightness(1.3) sepia(.4) hue-rotate(-30deg) saturate(2)", offset: .2 }, { filter: "brightness(1)" }], Math.min(duration, cue.kind === "HEAVY_HIT" ? 420 : 280));
    }
    if (!preview && !reduced) {
      if (
        (cue.kind === "HIT" || cue.kind === "HEAVY_HIT") &&
        !cue.basicAttack
      ) {
        if (decorated)
          {}
        screen.request({
          id: "sprite:" + cue.id,
          profile: damageImpact(
            cue.damage ?? (cue.kind === "HEAVY_HIT" ? 5 : 1),
          ),
          x: at.x,
          y: at.y,
          direction,
        });
      }
      const destination = cue.target
        ? target(cue.target.playerId, cue.target.slot)
        : cue.kind === "LEGENDARY_SUMMON" &&
            cue.targetSlot !== undefined &&
            playerId
          ? target(playerId, cue.targetSlot)
          : undefined;
      if (destination && !cue.support && decorated) {
        const end = center(destination),
          dx = end.x - point.x,
          dy = end.y - point.y;
        setLink({
          x: point.x,
          y: point.y,
          length: Math.hypot(dx, dy),
          angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        });
      }
    }
    timer = setTimeout(clear, duration);
    const hidden = () => {
      if (document.hidden) clear();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("resize", clear);
    return () => {
      if (timer) clearTimeout(timer);
      if (motions.some((a) => a.playState === "running") && node.isConnected) {
        const current = getComputedStyle(node);
        continuity.current = {
          identity,
          set: setIdentity,
          transform: current.transform,
          filter: current.filter,
        };
      } else continuity.current = null;
      motions.forEach((a) => a.cancel());
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("resize", clear);
    };
  }, [cue?.id, identity, setIdentity, reduced, revision, motionKey]);
  // 9. 상대 턴에 가끔 까딱 / 14. 말할 때 통통
  const movingRef = useRef(false);
  movingRef.current = moving;
  useEffect(() => {
    if (!waiting || preview || reduced) return;
    let timer = 0;
    const next = () => { timer = window.setTimeout(() => { if (!movingRef.current && !document.hidden) idleFidget(host.current, self); next(); }, 6000 + Math.random() * 5000); };
    next();
    return () => window.clearTimeout(timer);
  }, [waiting, preview, reduced, self]);
  useEffect(() => {
    if (preview || !playerId) return;
    const speak = (event: Event) => {
      const detail = (event as CustomEvent<{ playerId?: string; chars?: number }>).detail;
      if (detail?.playerId === playerId && !movingRef.current) speakBounce(host.current, detail.chars ?? 12);
    };
    window.addEventListener("ko-champion-speak", speak);
    return () => window.removeEventListener("ko-champion-speak", speak);
  }, [playerId, preview]);
  // Outcome poses also restore on reconnect without replaying an entrance.
  const settings = normalizeImageDisplaySettings(display, 3);
  const persistent =
    state === "VICTORY" || state === "DEFEAT"
      ? motionFrames(
          { id: "persistent", kind: state, event: state },
          self,
          Math.max(motionFloor, Math.min(1, height / 220)),
          impactMultiplier(readCombatPreferences().intensity) * motionAmount,
          reduced,
          undefined,
          motion,
          centered,
        ).at(-1)!
      : undefined;
  return (
    <div
      ref={host}
      className="ko-sprite-visual"
      data-state={state}
      data-motion-preset={profile.preset}
      data-motion-axis={centered ? "vertical" : "diagonal"}
      data-moving={moving}
      data-reacting={reacting}
      data-reduced={reduced}
      data-motion={moving ? cue?.kind : undefined}
      data-motion-id={moving ? cue?.id : undefined}
      data-self-damage={moving ? cue?.selfDamage : undefined}
      style={
        {
          "--sprite-accent": accent,
          "--sprite-facing": self ? 1 : -1,
          "--sprite-breath-ms":
            (CHAMPION_MOTION.breathMs + phase * 0.12) / profile.speed + "ms",
          "--sprite-low-breath-ms":
            (CHAMPION_MOTION.lowBreathMs + phase * 0.12) / profile.speed + "ms",
          "--sprite-breath-y":
            -(state === "LOW"
              ? CHAMPION_MOTION.lowBreathPx
              : CHAMPION_MOTION.breathPx) *
              Math.max(motionFloor, Math.min(1, height / 220)) *
              Math.min(1, profile.movement) * motionAmount +
            "px",
          "--sprite-breath-scale":
            1 +
            (state === "LOW" ? 0.006 : 0.012) * Math.min(1, profile.movement) * motionAmount,
          "--sprite-breath-phase": -phase + "ms",
          "--sprite-tremor-x":
            Math.min(3.8, Math.max(2.4, height * 0.018) * profile.movement * motionAmount) +
            "px",
          "--sprite-tremor-angle":
            Math.min(0.6, 0.45 * profile.rotation * motionAmount) + "deg",
          "--sprite-low-y":
            Math.min(4, height * 0.014) * profile.movement + "px",
          "--sprite-low-tilt": (self ? -0.25 : 0.25) * profile.rotation * motionAmount + "deg",
          "--sprite-pivot": `${profile.pivotX}% ${profile.pivotY}%`,
          "--sprite-result-transform": persistent?.transform ?? "none",
          "--sprite-result-filter": persistent?.filter ?? "none",
          "--sprite-low-brightness": CHAMPION_MOTION.lowBrightness,
          "--sprite-defeat-y": CHAMPION_MOTION.defeatY + "px",
          "--sprite-defeat-dim": CHAMPION_MOTION.defeatDim,
          "--sprite-victory-x":
            (self ? 1 : -1) * CHAMPION_MOTION.victoryX + "px",
          "--sprite-victory-y": CHAMPION_MOTION.victoryY + "px",
          "--sprite-victory-scale": CHAMPION_MOTION.victoryScale,
        } as CSSProperties
      }
    >


      {!preview && <div className="kj-sprite-aura" data-style={auraStyle(identity.split(":").slice(1).join(":") || identity)} aria-hidden="true"><i /><i /><i /><i /><i /></div>}
      <div className="ko-sprite-stance">
        <div className="ko-sprite-breath">
          <div className="ko-sprite-low-tremor">
            <div ref={body} className="ko-sprite-pose">
              {children}

            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

/** Expressions share the gesture's exertion phase; no gameplay is delayed. */
export function useMotionExpression(
  event: SpriteEvent,
  cue?: ChampionMotionCue,
  motion?: SpriteMotionSettings,
) {
  const [ready, setReady] = useState<string>();
  // 15. 공격·기술 직전 아주 잠깐 '놀람' 표정으로 기합을 넣는다
  const windup = cue?.kind === "SPELL" || cue?.kind === "ABILITY";
  const lead = prefersReducedMotion() ? 0 : expressionLead(cue?.kind, motion);
  const delay = windup && lead ? Math.max(lead, 110) : lead;
  useEffect(() => {
    if (!cue || !delay) return;
    const timer = setTimeout(() => setReady(cue.id), delay);
    return () => clearTimeout(timer);
  }, [cue?.id, delay]);
  return delay && ready !== cue?.id ? (windup ? ("ALLY_RETIRED" as const) : ("IDLE" as const)) : event;
}

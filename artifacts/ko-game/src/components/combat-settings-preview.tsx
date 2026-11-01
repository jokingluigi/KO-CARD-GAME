import { useEffect, useRef, useState } from "react";
import {externalSound} from "../audio/external-assets";
import { audioManager } from "../audio/audio-manager";
import { combatHitSound } from "../audio/combat-hit-sound";
import { combatImpactProfile } from "./combat-impact-profile";
import {
  combatCameraFrames,
  damageImpact,
  effectiveImpact,
} from "./screen-impact-policy";
import { useScreenImpact } from "./screen-impact";
import { BattleVfx } from "./battle-vfx";
import { impactMultiplier, type CombatPreferences } from "./combat-preferences";
import { prefersReducedMotion } from "./presentation-config";
/** Same contact clock/camera policy/assets/audio as battle, isolated from real input and state. */
export function CombatSettingsPreview({
  preferences,
}: {
  preferences: CombatPreferences;
}) {
  const root = useRef<HTMLDivElement>(null),
    source = useRef<HTMLSpanElement>(null),
    target = useRef<HTMLSpanElement>(null),
    flash = useRef<HTMLSpanElement>(null);
  const [damage, setDamage] = useState(7),
    [run, setRun] = useState(0),
    [hit, setHit] = useState<{ x: number; y: number; id: string } | null>(null),
    [playing, setPlaying] = useState(false);
  const playSound = useRef(false),
    { mode } = useScreenImpact();
  useEffect(() => {
    if (!run) return;
    let previewSound:HTMLAudioElement|null=null;
    const audible = playSound.current;
    playSound.current = false;
    const reduced = prefersReducedMotion(),
      clock = combatImpactProfile(damage, damage),
      motions: Animation[] = [];
    setPlaying(true);
    setHit(null);
    const animate = (
      node: HTMLElement | null,
      frames: Keyframe[],
      duration: number,
    ) => {
      if (node?.animate)
        motions.push(node.animate(frames, { duration, fill: "none" }));
    };
    animate(
      source.current,
      [
        { translate: "0px 0px" },
        { translate: reduced ? "0px 0px" : "-5px 0px", offset: 0.14 },
        {
          translate: reduced ? "0px 0px" : "62px 0px",
          offset: clock.contact / clock.duration,
        },
        {
          translate: reduced ? "0px 0px" : "62px 0px",
          offset: (clock.contact + clock.hitstop) / clock.duration,
        },
        { translate: "0px 0px" },
      ],
      clock.duration,
    );
    const contact = setTimeout(() => {
      const r = root.current?.getBoundingClientRect();
      if (!r) return;
      const profile = damageImpact(damage),
        m = impactMultiplier(preferences.intensity),
        effective = effectiveImpact(
          {
            ...profile,
            amplitude: profile.amplitude * m,
            wave: profile.wave * m,
          },
          { width: r.width, height: r.height },
          mode,
          reduced,
        );
      animate(
        root.current,
        combatCameraFrames(
          effective,
          { x: 1, y: 0 },
          mode === "REDUCED",
          reduced ? 0 : preferences.zoom,
        ),
        effective.duration,
      );
      animate(
        target.current,
        [
          { translate: "0px 0px" },
          {
            translate: reduced
              ? "0px 0px"
              : `${Math.min(15, damage * 1.2)}px 0px`,
            offset: 0.12,
          },
          { translate: "0px 0px" },
        ],
        effective.duration,
      );
      if (preferences.flash > 0)
        animate(
          flash.current,
          [
            { opacity: 0 },
            {
              opacity: 0.3 * preferences.flash * (reduced ? 0.2 : 1),
              offset: 0.1,
            },
            { opacity: 0 },
          ],
          100,
        );
      setHit({
        x: r.width * 0.73,
        y: r.height * 0.5,
        id: `settings-preview:${performance.now()}`,
      });
      if (audible) {
        const url = combatHitSound(damage);
        if(url){previewSound=new Audio(externalSound(url));previewSound.volume=Math.max(0,Math.min(1,.7*audioManager.getSfxVolume()/100));void previewSound.play().catch(()=>{});}
      }
    }, clock.contact);
    const end = setTimeout(() => {
      setPlaying(false);
      setHit(null);
    }, clock.duration + 450);
    return () => {
      clearTimeout(contact);
      clearTimeout(end);
      motions.forEach((a) => a.cancel());
      setHit(null);
      previewSound?.pause();
    };
  }, [run, damage, preferences, mode]);
  return (
    <section
      aria-label="전투 연출 미리보기"
      className="space-y-2 border border-neutral-700 p-2"
    >
      <p className="text-amber-200">현재 설정 미리보기</p>
      <div
        ref={root}
        className="relative flex h-24 items-center justify-around overflow-hidden bg-stone-900"
        data-testid="combat-settings-preview"
      >
        <span ref={source} className="border border-amber-700 bg-black p-2">
          공격
        </span>
        <span ref={target} className="border border-neutral-500 bg-black p-2">
          대상 {damage}
        </span>
        {hit && (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ transform: "translateZ(0)" }}
          >
            <BattleVfx
              kind="IMPACT"
              left={hit.x}
              top={hit.y}
              strength={damage}
              seed={hit.id}
            />
          </div>
        )}
        <span
          ref={flash}
          className="pointer-events-none absolute inset-0 bg-white opacity-0"
        />
      </div>
      <label className="flex min-h-11 items-center justify-between">
        시험 피해
        <select
          className="min-h-11 bg-black p-2"
          aria-label="미리보기 피해"
          value={damage}
          onChange={(e) => {
            playSound.current = false;
            setDamage(Number(e.target.value));
            setRun((n) => n + 1);
          }}
        >
          <option value="2">약공격 · 2</option>
          <option value="4">일반 · 4</option>
          <option value="7">강공격 · 7</option>
          <option value="12">초강력 · 12</option>
        </select>
      </label>
      <button
        type="button"
        className="min-h-11 w-full border border-amber-700 px-2"
        onClick={() => {
          playSound.current = true;
          setRun((n) => n + 1);
        }}
      >
        타격·소리 재생{playing ? " · 다시 재생" : ""}
      </button>
      <p className="text-neutral-400">
        설정 변경 시 화면만 다시 재생합니다. 소리는 버튼을 누를 때만 재생하며
        현재 효과음 음량을 따릅니다.
      </p>
    </section>
  );
}

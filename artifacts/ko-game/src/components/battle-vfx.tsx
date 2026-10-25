import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./presentation-config";
import {
  vfxBudget,
  vfxParticles,
  type BattleVfxKind,
} from "./battle-vfx-model";

const colors: Record<BattleVfxKind, [string, string]> = {
  IMPACT: ["#fff1cc", "#ff9854"],
  BLOCK: ["#d6f5ff", "#72b9e5"],
  HEAL: ["#ceffe2", "#4ee6ab"],
  MAGIC: ["#f0dbff", "#ae8aff"],
  GOLD: ["#fff5bd", "#edbd60"],
  DESTROY: ["#f0d6ff", "#a177dc"],
  RETIRE: ["#f7dfb9", "#b99472"],
};

/** Small local canvas, bounded particles and a single finite RAF; no full-screen render loop. */
export function BattleVfx({
  kind,
  left,
  top,
  strength = 3,
  seed,
  delay = 0,
  duration = 580,
  direction,
}: {
  kind: BattleVfxKind;
  left: number;
  top: number;
  strength?: number;
  seed: string;
  delay?: number;
  duration?: number;
  direction?: {x:number;y:number};
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const budget = vfxBudget(
      window.matchMedia?.("(pointer: coarse)").matches ?? false,
      false,
      strength,
    );
    const dpr = Math.min(window.devicePixelRatio || 1, budget.dpr);
    canvas.width = Math.round(budget.size * dpr);
    canvas.height = Math.round(budget.size * dpr);
    canvas.style.width = `${budget.size}px`;
    canvas.style.height = `${budget.size}px`;
    context.scale(dpr, dpr);
    const center = budget.size / 2;
    const particles = vfxParticles(seed, budget.particles);
    const [light, color] = colors[kind];
    let frame = 0,
      start: number | undefined;
    const draw = (now: number) => {
      start ??= now;
      const elapsed = now - start - delay;
      if (elapsed < 0) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const t = Math.min(1, elapsed / duration);
      context.clearRect(0, 0, budget.size, budget.size);
      if (t >= 1 || document.hidden) return;
      if (kind === "IMPACT") {
        const axis = Math.atan2(direction?.y ?? 0, direction?.x ?? 1);
        const force = Math.min(1.5, .5 + strength / 10);
        context.globalCompositeOperation = "source-over";
        // A few matte dust lobes and directional chips, not a persistent screen wash.
        for (const [i,p] of particles.entries()) {
          const angle = axis + (p.angle - Math.PI) * .7;
          const distance = p.speed * (1-Math.pow(1-t,3)) * force;
          const x = center + Math.cos(angle)*distance;
          const y = center + Math.sin(angle)*distance + 28*t*t;
          context.globalAlpha = Math.pow(1-t,2) * (i%3===0?.32:.85);
          context.fillStyle = i%3===0?'#b9a181':'#ead4ad';
          context.save();context.translate(x,y);context.rotate(p.angle+p.spin*t);
          if(i%3===0) {context.beginPath();context.ellipse(0,0,(8+18*t)*force,(5+11*t)*force,0,0,Math.PI*2);context.fill();}
          else {context.beginPath();context.moveTo(-p.size*2,-p.size);context.lineTo(p.size*2,0);context.lineTo(0,p.size*2);context.closePath();context.fill();}
          context.restore();
        }
        if(t<.2){context.globalAlpha=(1-t/.2)*.85;context.fillStyle=light;context.beginPath();
          for(let i=0;i<16;i++){const a=i*Math.PI/8;const r=(i%2?8:28)*force;const x=center+Math.cos(a)*r,y=center+Math.sin(a)*r;i?context.lineTo(x,y):context.moveTo(x,y);}
          context.closePath();context.fill();}
        frame=requestAnimationFrame(draw);return;
      }
      const lift = kind === "HEAL" || kind === "GOLD";
      context.globalCompositeOperation = "lighter";
      const radius =
        10 +
        Math.sin((Math.min(1, t * 2) * Math.PI) / 2) *
          (kind === "BLOCK" ? 58 : 85);
      const glow = context.createRadialGradient(
        center,
        center,
        0,
        center,
        center,
        radius,
      );
      glow.addColorStop(0, light + "aa");
      glow.addColorStop(0.22, color + "55");
      glow.addColorStop(1, color + "00");
      context.globalAlpha = Math.pow(1 - t, 3) * 0.8;
      context.fillStyle = glow;
      context.fillRect(
        center - radius,
        center - radius,
        radius * 2,
        radius * 2,
      );
      if (kind !== "RETIRE") {
        context.globalAlpha = Math.pow(1 - t, 2) * 0.7;
        context.strokeStyle = color;
        context.lineWidth = kind === "BLOCK" ? 3 : 1.5;
        context.beginPath();
        context.ellipse(
          center,
          center,
          radius,
          kind === "GOLD" ? radius * 0.42 : radius,
          0,
          0,
          Math.PI * 2,
        );
        context.stroke();
      }
      for (const p of particles) {
        const progress = Math.min(1, t / p.life);
        const distance = p.speed * (1 - Math.pow(1 - progress, 3));
        const x = center + Math.cos(p.angle) * distance;
        const y =
          center +
          Math.sin(p.angle) * distance * (lift ? 0.4 : 1) +
          (lift ? -70 * progress : 22 * progress * progress);
        context.globalAlpha = Math.pow(1 - progress, 2);
        context.strokeStyle = light;
        context.fillStyle = color;
        context.lineWidth = p.size * 0.6;
        if (kind === "DESTROY") {
          context.save();
          context.translate(x, y);
          context.rotate(p.angle + p.spin * progress);
          context.beginPath();
          context.moveTo(-p.size * 2, -p.size);
          context.lineTo(p.size * 2, 0);
          context.lineTo(0, p.size * 3);
          context.closePath();
          context.fill();
          context.restore();
        } else if (lift) {
          context.beginPath();
          context.moveTo(x - p.size, y);
          context.lineTo(x + p.size, y);
          context.moveTo(x, y - p.size);
          context.lineTo(x, y + p.size);
          context.stroke();
        } else {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(
            x - Math.cos(p.angle) * p.size * 4 * (1 - progress),
            y - Math.sin(p.angle) * p.size * 4 * (1 - progress),
          );
          context.stroke();
        }
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      context.clearRect(0, 0, budget.size, budget.size);
    };
  }, [kind, left, top, strength, seed, delay, duration, direction?.x, direction?.y]);
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="battle-vfx"
      style={{ left, top }}
    />
  );
}

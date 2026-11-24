import { useEffect, useMemo, useState } from "react";
import { audioManager } from "@/audio/audio-manager";
import { prefersReducedMotion } from "./presentation-config";
import "./arena-scene.css";

/**
 * 대전 경기장 장면 (코드로 그린 링).
 * 관중석·천장 조명·링(매트, 기둥, 로프 3줄, 에이프런)·해설석 소품을 그린다.
 * 카드 칸 위치를 재서 링을 딱 맞추고, 전투 화면 뒤에 깔린다.
 * 관리자가 전투 배경 그림을 정해 두면 이 장면 대신 그 그림이 나온다.
 */
type Box = { L: number; R: number; T: number; B: number; W: number; H: number };

function measure(): Box | null {
  const opp = document.querySelector(".ko-opponent-board-row")?.getBoundingClientRect();
  const me = document.querySelector(".ko-player-board-row")?.getBoundingClientRect();
  if (!opp || !me || !opp.width || !me.width) return null;
  return { L: Math.min(opp.left, me.left), R: Math.max(opp.right, me.right), T: opp.top, B: me.bottom, W: innerWidth, H: innerHeight };
}

function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function ArenaScene() {
  const [box, setBox] = useState<Box | null>(null);
  const [ring, setRing] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = measure();
        setBox((old) => (old && next && Object.keys(next).every((k) => Math.abs(old[k as keyof Box] - next[k as keyof Box]) < 1) ? old : next));
      });
    };
    update();
    const observer = new ResizeObserver(update);
    for (const selector of [".ko-opponent-board-row", ".ko-player-board-row", ".ko-game-stage"]) {
      const node = document.querySelector(selector);
      if (node) observer.observe(node);
    }
    addEventListener("resize", update);
    const timer = window.setInterval(update, 1500); // 화면 배치가 늦게 바뀌는 경우 대비
    return () => { cancelAnimationFrame(frame); observer.disconnect(); removeEventListener("resize", update); clearInterval(timer); };
  }, []);

  const svg = useMemo(() => (box ? drawArena(box) : null), [box]);
  if (!box || !svg) return null;
  const mobile = box.W < 769;
  const showProps = !mobile && box.W >= 1180 && box.H >= 720;

  function ringBell() {
    try { audioManager.playImpactOverlay(`${import.meta.env.BASE_URL}sfx/ring-bell.wav`, 70, 2); } catch { /* 소리는 꾸밈 */ }
    setRing((n) => n + 1);
  }

  return (
    <div className="ko-arena-scene" aria-hidden="true" data-reduced={prefersReducedMotion() || undefined}>
      <div className="ko-arena-scene__art" dangerouslySetInnerHTML={{ __html: svg }} />
      {showProps && (
        <button
          type="button"
          className={`ko-arena-bell ${ring ? "is-ringing" : ""}`}
          key={ring}
          style={{ left: box.W - 178, top: box.H - 142 }}
          onClick={ringBell}
          aria-label="링 벨 치기"
          tabIndex={-1}
        >
          <svg viewBox="0 0 150 120" width="150" height="120">
            <defs>
              <radialGradient id="kab-gold" cx="35%" cy="30%"><stop offset="0" stopColor="#fff4c8" /><stop offset=".45" stopColor="#e5b552" /><stop offset="1" stopColor="#6a4810" /></radialGradient>
              <linearGradient id="kab-wood" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#6a4a2a" /><stop offset="1" stopColor="#2a1a0c" /></linearGradient>
            </defs>
            <ellipse cx="75" cy="112" rx="68" ry="7" fill="rgba(0,0,0,.6)" />
            <rect x="8" y="70" width="134" height="40" rx="4" fill="url(#kab-wood)" stroke="#000" />
            <rect x="8" y="70" width="134" height="5" fill="#8a6a42" />
            <g className="ko-arena-bell__bell">
              <rect x="44" y="60" width="16" height="12" rx="2" fill="#3a2a1a" />
              <circle cx="52" cy="44" r="22" fill="url(#kab-gold)" stroke="#5a3c10" strokeWidth="2" />
              <circle cx="52" cy="44" r="7" fill="#6a4810" />
              <circle cx="45" cy="37" r="5" fill="#fff6d8" opacity=".55" />
            </g>
            <g transform="translate(108 58) rotate(-30)">
              <rect x="-4" y="-22" width="8" height="34" rx="3" fill="#7a5a3a" stroke="#2a1a0c" />
              <rect x="-9" y="-30" width="18" height="12" rx="4" fill="#4a3220" stroke="#2a1a0c" />
            </g>
          </svg>
          <span className="ko-arena-bell__label">땡!</span>
        </button>
      )}
    </div>
  );
}

function drawArena({ L: l, R: r, T: t, B: b, W, H }: Box): string {
  const mobile = W < 769;
  const pad = mobile ? 7 : 30;
  const L = l - pad, R = r + pad, T = t - pad, B = b + pad;
  const rw = R - L, rh = B - T, cx = (L + R) / 2, cy = (T + B) / 2;
  const rnd = random(11);
  const k = mobile ? 0.42 : 1; // 기둥·로프 크기 배율

  // 관중석: 여러 줄의 머리·어깨 실루엣 (뒤쪽은 작고 흐리게)
  let crowd = "";
  const rows = mobile ? 5 : 8;
  for (let row = 0; row < rows; row++) {
    const y = 26 + row * (mobile ? 22 : 30), size = (mobile ? 6 : 8) + row * (mobile ? 1.2 : 2), alpha = 0.22 + row * 0.07;
    let x = -10 + rnd() * 10;
    while (x < W + 20) {
      const yy = y + rnd() * 7, s = size * (0.85 + rnd() * 0.35), tone = 8 + Math.round(rnd() * 14);
      crowd += `<g opacity="${alpha.toFixed(2)}" fill="rgb(${tone},${tone - 3},${tone - 6})"><circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="${(s * 0.55).toFixed(1)}"/><rect x="${(x - s * 0.9).toFixed(1)}" y="${(yy + s * 0.42).toFixed(1)}" width="${(s * 1.8).toFixed(1)}" height="${(s * 1.7).toFixed(1)}" rx="${(s * 0.6).toFixed(1)}"/></g>`;
      x += s * 1.85 + rnd() * 5;
    }
  }
  let flashes = "";
  for (let i = 0; i < (mobile ? 12 : 30); i++)
    flashes += `<circle class="kas-flash" cx="${(rnd() * W).toFixed(0)}" cy="${(24 + rnd() * (mobile ? 110 : 240)).toFixed(0)}" r="${(1.4 + rnd() * 2.4).toFixed(1)}" style="animation-delay:${(rnd() * 7).toFixed(2)}s;animation-duration:${(4 + rnd() * 6).toFixed(2)}s"/>`;

  const post = (x: number, y: number) => `
    <g transform="translate(${x},${y}) scale(${k})">
      <ellipse cx="0" cy="16" rx="18" ry="7" fill="rgba(0,0,0,.55)"/>
      <rect x="-10" y="-36" width="20" height="50" rx="5" fill="url(#kas-steel)" stroke="#151515"/>
      <rect x="-15" y="-29" width="30" height="12" rx="6" fill="url(#kas-pad)" stroke="#2a0606"/>
      <rect x="-15" y="-13" width="30" height="12" rx="6" fill="url(#kas-pad)" stroke="#2a0606"/>
      <rect x="-15" y="3" width="30" height="10" rx="5" fill="url(#kas-pad)" stroke="#2a0606"/>
      <circle cx="0" cy="-40" r="8" fill="url(#kas-gold)" stroke="#5a3c10"/>
      <circle cx="-2.5" cy="-42.5" r="2.5" fill="#fff6d8" opacity=".7"/>
    </g>`;
  const rope = (x1: number, y1: number, x2: number, y2: number, horiz: boolean) =>
    [0, 1, 2].map((i) => {
      const off = 6.5 * k * i;
      const a = horiz ? [x1, y1 - off, x2, y2 - off] : [x1 - off, y1, x2 - off, y2];
      const sag = 3.5 * k;
      const d = horiz ? `M ${a[0]} ${a[1]} Q ${(a[0] + a[2]) / 2} ${a[1] + sag} ${a[2]} ${a[3]}` : `M ${a[0]} ${a[1]} Q ${a[0] + sag} ${(a[1] + a[3]) / 2} ${a[2]} ${a[3]}`;
      return `<path d="${d}" stroke="#000" stroke-opacity=".5" stroke-width="${7 * k}" fill="none" stroke-linecap="round" transform="translate(0,${3 * k})"/>
        <path d="${d}" stroke="url(#kas-rope${i})" stroke-width="${5 * k}" fill="none" stroke-linecap="round"/>
        <path d="${d}" stroke="rgba(255,255,255,.4)" stroke-width="${1.2 * k}" fill="none" transform="translate(0,${-1.2 * k})"/>`;
    }).join("");

  const apronH = mobile ? 0 : 46;
  const spot = (px: number, tilt: number, o: number) =>
    `<polygon points="${W * px - 12},28 ${W * px + 12},28 ${cx + tilt + rw * 0.3},${cy + rh * 0.1} ${cx + tilt - rw * 0.3},${cy + rh * 0.1}" fill="url(#kas-spot)" opacity="${o}"/>`;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="kas-room" cx="50%" cy="42%" r="78%"><stop offset="0" stop-color="#2b1e11"/><stop offset=".5" stop-color="#140d07"/><stop offset="1" stop-color="#030202"/></radialGradient>
    <linearGradient id="kas-steel" x1="0" x2="1"><stop offset="0" stop-color="#3e3e42"/><stop offset=".35" stop-color="#e2e2e7"/><stop offset=".6" stop-color="#8a8a90"/><stop offset="1" stop-color="#26262a"/></linearGradient>
    <linearGradient id="kas-pad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e8513f"/><stop offset=".55" stop-color="#a3191a"/><stop offset="1" stop-color="#560909"/></linearGradient>
    <radialGradient id="kas-gold" cx="35%" cy="30%"><stop offset="0" stop-color="#fff4c8"/><stop offset=".45" stop-color="#e5b552"/><stop offset="1" stop-color="#6a4810"/></radialGradient>
    <linearGradient id="kas-rope0" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f8e6ae"/><stop offset="1" stop-color="#a87a24"/></linearGradient>
    <linearGradient id="kas-rope1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f6f2ea"/><stop offset="1" stop-color="#9a958b"/></linearGradient>
    <linearGradient id="kas-rope2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ea5040"/><stop offset="1" stop-color="#6e0e0e"/></linearGradient>
    <linearGradient id="kas-apron" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1c1510"/><stop offset="1" stop-color="#060504"/></linearGradient>
    <pattern id="kas-apron-pattern" width="140" height="46" patternUnits="userSpaceOnUse" x="${cx}">
      <text x="70" y="31" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="22" fill="#c9a24a" fill-opacity=".6" letter-spacing="4">K.O.</text>
      <circle cx="0" cy="23" r="3" fill="#c9a24a" fill-opacity=".45"/>
    </pattern>
    <radialGradient id="kas-spot" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#fff3d0" stop-opacity=".55"/><stop offset="1" stop-color="#fff3d0" stop-opacity="0"/></radialGradient>
    <radialGradient id="kas-matlight" cx="50%" cy="48%" r="62%"><stop offset="0" stop-color="#fff2d6" stop-opacity=".28"/><stop offset=".7" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>
    <filter id="kas-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
    <filter id="kas-noise"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .4  0 0 0 0 .35  0 0 0 .16 0"/></filter>
    <filter id="kas-wrinkle"><feTurbulence type="fractalNoise" baseFrequency=".006 .02" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .14 0"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#kas-room)"/>
  ${mobile ? "" : `<g opacity=".85"><rect x="${W * 0.06}" y="6" width="${W * 0.88}" height="9" fill="#2a2620"/><rect x="${W * 0.06}" y="18" width="${W * 0.88}" height="3" fill="#18150f"/>${[0.14, 0.3, 0.5, 0.7, 0.86].map((p) => `<g transform="translate(${W * p},15)"><rect x="-10" y="0" width="20" height="16" rx="3" fill="#33302a"/><circle cx="0" cy="16" r="6" fill="#fff6dc"/></g>`).join("")}</g>`}
  <g>${crowd}</g>
  <g fill="#fff">${flashes}</g>
  <g class="kas-spots">${spot(0.18, -60, 0.3)}${spot(0.5, 0, 0.5)}${spot(0.82, 60, 0.3)}</g>
  <rect x="${L - 26 * k}" y="${T + 8}" width="${rw + 52 * k}" height="${rh + apronH + 12}" rx="14" fill="#000" opacity=".75" filter="url(#kas-blur)"/>
  ${apronH ? `<rect x="${L - 16}" y="${B}" width="${rw + 32}" height="${apronH}" fill="url(#kas-apron)" stroke="#000"/><rect x="${L - 16}" y="${B}" width="${rw + 32}" height="${apronH}" fill="url(#kas-apron-pattern)"/><rect x="${L - 16}" y="${B}" width="${rw + 32}" height="3" fill="#c9a24a" opacity=".75"/>` : ""}
  <rect x="${L}" y="${T}" width="${rw}" height="${rh}" fill="#d8d0bf"/>
  <rect x="${L}" y="${T}" width="${rw}" height="${rh}" filter="url(#kas-noise)"/>
  <rect x="${L}" y="${T}" width="${rw}" height="${rh}" filter="url(#kas-wrinkle)"/>
  <rect x="${L}" y="${T}" width="${rw}" height="${rh}" fill="url(#kas-matlight)"/>
  <rect x="${L + 3}" y="${T + 3}" width="${rw - 6}" height="${rh - 6}" fill="none" stroke="#7a1414" stroke-opacity=".28" stroke-width="${mobile ? 2 : 4}"/>
  <g transform="translate(${cx},${cy})" opacity=".13" fill="none" stroke="#6a1212">
    <circle r="${Math.min(rw, rh) * 0.33}" stroke-width="${mobile ? 3 : 9}"/>
    <circle r="${Math.min(rw, rh) * 0.27}" stroke-width="${mobile ? 1 : 2}"/>
    <text y="${Math.min(rw, rh) * 0.105}" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="${Math.min(rw, rh) * 0.3}" fill="#6a1212" stroke="none">KO</text>
  </g>
  ${rope(L, T + 6 * k, R, T + 6 * k, true)}
  ${rope(L, B, R, B, true)}
  ${mobile ? "" : rope(L + 6, T, L + 6, B, false) + rope(R + 6, T, R + 6, B, false)}
  ${post(L, T)}${post(R, T)}${post(L, B)}${post(R, B)}
</svg>`;
}

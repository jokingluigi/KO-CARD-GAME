import { useEffect, useMemo, useState } from "react";
import { audioManager } from "@/audio/audio-manager";
import { prefersReducedMotion } from "./presentation-config";
import tableWood from "./battle-board-assets/walnut-material-wide.webp";
import rimWood from "./battle-board-assets/board-rim-wood.webp";
import "./table-scene.css";

/**
 * 대전 화면 = 나무 테이블 위에 펼쳐 둔 보드게임판.
 * 테이블 위 따뜻한 조명, 두꺼운 원목 테두리와 금 상감선, 펠트 경기면, 놋쇠 모서리,
 * 그리고 테이블 위 소품(촛불, 동전 더미, 주사위, 카드 상자)을 그린다.
 * 카드 칸 위치를 재서 판을 맞추며, 관리자가 전투 배경 그림을 정해 두면 그 그림이 대신 나온다.
 */
type Box = { L: number; R: number; T: number; B: number; W: number; H: number };

function measure(): Box | null {
  const opp = document.querySelector(".ko-opponent-board-row")?.getBoundingClientRect();
  const me = document.querySelector(".ko-player-board-row")?.getBoundingClientRect();
  if (!opp || !me || !opp.width || !me.width) return null;
  return { L: Math.min(opp.left, me.left), R: Math.max(opp.right, me.right), T: opp.top, B: me.bottom, W: innerWidth, H: innerHeight };
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

function Die({ value, rotate }: { value: number; rotate: number }) {
  return (
    <svg viewBox="0 0 100 100" width="44" height="44" style={{ transform: `rotate(${rotate}deg)` }}>
      <rect x="4" y="4" width="92" height="92" rx="18" fill="#f4eee2" stroke="#8a7a62" strokeWidth="3" />
      <rect x="10" y="8" width="80" height="20" rx="10" fill="#fff" opacity=".55" />
      {PIPS[value]!.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" fill="#5a1414" />)}
    </svg>
  );
}

export function TableScene() {
  const [box, setBox] = useState<Box | null>(null);
  const [dice, setDice] = useState<[number, number]>([5, 2]);
  const [rolling, setRolling] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = measure();
        setBox((old) => (old && next && (Object.keys(next) as (keyof Box)[]).every((k) => Math.abs(old[k] - next[k]) < 1) ? old : next));
      });
    };
    update();
    const observer = new ResizeObserver(update);
    for (const selector of [".ko-opponent-board-row", ".ko-player-board-row", ".ko-game-stage"]) {
      const node = document.querySelector(selector);
      if (node) observer.observe(node);
    }
    addEventListener("resize", update);
    const timer = window.setInterval(update, 1500);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); removeEventListener("resize", update); clearInterval(timer); };
  }, []);

  const svg = useMemo(() => (box ? drawBoard(box) : null), [box]);
  if (!box || !svg) return null;
  const roomy = box.W >= 1180 && box.H >= 720;
  const topLeftFree = roomy && box.L > 230 && box.H >= 800;

  function roll() {
    setRolling((n) => n + 1);
    try { audioManager.playImpactOverlay(`${import.meta.env.BASE_URL}sfx/impact-light.wav`, 35, 2); } catch { /* 소리는 꾸밈 */ }
    window.setTimeout(() => setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), prefersReducedMotion() ? 0 : 380);
  }

  return (
    <div
      className="ko-table-scene"
      aria-hidden="true"
      data-reduced={prefersReducedMotion() || undefined}
      style={{ "--table-wood": `url("${tableWood}")`, "--rim-wood": `url("${rimWood}")` } as React.CSSProperties}
    >
      <div className="ko-table-scene__table" />
      <div className="ko-table-scene__art" dangerouslySetInnerHTML={{ __html: svg }} />
      {roomy && (
        <>
          {topLeftFree && (
            <div className="ko-table-prop ko-table-prop--candle" style={{ left: 34, top: 22 }}>
              <span className="ko-table-candle__glow" />
              <svg viewBox="0 0 120 150" width="96" height="120">
                <ellipse cx="60" cy="140" rx="46" ry="8" fill="rgba(0,0,0,.55)" />
                <ellipse cx="60" cy="128" rx="40" ry="10" fill="#7a5a2a" stroke="#3a2810" />
                <rect x="20" y="118" width="80" height="10" fill="#9a7436" />
                <ellipse cx="60" cy="118" rx="40" ry="10" fill="#c9a24a" stroke="#5a3c10" />
                <rect x="44" y="52" width="32" height="68" rx="4" fill="#efe4cc" />
                <rect x="44" y="52" width="10" height="68" fill="#fff8e8" opacity=".6" />
                <path d="M70 60 q4 14 0 26" stroke="#e0d2b2" strokeWidth="4" fill="none" />
                <ellipse cx="60" cy="52" rx="16" ry="4" fill="#e6d8bc" />
                <rect x="58.5" y="40" width="3" height="12" fill="#2a2018" />
                <path className="ko-table-candle__flame" d="M60 14 C 68 26 70 34 60 42 C 50 34 52 26 60 14 Z" fill="#ffcf5a" />
                <path className="ko-table-candle__flame" d="M60 24 C 64 30 65 35 60 40 C 55 35 56 30 60 24 Z" fill="#fff6d0" />
              </svg>
            </div>
          )}
          {topLeftFree && (
            <div className="ko-table-prop" style={{ left: 138, top: 72 }}>
              <svg viewBox="0 0 110 90" width="92" height="76">
                <ellipse cx="55" cy="80" rx="44" ry="8" fill="rgba(0,0,0,.5)" />
                {[0, 1, 2, 3, 4].map((i) => (
                  <g key={i} transform={`translate(${32 + (i % 2) * 3},${68 - i * 9})`}>
                    <ellipse cx="0" cy="4" rx="24" ry="8" fill="#8a6418" />
                    <ellipse cx="0" cy="0" rx="24" ry="8" fill="#e8bc52" stroke="#7a5512" />
                    <ellipse cx="0" cy="0" rx="15" ry="4.6" fill="none" stroke="#b88a2a" />
                  </g>
                ))}
                <g transform="translate(80,70) rotate(-12)">
                  <ellipse cx="0" cy="4" rx="20" ry="7" fill="#8a6418" />
                  <ellipse cx="0" cy="0" rx="20" ry="7" fill="#f0c860" stroke="#7a5512" />
                  <text y="3" textAnchor="middle" fontSize="8" fontWeight="900" fill="#7a5512" fontFamily="Georgia,serif">KO</text>
                </g>
              </svg>
            </div>
          )}
          <div className="ko-table-prop ko-table-prop--deckbox" style={{ left: box.W - 118, top: box.H - 168 }}>
            <svg viewBox="0 0 100 120" width="84" height="100">
              <ellipse cx="54" cy="112" rx="40" ry="7" fill="rgba(0,0,0,.55)" />
              <path d="M18 30 L70 22 L86 32 L86 104 L34 110 L18 100 Z" fill="#3a1414" stroke="#120404" />
              <path d="M18 30 L70 22 L86 32 L34 40 Z" fill="#5a1e1e" />
              <path d="M34 40 L86 32 L86 104 L34 110 Z" fill="#4a1818" />
              <path d="M38 48 L82 41 L82 98 L38 104 Z" fill="none" stroke="#c9a24a" strokeWidth="2" />
              <text x="60" y="80" textAnchor="middle" fontFamily="Georgia,serif" fontWeight="900" fontSize="20" fill="#c9a24a" transform="skewY(-8) translate(0,8)">KO</text>
            </svg>
          </div>
          <button type="button" className={`ko-table-prop ko-table-dice ${rolling ? "is-rolling" : ""}`} key={rolling} style={{ left: box.W - 214, top: box.H - 96 }} onClick={roll} aria-label="주사위 굴리기" tabIndex={-1}>
            <span className="ko-table-dice__one"><Die value={dice[0]} rotate={-14} /></span>
            <span className="ko-table-dice__two"><Die value={dice[1]} rotate={22} /></span>
          </button>
        </>
      )}
    </div>
  );
}

function drawBoard({ L: l, R: r, T: t, B: b, W, H }: Box): string {
  const mobile = W < 769;
  const rim = mobile ? 9 : 26;
  const L = l - rim, R = r + rim, T = t - rim, B = b + rim;
  const rw = R - L, rh = B - T, cx = (l + r) / 2, cy = (t + b) / 2;
  const fw = r - l, fh = b - t;
  const radius = mobile ? 10 : 22;
  const corner = (x: number, y: number, sx: number, sy: number) => mobile ? "" : `
    <g transform="translate(${x},${y}) scale(${sx},${sy})">
      <path d="M0 0 H46 V9 H9 V46 H0 Z" fill="url(#ktb-brass)" stroke="#4a3210" stroke-width="1.2"/>
      <path d="M2 2 H43" stroke="#fff4c8" stroke-opacity=".5" stroke-width="1.2"/>
      <circle cx="5" cy="5" r="2.6" fill="#5a3c10"/><circle cx="36" cy="4.6" r="1.8" fill="#5a3c10"/><circle cx="4.6" cy="36" r="1.8" fill="#5a3c10"/>
    </g>`;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="ktb-rim" patternUnits="userSpaceOnUse" width="512" height="512"><image href="RIMWOOD" width="512" height="512"/></pattern>
    <linearGradient id="ktb-bevel" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff0d0" stop-opacity=".28"/><stop offset=".18" stop-color="#fff0d0" stop-opacity="0"/><stop offset=".82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
    <linearGradient id="ktb-brass" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".4" stop-color="#d8a84a"/><stop offset="1" stop-color="#6a4810"/></linearGradient>
    <radialGradient id="ktb-felt" cx="50%" cy="46%" r="70%"><stop offset="0" stop-color="#2f5a4c"/><stop offset=".65" stop-color="#1d3d33"/><stop offset="1" stop-color="#0f231d"/></radialGradient>
    <filter id="ktb-feltnoise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 .8  0 0 0 0 .9  0 0 0 0 .85  0 0 0 .07 0"/></filter>
    <filter id="ktb-shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${mobile ? 6 : 18}"/></filter>
    <filter id="ktb-inner" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${mobile ? 3 : 8}"/></filter>
    <clipPath id="ktb-field"><rect x="${l}" y="${t}" width="${fw}" height="${fh}" rx="${mobile ? 6 : 12}"/></clipPath>
  </defs>
  <!-- 판 그림자 (테이블 위에 놓인 느낌) -->
  <rect x="${L + 6}" y="${T + (mobile ? 6 : 18)}" width="${rw}" height="${rh}" rx="${radius}" fill="#000" opacity=".75" filter="url(#ktb-shadow)"/>
  <!-- 원목 테두리 -->
  <rect x="${L}" y="${T}" width="${rw}" height="${rh}" rx="${radius}" fill="url(#ktb-rim)"/>
  <rect x="${L}" y="${T}" width="${rw}" height="${rh}" rx="${radius}" fill="url(#ktb-bevel)"/>
  <rect x="${L + 1}" y="${T + 1}" width="${rw - 2}" height="${rh - 2}" rx="${radius}" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="2"/>
  <rect x="${L + 3}" y="${T + 3}" width="${rw - 6}" height="${rh - 6}" rx="${radius - 2}" fill="none" stroke="#ffe8b8" stroke-opacity=".18" stroke-width="1.5"/>
  <!-- 금 상감선 -->
  ${mobile ? "" : `<rect x="${l - 11}" y="${t - 11}" width="${fw + 22}" height="${fh + 22}" rx="16" fill="none" stroke="#c9a24a" stroke-width="2" stroke-opacity=".85"/><rect x="${l - 7}" y="${t - 7}" width="${fw + 14}" height="${fh + 14}" rx="14" fill="none" stroke="#3a2410" stroke-width="2"/>`}
  <!-- 펠트 경기면 -->
  <rect x="${l}" y="${t}" width="${fw}" height="${fh}" rx="${mobile ? 6 : 12}" fill="url(#ktb-felt)"/>
  <g clip-path="url(#ktb-field)">
    <rect x="${l}" y="${t}" width="${fw}" height="${fh}" filter="url(#ktb-feltnoise)"/>
    <rect x="${l - 20}" y="${t - 20}" width="${fw + 40}" height="${fh + 40}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="${mobile ? 14 : 34}" filter="url(#ktb-inner)"/>
    <!-- 판에 인쇄된 무늬: 안쪽 점선 테두리와 가운데 문장 -->
    <rect x="${l + (mobile ? 6 : 14)}" y="${t + (mobile ? 6 : 14)}" width="${fw - (mobile ? 12 : 28)}" height="${fh - (mobile ? 12 : 28)}" rx="8" fill="none" stroke="#d8c48a" stroke-opacity=".22" stroke-width="1.5" stroke-dasharray="2 6"/>
    <g transform="translate(${cx},${cy})" opacity=".14" fill="none" stroke="#e8d49a">
      <circle r="${Math.min(fw, fh) * 0.3}" stroke-width="${mobile ? 1.5 : 3}"/>
      <circle r="${Math.min(fw, fh) * 0.26}" stroke-width="1" stroke-dasharray="3 5"/>
      <path d="M0 ${-Math.min(fw, fh) * 0.2} L${Math.min(fw, fh) * 0.06} 0 L0 ${Math.min(fw, fh) * 0.2} L${-Math.min(fw, fh) * 0.06} 0 Z" fill="#e8d49a" stroke="none"/>
      <path d="M${-Math.min(fw, fh) * 0.2} 0 L0 ${Math.min(fw, fh) * 0.05} L${Math.min(fw, fh) * 0.2} 0 L0 ${-Math.min(fw, fh) * 0.05} Z" fill="#e8d49a" stroke="none"/>
    </g>
  </g>
  <!-- 놋쇠 모서리 -->
  ${corner(L + 4, T + 4, 1, 1)}${corner(R - 4, T + 4, -1, 1)}${corner(L + 4, B - 4, 1, -1)}${corner(R - 4, B - 4, -1, -1)}
</svg>`.replace(/RIMWOOD/g, rimWood);
}

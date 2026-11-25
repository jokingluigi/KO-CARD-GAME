import { useEffect, useMemo, useState } from "react";
import { prefersReducedMotion } from "./presentation-config";
import tableWood from "./battle-board-assets/walnut-material-wide.webp";
import rimWood from "./battle-board-assets/board-rim-wood.webp";
import "./table-scene.css";
import "./battle-tabletop.css";

/**
 * 대전 화면 = 나무 테이블 위에 펼쳐 둔 보드게임판.
 * 테이블 위 따뜻한 조명, 두꺼운 원목 테두리와 금 상감선, 펠트 경기면, 놋쇠 모서리,
 * 카드 칸 위치를 재서 판을 맞추며, 관리자가 전투 배경 그림을 정해 두면 그 그림이 대신 나온다.
 */
type Box = { L: number; R: number; T: number; B: number; W: number; H: number };

function measure(): Box | null {
  const opp = document.querySelector(".ko-opponent-board-row")?.getBoundingClientRect();
  const me = document.querySelector(".ko-player-board-row")?.getBoundingClientRect();
  if (!opp || !me || !opp.width || !me.width) return null;
  return { L: Math.min(opp.left, me.left), R: Math.max(opp.right, me.right), T: opp.top, B: me.bottom, W: innerWidth, H: innerHeight };
}

export function TableScene() {
  const [box, setBox] = useState<Box | null>(null);

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
  return (
    <div
      className="ko-table-scene"
      aria-hidden="true"
      data-reduced={prefersReducedMotion() || undefined}
      style={{ "--table-wood": `url("${tableWood}")`, "--rim-wood": `url("${rimWood}")` } as React.CSSProperties}
    >
      <div className="ko-table-scene__table" />
      <div className="ko-table-scene__art" dangerouslySetInnerHTML={{ __html: svg }} />
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

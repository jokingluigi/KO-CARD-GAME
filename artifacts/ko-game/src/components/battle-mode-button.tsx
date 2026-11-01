import { useState, type CSSProperties } from "react";
import {
  defaultHomeMenuLayout,
  type HomeMenuArtwork,
} from "@workspace/cosmetics";
import "./home-lobby.css";
export function BattleModeButton({
  artwork,
  onClick,
  previewDevice,
}: {
  artwork?: HomeMenuArtwork | null;
  onClick: () => void;
  previewDevice?: "desktop" | "mobile";
}) {
  const [failed, setFailed] = useState<string | null>(null),
    layout = artwork ?? { ...defaultHomeMenuLayout(), imageUrl: null };
  const style = Object.fromEntries(
    (["desktop", "mobile"] as const).flatMap((device) => {
      const p = layout[device];
      return [
        [`--hero-${device}-scale`, p.scale],
        [`--hero-${device}-x`, `${p.x}%`],
        [`--hero-${device}-y`, `${p.y}%`],
        [`--hero-${device}-flip`, p.flip ? -1 : 1],
        [`--hero-${device}-fit`, p.fit],
      ];
    }),
  ) as CSSProperties;
  return (
    <button
      type="button"
      className="ko-battle-mode-button"
      data-testid="button-battle-modes"
      data-preview-device={previewDevice}
      style={style}
      onClick={onClick}
    >
      <span className="ko-battle-mode-button__art" aria-hidden="true">
        {layout.imageUrl && failed !== layout.imageUrl && (
          <img
            src={layout.imageUrl}
            alt=""
            draggable={false}
            onError={() => setFailed(layout.imageUrl)}
          />
        )}
      </span>
      <span className="ko-battle-mode-button__copy">
        <small>KO CARD BATTLE</small>
        <strong>대전 모드</strong>
        <span>온라인 · AI · 드래프트</span>
      </span>
      <span className="ko-battle-mode-button__arrow" aria-hidden="true">
        ▶
      </span>
    </button>
  );
}

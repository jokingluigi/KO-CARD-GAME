import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/game-experience.css";
import { RecoverableArtwork } from "../src/components/recoverable-artwork";
import { CardArtwork } from "../src/components/card-artwork";
import { BattleSpriteEditor } from "../src/components/battle-sprite-editor";
import type { BattleSprite } from "@workspace/cosmetics";
if (!import.meta.env.DEV) throw Error("Development only");
function Scene() {
  const [art, setArt] = useState(1),
    [mounted, setMounted] = useState(true),
    [config, setConfig] = useState<BattleSprite>({
      version: 1,
      frames: {
        default: {
          url: "/qa/card-primary-1.png",
          self: { scale: 1, x: 50, y: 50, flip: false, crop: true },
          opponent: { scale: 1, x: 50, y: 50, flip: true, crop: true },
        },
      },
      reactions: {},
    });
  const sprites = new URLSearchParams(location.search).has("sprite");
  return (
    <main className="min-h-screen bg-black p-4 text-white">
      {sprites ? (
        <>
          <button onClick={() => setMounted(false)}>편집기 이탈</button>
          <output data-testid="sprite-json">{JSON.stringify(config)}</output>
          {mounted && (
            <BattleSpriteEditor value={config} onChange={setConfig} />
          )}
        </>
      ) : (
        <>
          <button onClick={() => setArt((n) => (n === 1 ? 2 : 1))}>
            이미지 교체
          </button>
          <div data-testid="recoverable">
            <RecoverableArtwork
              src={"/qa/recover-" + art + ".png"}
              fallbackSrc="/qa/recover-fallback.png"
              alt="원본 카드"
              className="h-40"
            />
          </div>
          <div data-testid="card-art">
            <CardArtwork
              src={"/qa/card-primary-" + art + ".png"}
              fallbackSrc="/qa/card-fallback.png"
              alt="카드 그림"
              className="h-40 w-32"
            />
          </div>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Scene />);

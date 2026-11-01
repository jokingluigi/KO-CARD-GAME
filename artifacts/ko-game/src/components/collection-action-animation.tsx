import { flyBetween } from "./physical-feedback";
import { prefersReducedMotion } from "./presentation-config";
import { interfaceFrames } from "./motion/interface-motion-policy";
import { useEffect, useRef } from "react";
import { Gift, Hammer, Shield, Sparkles } from "lucide-react";
import { CardArtwork } from "./card-artwork";

export type CollectionActionScene = {
  id: number;
  kind: "CRAFT" | "DISENCHANT" | "CHAMPION_CRAFT" | "PACK_PURCHASE" | "REWARD";
  name: string;
  imageUrl?: string | null;
  quantity?: number;
};

export function CollectionActionAnimation({
  scene,
  onComplete,
}: {
  scene: CollectionActionScene;
  onComplete: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    const reduced = prefersReducedMotion();
    let a: Animation | undefined;
    try {
      a = surface.current?.animate(interfaceFrames("SUCCESS", reduced), {
        duration: reduced ? 120 : 320,
        easing: "ease-out",
      });
    } catch {}
    const transfer = window.setTimeout(
      () => {
        if (scene.kind === "REWARD" || scene.kind === "DISENCHANT")
          flyBetween(
            surface.current?.querySelector(".collection-action__visual"),
            document.querySelector("[data-ui-balance]"),
          );
      },
      reduced ? 0 : 280,
    );
    const timer = window.setTimeout(
      () => onCompleteRef.current(),
      reduced ? 500 : 1600,
    );
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(transfer);
      a?.cancel();
    };
  }, [scene.id]);

  const disenchant = scene.kind === "DISENCHANT";
  const champion = scene.kind === "CHAMPION_CRAFT";
  const reward = scene.kind === "PACK_PURCHASE" || scene.kind === "REWARD";
  return (
    <div
      className={`collection-action collection-action--${disenchant ? "disenchant" : champion ? "champion" : reward ? "reward" : "craft"}`}
      role="status"
      aria-live="polite"
    >
      <div className="collection-action__particles" aria-hidden="true" />
      <div ref={surface} className="collection-action__content">
        <p className="collection-action__label">
          {disenchant
            ? "PRISM CONVERSION"
            : champion
              ? "CHAMPION FORGED"
              : scene.kind === "PACK_PURCHASE"
                ? "PACK ACQUIRED"
                : scene.kind === "REWARD"
                  ? "REWARD CLAIMED"
                  : "CARD FORGED"}
        </p>
        <div className="collection-action__visual">
          {scene.imageUrl ? (
            <CardArtwork
              src={scene.imageUrl}
              alt=""
              className="h-full w-full"
            />
          ) : champion ? (
            <Shield className="h-20 w-20" />
          ) : disenchant ? (
            <Sparkles className="h-20 w-20" />
          ) : reward ? (
            <Gift className="h-20 w-20" />
          ) : (
            <Hammer className="h-20 w-20" />
          )}
        </div>
        <h2>{scene.name}</h2>
        <p>
          {disenchant
            ? `${scene.quantity ?? 1}장 분해 · 프리즘 획득`
            : champion
              ? "챔피언 제작 완료"
              : scene.kind === "PACK_PURCHASE"
                ? `팩 ${scene.quantity ?? 1}개 획득`
                : scene.kind === "REWARD"
                  ? "보상 수령 완료"
                  : "카드 제작 완료"}
        </p>
        <button type="button" onClick={onComplete}>
          계속
        </button>
      </div>
    </div>
  );
}

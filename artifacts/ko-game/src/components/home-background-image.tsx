import type { CSSProperties } from "react";
import {
  defaultHomeBackgroundPlacement,
  type HomeBackgroundPlacement,
} from "@workspace/cosmetics";
import "./home-background-image.css";
/** The administrator preview and the real lobby share the same crop calculation. */
export function HomeBackgroundImage({
  url,
  placement,
  device,
}: {
  url: string;
  placement?: HomeBackgroundPlacement | null;
  device?: "desktop" | "mobile";
}) {
  const p = placement ?? defaultHomeBackgroundPlacement();
  return (
    <img
      src={url}
      alt=""
      decoding="async"
      className="ko-main-menu__art-original ko-home-background-image"
      data-background-device={device}
      style={
        {
          "--home-bg-desktop-x": p.desktop.x + "%",
          "--home-bg-desktop-y": p.desktop.y + "%",
          "--home-bg-mobile-x": p.mobile.x + "%",
          "--home-bg-mobile-y": p.mobile.y + "%",
          objectPosition: "var(--home-bg-x) var(--home-bg-y)",
        } as CSSProperties
      }
    />
  );
}

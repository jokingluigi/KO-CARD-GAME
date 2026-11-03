import { clearInterfaceFlights } from "../physical-feedback";
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { prefersReducedMotion } from "../presentation-config";
import {
  interfaceDirection,
  interfaceFrames,
  interfaceRoute,
  INTERFACE_TIMING,
  type InterfaceCue,
} from "./interface-motion-policy";
import "./interface-motion.css";
/** Opt-in surfaces only; no combat/admin DOM polling, input locks or server actions. */
export function InterfaceMotionBridge() {
  const [path] = useLocation(),
    previous = useRef(path);
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const before = previous.current;
    previous.current = path;
    const direction = interfaceDirection(before, path),
      running = new Map<Element, Animation>(),
      seen = new WeakMap<Element, string>(),
      staged = new WeakSet<Element>();
    let frame = 0,
      entered: Element | null = null;
    const reduced = () => prefersReducedMotion();
    const play = (
      node: HTMLElement,
      frames: Keyframe[],
      duration: number,
      delay = 0,
    ) => {
      if (document.hidden || !node.isConnected) return;
      const r = node.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.width <= 0) return;
      running.get(node)?.cancel();
      try {
        const animation = node.animate(frames, {
          duration: reduced() ? Math.min(duration, 120) : duration,
          delay: reduced() ? 0 : delay,
          easing: "cubic-bezier(.16,1,.3,1)",
        });
        running.set(node, animation);
        node.dataset.uiMotionPlayed = String(performance.now());
        animation.finished
          .catch(() => {})
          .finally(() => {
            if (running.get(node) === animation) running.delete(node);
          });
      } catch {}
    };
    const scan = () => {
      frame = 0;
      for (const [node, a] of running)
        if (!node.isConnected) {
          a.cancel();
          running.delete(node);
        }
      if (!interfaceRoute(path)) return;
      const main = root.querySelector<HTMLElement>(
        "main:not([aria-busy=true]):not(.ko-loading-screen):not(.ko-game-shell)",
      );
      if (main && entered !== main && !main.closest(".ko-game-shell")) {
        entered = main;
        const lead = main.querySelector<HTMLElement>("h1");
        if (lead && path !== "/")
          play(
            lead,
            reduced()
              ? [{ opacity: 0.8 }, { opacity: 1 }]
              : [
                  { opacity: 0.8, translate: `${direction * 6}px 3px` },
                  { opacity: 1, translate: "0px 0px" },
                ],
            INTERFACE_TIMING.enter,
          );
        if (path === "/")
          main
            .querySelectorAll<HTMLElement>(
              ".ko-main-menu__logo,.ko-launch-banner__art,.ko-battle-mode-button__copy",
            )
            .forEach((n, i) =>
              play(
                n,
                reduced()
                  ? [{ opacity: 0.8 }, { opacity: 1 }]
                  : [
                      { opacity: 0.8, translate: "0px 5px" },
                      { opacity: 1, translate: "0px 0px" },
                    ],
                180,
                i * 35,
              ),
            );
      }
      // Stage each panel once per route, so polling never replays entrances.
      if (main && interfaceRoute(path)) {
        const panels = main.querySelectorAll<HTMLElement>(
          ".ko-page-content > section,.ko-page-content > nav,.ko-page-content > .grid,.ko-settings-panel,.ko-decks__columns > aside,.ko-decks__columns > section,.ko-wardrobe__layout,.ko-mode-deck,.ko-battle-mode-grid,.ko-home-launch,.ko-home-learning,.ko-main-menu__notice",
        );
        let index = 0;
        panels.forEach(node => {
          if (staged.has(node)) return;
          const r = node.getBoundingClientRect();
          if (!r.width || !r.height || r.top > innerHeight || r.bottom < 0) return;
          staged.add(node);
          play(node, reduced()
            ? [{opacity:.85},{opacity:1}]
            : [{opacity:.5,translate:"0px 8px"},{opacity:1,translate:"0px 0px"}],
            240, Math.min(index++ * 24, 96));
          node.dataset.uiEntrance = path;
        });
      }
      root
        .querySelectorAll<HTMLElement>(
          "[data-ui-motion-state],[aria-pressed],[role=tab][aria-selected],[role=alert]",
        )
        .forEach((node) => {
          if (node.closest(".ko-game-shell")) return;
          const value =
            node.dataset.uiMotionState ??
            (node.getAttribute("role") === "alert"
              ? "ERROR:" + node.textContent?.slice(0, 180)
              : (node.getAttribute("aria-pressed") ??
                    node.getAttribute("aria-selected")) === "true"
                ? "ACTIVE"
                : "");
          const old = seen.get(node);
          seen.set(node, value);
          if (
            (old === undefined &&
              !node.hasAttribute("data-ui-mount-motion") &&
              node.getAttribute("role") !== "alert") ||
            old === value ||
            !value
          )
            return;
          const kind = value.split(":")[0] as InterfaceCue;
          if (
            !["ACTIVE", "PENDING", "SUCCESS", "ERROR", "REPLACE"].includes(kind)
          )
            return;
          play(
            node,
            interfaceFrames(kind, reduced()),
            kind === "SUCCESS" ? 320 : kind === "REPLACE" ? 220 : 160,
          );
        });
    };
    const details = (event: Event) => {
      if (!interfaceRoute(path)) return;
      const node = event.target;
      if (
        node instanceof HTMLDetailsElement &&
        node.open &&
        !node.closest(".ko-game-shell")
      ) {
        const content = node.querySelector<HTMLElement>("div,ol,section,p");
        if (content) play(content, [{ opacity: 0.7 }, { opacity: 1 }], 140);
      }
    };
    root.addEventListener("toggle", details, true);
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };
    const preference = () => {
      clearInterfaceFlights();
      document.documentElement.dataset.uiReduced = String(reduced());
      running.forEach((a) => a.cancel());
      running.clear();
      schedule();
    };
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    preference();
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (r) =>
            !(
              r.target instanceof Element ? r.target : r.target.parentElement
            )?.closest(".ko-game-shell"),
        )
      )
        schedule();
    });
    if (interfaceRoute(path))
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          "data-ui-motion-state",
          "aria-busy",
          "aria-pressed",
          "aria-selected",
        ],
      });
    window.addEventListener("ko-combat-preferences", preference);
    media.addEventListener("change", preference);
    return () => {
      clearInterfaceFlights();
      root.removeEventListener("toggle", details, true);
      observer.disconnect();
      cancelAnimationFrame(frame);
      running.forEach((a) => a.cancel());
      window.removeEventListener("ko-combat-preferences", preference);
      media.removeEventListener("change", preference);
    };
  }, [path]);
  return null;
}

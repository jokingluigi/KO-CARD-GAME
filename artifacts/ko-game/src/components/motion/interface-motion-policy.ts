export type InterfaceCue =
  "ACTIVE" | "PENDING" | "SUCCESS" | "ERROR" | "REPLACE";
export const INTERFACE_TIMING = {
  press: 90,
  select: 140,
  enter: 180,
  replace: 220,
  success: 320,
  error: 220,
} as const;
const routes = [
  "/",
  "/online",
  "/online/quick",
  "/online/friendly",
  "/decks",
  "/collection",
  "/cosmetics",
  "/shop",
  "/packs",
  "/daily-quests",
  "/attendance",
  "/player-notebook",
];
export function interfaceRoute(path: string) {
  return routes.includes(path.split("?")[0]);
}
export function interfaceDirection(before: string, after: string) {
  const a = routes.indexOf(before.split("?")[0]),
    b = routes.indexOf(after.split("?")[0]);
  return a < 0 || b < 0 || a === b ? 0 : b > a ? 1 : -1;
}
export function interfaceFrames(
  kind: InterfaceCue,
  reduced: boolean,
): Keyframe[] {
  if (kind === "REPLACE")
    return reduced
      ? [{ opacity: 0.8 }, { opacity: 1 }]
      : [
          { opacity: 0.65, filter: "brightness(.9)" },
          { opacity: 1, filter: "brightness(1)" },
        ];
  const color =
    kind === "ERROR" ? "#bd796b" : kind === "SUCCESS" ? "#e4c983" : "#c9ad70";
  return [
    {
      boxShadow: `inset 0 0 0 ${reduced ? 1 : 2}px ${color}`,
      filter: kind === "PENDING" ? "brightness(.95)" : "brightness(1.08)",
    },
    { boxShadow: "inset 0 0 0 0px transparent", filter: "brightness(1)" },
  ];
}

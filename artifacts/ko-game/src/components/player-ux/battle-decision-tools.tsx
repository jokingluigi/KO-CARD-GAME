import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { GameState } from "@/game";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import {
  basicAttackForecast,
  FORECAST_LIMITATION,
} from "./attack-forecast-policy";
type Nodes = RefObject<Map<string, HTMLDivElement>>;
/** Fit actual text dimensions, including larger reading settings, inside the viewport. */
function AnchoredNotice({
  node,
  children,
  testId,
  className,
  role,
}: {
  node: HTMLElement | null;
  children: ReactNode;
  testId: string;
  className: string;
  role?: "status";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    const bubble = ref.current;
    if (!node || !bubble) return;
    const place = () => {
      if (!node.isConnected) {
        setPosition(null);
        return;
      }
      const anchor = node.getBoundingClientRect(),
        box = bubble.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(
          innerWidth - box.width - 8,
          anchor.x + anchor.width / 2 - box.width / 2,
        ),
      );
      const preferred =
        anchor.top >= box.height + 16
          ? anchor.top - box.height - 8
          : anchor.bottom + 8;
      const top = Math.max(
        8,
        Math.min(innerHeight - box.height - 8, preferred),
      );
      setPosition((old) =>
        old?.left === left && old.top === top ? old : { left, top },
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(bubble);
    observer.observe(node);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [node, children]);
  if (!node) return null;
  return createPortal(
    <aside
      ref={ref}
      role={role}
      data-testid={testId}
      className={className}
      style={{
        ...position,
        visibility: position ? "visible" : "hidden",
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "calc(100dvh - 16px)",
        overflow: "hidden",
      }}
    >
      {children}
    </aside>,
    document.body,
  );
}

export function ForecastText({
  state,
  attackerId,
  targetId,
}: {
  state: GameState;
  attackerId: string;
  targetId: string;
}) {
  const x = basicAttackForecast(state, attackerId, targetId);
  return x?.blockedReason ? (
    <strong>{x.blockedReason}</strong>
  ) : x ? (
    <>
      <strong>
        기본 피해 {x.damage} · 반격 {x.counter}
      </strong>
      <br />
      대상 체력 {x.targetHealth} · 내 선수 체력 {x.selfHealth}
      {x.targetFalls && (
        <span className="block text-amber-200">
          {x.champion
            ? "기본 피해가 현재 체력 이상"
            : "기본 교환 시 대상 리타이어 예상"}
        </span>
      )}
      {x.warnings.map((warning) => (
        <span key={warning} className="mt-1 block text-amber-200">
          {warning}
        </span>
      ))}
      {x.selfFalls && (
        <span className="block text-red-200">
          기본 교환 시 내 선수 리타이어 예상
        </span>
      )}
    </>
  ) : (
    <>특수 대상은 기본 교환을 계산하지 않아요. 카드 정보를 확인하세요.</>
  );
}
export function AttackForecast({
  state,
  attackerId,
  valid,
  board,
  champion,
  enabled,
}: {
  state: GameState;
  attackerId: string | null;
  valid: Set<string>;
  board: Nodes;
  champion: RefObject<HTMLDivElement | null>;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(
      null,
    );
  const signature = [...valid].join("|");
  useEffect(() => {
    setOpen(false);
    setHover(null);
  }, [state.gameId, state.turn, attackerId, enabled]);
  useEffect(() => {
    if (!attackerId || !enabled) return;
    const move = (e: { clientX: number; clientY: number }) => {
      const entry = [
        ...board.current.entries(),
        [state.players[1].id, champion.current] as const,
      ].find(([id, node]) => {
        if (!valid.has(id) || !node) return false;
        const r = node.getBoundingClientRect();
        return (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        );
      });
      setHover((old) => {
        if (!entry) return null;
        if (old?.id === entry[0]) return old;
        const r = entry[1]!.getBoundingClientRect();
        return {
          id: entry[0],
          x: Math.min(Math.max(8, r.x), Math.max(8, innerWidth - 220)),
          y: r.y > 132 ? r.y - 118 : Math.min(innerHeight - 116, r.bottom + 4),
        };
      });
    };
    const focus = (e: FocusEvent) => {
      if (e.target instanceof Element) {
        const r = e.target.getBoundingClientRect();
        move({ clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 });
      }
    };
    const clear = () => setHover(null);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("focusin", focus);
    window.addEventListener("blur", clear);
    window.addEventListener("resize", clear);
    window.addEventListener("scroll", clear, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("focusin", focus);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", clear);
      window.removeEventListener("scroll", clear, true);
    };
  }, [enabled, attackerId, signature, state, board, champion]);
  if (!attackerId || !enabled) return null;
  const name = (id: string) => {
    if (id === state.players[1].id) return "상대 챔피언";
    const c = state.players[1].board.find((c) => c?.instanceId === id);
    return (
      state.cardPool?.find((d) => d.id === c?.definitionId)?.name ?? "상대 선수"
    );
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setHover(null);
          setOpen(true);
        }}
        aria-label="공격 결과 미리보기"
      >
        교환 예상
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="!z-[210]"
          className="!z-[220] max-h-[85dvh] overflow-auto bg-neutral-950 text-white"
        >
          <DialogTitle>기본 교환 예상</DialogTitle>
          <DialogDescription>{FORECAST_LIMITATION}</DialogDescription>
          <div className="space-y-3">
            {[...valid].map((id) => (
              <article
                key={id}
                className="border border-neutral-700 p-3 text-sm"
              >
                <h3 className="mb-1 text-amber-200">{name(id)}</h3>
                <ForecastText
                  state={state}
                  attackerId={attackerId}
                  targetId={id}
                />
              </article>
            ))}
          </div>
          <button
            type="button"
            className="min-h-11 border border-amber-700"
            onClick={() => setOpen(false)}
          >
            닫기
          </button>
        </DialogContent>
      </Dialog>
      {!open && hover && (
        <AnchoredNotice
          node={
            hover.id === state.players[1].id
              ? champion.current
              : (board.current.get(hover.id) ?? null)
          }
          testId="attack-forecast"
          className="ko-local-feedback pointer-events-none fixed z-[195] w-[240px] border border-amber-700 bg-black/95 p-2 text-xs text-white shadow-lg"
        >
          <p className="mb-1 text-amber-200">
            {name(hover.id)} · 기본 교환 예상
          </p>
          <ForecastText
            state={state}
            attackerId={attackerId}
            targetId={hover.id}
          />
          <small className="text-neutral-400">
            발동 효과 등에 따라 달라질 수 있음
          </small>
        </AnchoredNotice>
      )}
    </>
  );
}
export function LocalActionFeedback({
  message,
  node,
}: {
  message: string | null;
  node: HTMLElement | null;
}) {
  return message && node ? (
    <AnchoredNotice
      node={node}
      testId="local-action-reason"
      role="status"
      className="pointer-events-none fixed z-[196] w-[220px] border border-amber-700 bg-black/95 p-3 text-sm text-amber-100 shadow-lg"
    >
      {message}
    </AnchoredNotice>
  ) : null;
}

const guideText = {
  SUMMON: "선택한 선수를 빈 아군 슬롯에 놓으세요. 필드 밖에 놓으면 취소돼요.",
  ATTACK:
    "밝게 표시된 상대를 선택하세요. 교환 예상에서 피해와 반격을 먼저 확인할 수 있어요.",
  TARGET:
    "밝은 대상만 선택할 수 있어요. 선택 취소가 표시되면 확정 전에 취소할 수 있어요.",
  ACTIVE:
    "액티브는 이 선수가 필드에 있는 동안 총 1회예요. 사용 전 카드 설명을 확인하세요.",
};
export type GuideKind = keyof typeof guideText;
export function useBattleContextGuide(kind: GuideKind | null) {
  const [seen, setSeen] = useState<GuideKind[]>(() => {
    try {
      const x = JSON.parse(localStorage.getItem("ko-context-guide-v1") ?? "[]");
      return Array.isArray(x)
        ? x.filter((k) => Object.hasOwn(guideText, k))
        : [];
    } catch {
      return [];
    }
  });
  const previous = useRef(kind);
  useEffect(() => {
    const old = previous.current;
    previous.current = kind;
    if (old && old !== kind)
      setSeen((items) => {
        const next = [...new Set([...items, old])];
        try {
          localStorage.setItem("ko-context-guide-v1", JSON.stringify(next));
        } catch {}
        return next;
      });
  }, [kind]);
  const dismiss = () => {
    if (!kind) return;
    const next = [...new Set([...seen, kind])];
    setSeen(next);
    try {
      localStorage.setItem("ko-context-guide-v1", JSON.stringify(next));
    } catch {}
  };
  return {
    text: kind && !seen.includes(kind) ? guideText[kind] : null,
    dismiss,
  };
}

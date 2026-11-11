import { useEffect, useState } from "react";

/** A single intro-deadline wakeup replaces polling the complete online board. */
export function useDeadlineReached(deadline: number | null, offset: number) {
  const [, setNow] = useState(Date.now);
  useEffect(() => {
    if (deadline === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const wait = deadline - current - offset;
      if (wait > 0)
        timer = setTimeout(update, Math.min(wait + 1, 2_147_483_647));
    };
    update();
    const visible = () => {
      if (!document.hidden) update();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", update);
    };
  }, [deadline, offset]);
  return deadline === null || Date.now() + offset >= deadline;
}

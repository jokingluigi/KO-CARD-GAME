import { useEffect, useState } from "react";

const KEY = "ko-inspect-hint-shown";
/** First few battles: a quiet one-line reminder of how to read cards (Hearthstone-style hold / hover). */
export function InspectHint() {
  const [text, setText] = useState("");
  useEffect(() => {
    let count = 0;
    try { count = Number(localStorage.getItem(KEY) ?? 0) || 0; } catch { /* ignore */ }
    if (count >= 3) return;
    try { localStorage.setItem(KEY, String(count + 1)); } catch { /* ignore */ }
    const mouse = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    setText(mouse ? "카드에 마우스를 올려 두면 자세히 볼 수 있어요" : "카드를 꾹 누르면 자세히 볼 수 있어요 · 손패를 누르면 크게 펼쳐져요");
    const timer = window.setTimeout(() => setText(""), 6500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!text) return null;
  return <div className="ko-inspect-hint" role="status">{text}</div>;
}

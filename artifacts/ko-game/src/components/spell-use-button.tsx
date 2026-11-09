import { useEffect, useRef } from "react";
/** A stationary press action; small finger movement inside the button remains a tap. */
export function SpellUseButton({
  disabled,
  onUse,
  title,
}: {
  disabled: boolean;
  onUse: () => void;
  title: string;
}) {
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    if (disabled) pointer.current = null;
  }, [disabled]);
  useEffect(() => {
    const clear = () => {
      pointer.current = null;
    };
    window.addEventListener("blur", clear);
    window.addEventListener("resize", clear);
    return () => {
      clear();
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", clear);
    };
  }, []);
  return (
    <button
      type="button"
      className="ko-technique-use-button"
      title={title}
      disabled={disabled}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (
          disabled ||
          event.button !== 0 ||
          !event.isPrimary ||
          pointer.current !== null
        )
          return;
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        pointer.current = null;
      }}
      onLostPointerCapture={() => {
        pointer.current = null;
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          !disabled &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        )
          onUse();
      }}
      onClick={(event) => {
        event.stopPropagation();
        // Pointer activation already happened on release. Keep native keyboard/AT clicks.
        if (event.detail === 0 && !disabled) onUse();
      }}
    >
      사용
    </button>
  );
}

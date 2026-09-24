export function shouldToggleAltInfo(
  event: Pick<KeyboardEvent, "type" | "key" | "repeat" | "ctrlKey" | "metaKey" | "shiftKey">,
  focusIsEditable: boolean,
): boolean {
  return (
    event.type === "keydown" &&
    event.key === "Alt" &&
    !event.repeat &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !focusIsEditable
  );
}

export function shouldPreventAltWheel(event: Pick<WheelEvent, "altKey">): boolean {
  return event.altKey;
}
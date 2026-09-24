export function shouldToggleAltInfo(
  event: Pick<KeyboardEvent, "key" | "repeat" | "ctrlKey" | "metaKey" | "shiftKey">,
  focusIsEditable: boolean,
): boolean {
  return (
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
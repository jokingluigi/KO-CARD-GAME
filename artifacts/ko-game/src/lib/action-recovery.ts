/** Never replay a mutating action when its acknowledgement is missing. */
export function watchActionAcknowledgement(
  input: {
    stillPending: () => boolean;
    resync: () => void;
    reconnect: () => void;
  },
  delay = 8000,
) {
  let active = true;
  const first = setTimeout(() => {
    if (active && input.stillPending()) input.resync();
  }, delay);
  const second = setTimeout(() => {
    if (active && input.stillPending()) input.reconnect();
  }, delay * 2);
  return () => {
    active = false;
    clearTimeout(first);
    clearTimeout(second);
  };
}

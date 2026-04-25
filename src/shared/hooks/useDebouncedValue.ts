import { useEffect, useState } from "react";

/**
 * Returns `value` debounced by `delayMs`. Use to throttle filter inputs so
 * the rendered list doesn't churn while the user is still typing.
 */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

import { useEffect, useState } from 'react';

/**
 * Returns the given value after it has stopped changing for `delayMs`.
 * Used to debounce server-side search inputs so each keystroke does not
 * trigger a GraphQL request.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

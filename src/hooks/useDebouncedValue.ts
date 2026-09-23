"use client";

import { useEffect, useState } from "react";

/** Debounces a value - the basis for autosaving forms without a Save button. */
export function useDebouncedValue<T>(value: T, delay = 600): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

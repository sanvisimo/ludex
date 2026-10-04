import { useEffect, useState } from 'react';

/**
 * Il valore, ma solo quando smette di cambiare per `ms` millisecondi. Ogni
 * cambiamento riparte da capo: chi scrive «hollow» fa una richiesta, non sei.
 */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return debounced;
}

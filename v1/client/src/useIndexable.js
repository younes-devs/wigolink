import { useEffect } from 'react';

// Les pages légales restent explicitement indexables. La politique générale par
// route est également appliquée par RouteSeoPolicy pour protéger l'espace privé.
export function useIndexable() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]');
    const prev = meta?.getAttribute('content');
    meta?.setAttribute('content', 'index, follow');
    return () => { if (prev) meta?.setAttribute('content', prev); };
  }, []);
}

import { useEffect } from 'react';

// index.html porte un `noindex` global (l'app authentifiée n'est jamais du contenu
// public — voir docs/prd-seo.md §1). Les deux seules pages publiques exposées par le
// SPA (CGU, Politique de confidentialité) doivent rester indexables : ce hook bascule
// la balise robots le temps du montage, et la restaure en quittant la page.
export function useIndexable() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]');
    const prev = meta?.getAttribute('content');
    meta?.setAttribute('content', 'index, follow');
    return () => { if (prev) meta?.setAttribute('content', prev); };
  }, []);
}

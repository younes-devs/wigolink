// Gestion du thème clair/sombre (PRD UI/UX U9). Le thème initial est posé par un script
// inline dans index.html (avant le rendu) ; ce module ne gère que la bascule manuelle.
const KEY = 'wigofly_theme';
const THEME_COLORS = { light: '#0a6cf5', dark: '#0e1116' };

export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

// Synchronise la meta theme-color (barre d'état mobile) avec le thème appliqué au chargement.
// Le script inline d'index.html pose data-theme mais ne peut pas toucher la meta (pas encore
// dans le DOM à ce moment) — on le fait ici, au démarrage de l'app.
export function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[getTheme()];
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(KEY, theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[theme] || THEME_COLORS.light;
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

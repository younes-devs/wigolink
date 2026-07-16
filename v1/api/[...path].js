// Point d'entree Vercel pour toutes les routes /api/*. Express conserve les routes
// existantes et Vercel ne lance pas le listener local grace a process.env.VERCEL.
export { default } from '../server/index.js';

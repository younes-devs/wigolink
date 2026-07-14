// Modèle escrow « provider-ready » (PRD Production P0.4).
//
// V1 fonctionne avec un escrow SIMULÉ : aucun mouvement d'argent réel n'a lieu, seul
// l'état est suivi côté serveur. Mais le domaine est modélisé dès maintenant pour brancher
// un vrai prestataire (Stripe Connect, Mangopay, Lemonway) sans réécrire la machine à états :
//   - `provider`     : quel prestataire détient les fonds ('simulated' tant qu'aucun n'est branché) ;
//   - `providerRef`  : identifiant de l'intention de paiement / séquestre côté prestataire
//                      (paymentIntentId Stripe, etc.), null en simulé ;
//   - `state`        : held → frozen (litige) → released | refunded ;
//   - `amount`       : total séquestré (rémunération voyageur + commission) ;
//   - `travelerPay`  : part reversée au voyageur à la livraison validée ;
//   - `commission`   : part plateforme ;
//   - horodatages    : heldAt, frozenAt, releasedAt, refundedAt selon la transition.
//
// Quand un vrai prestataire sera branché, `createEscrow` appellera son API pour créer
// l'intention de paiement et renseignera `providerRef`, et `transitionEscrow('released'|'refunded')`
// déclenchera capture/remboursement — sans changer les appelants.

// Prestataire actif. 'simulated' par défaut : aucun mouvement réel. Surchargé plus tard
// par une variable d'environnement (PAYMENT_PROVIDER) une fois l'intégration prête.
export const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || 'simulated';

// États terminaux : plus aucune transition possible ensuite.
const TERMINAL = new Set(['released', 'refunded']);

// Horodatage stampé pour chaque état atteint (imputabilité + audit paiement, P0.4/P0.8).
const STATE_TIMESTAMP = {
  held: 'heldAt',
  frozen: 'frozenAt',
  released: 'releasedAt',
  refunded: 'refundedAt',
};

export function createEscrow({ travelerPay, commission }) {
  const amount = Math.round((travelerPay + commission) * 100) / 100;
  return {
    provider: PAYMENT_PROVIDER,
    providerRef: null,
    amount,
    travelerPay,
    commission,
    state: 'held',
    heldAt: Date.now(),
  };
}

// Transition d'état centralisée : garantit qu'un horodatage cohérent est toujours posé
// (avant, un remboursement ne laissait aucune trace temporelle). Retourne l'escrow muté.
export function transitionEscrow(escrow, state, at = Date.now()) {
  if (!escrow) return escrow;
  if (!STATE_TIMESTAMP[state]) throw new Error(`État escrow inconnu : ${state}`);
  escrow.state = state;
  escrow[STATE_TIMESTAMP[state]] = at;
  return escrow;
}

export function isEscrowClosed(escrow) {
  return !!escrow && TERMINAL.has(escrow.state);
}

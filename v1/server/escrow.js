// Structure historique conservee pour relire les anciennes operations.
// Elle modelise le cycle interne d'un paiement, pas un sequestre reglemente.
//   - `provider`     : quel prestataire détient les fonds ('simulated' tant qu'aucun n'est branché) ;
//   - `providerRef`  : identifiant de l'intention de paiement cote prestataire ;
//   - `state`        : held → frozen (litige) → released | refunded ;
//   - `amount`       : montant total de l'operation ;
//   - `travelerPay`  : part reversée au voyageur à la livraison validée ;
//   - `commission`   : part plateforme ;
//   - horodatages    : heldAt, frozenAt, releasedAt, refundedAt selon la transition.
//
// Stripe et les versements manuels sont pilotes par leurs services dedies. Ce module
// ne declenche aucun mouvement d'argent.
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

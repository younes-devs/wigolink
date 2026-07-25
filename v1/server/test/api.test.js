// Suite d'intégration boîte noire : tourne contre une vraie instance du serveur (port et
// data.json dédiés, voir helpers.js), exactement les scénarios vérifiés à la main en curl
// tout au long de ce projet. Objectif : que ces vérifications ne dépendent plus de la
// mémoire de qui a testé quoi la dernière fois.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, api, loginAs, completeTraining, registerKycVerifiedUser, TINY_PNG } from './helpers.js';

// Comptes de démo connectés une seule fois pour toute la suite : rateLimit() compte
// aussi les connexions réussies (pas seulement les échecs), donc chaque test qui se
// reconnecte à la volée grignote le même quota partagé — au-delà d'une dizaine de tests,
// ça déclenchait un vrai 429 sur des identifiants pourtant corrects.
const tokens = {};
before(async () => {
  await startServer();
  tokens.fatima = await loginAs('fatima@demo.wigofly.app');
  tokens.karim = await loginAs('karim@demo.wigofly.app');
  tokens.mehdi = await loginAs('mehdi@demo.wigofly.app');
  tokens.admin = await loginAs('admin@demo.wigofly.app');
});
after(stopServer);

test('GET /api/config répond', async () => {
  const { status, body } = await api('/config');
  assert.equal(status, 200);
  assert.equal(body.demo, true);
});

test('GET /api/health repond sans exposer de donnees sensibles', async () => {
  const { status, body } = await api('/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.database, 'local');
  assert.ok(Date.parse(body.at));
});

test('connexion : identifiants valides vs invalides', async () => {
  const ok = await api('/auth/login', { method: 'POST', body: { email: 'fatima@demo.wigofly.app', password: 'demo1234' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.ok(ok.body.sessionExpiresAt >= Date.now() + 23 * 60 * 60 * 1000);
  assert.ok(ok.body.sessionExpiresAt <= Date.now() + 24 * 60 * 60 * 1000 + 2_000);

  const remembered = await api('/auth/login', {
    method: 'POST', body: { email: 'fatima@demo.wigofly.app', password: 'demo1234', rememberMe: true },
  });
  assert.equal(remembered.status, 200);
  assert.equal(remembered.body.sessionDurationDays, 30);
  assert.ok(remembered.body.sessionExpiresAt >= Date.now() + 29 * 24 * 60 * 60 * 1000);
  assert.ok(remembered.body.sessionExpiresAt <= Date.now() + 30 * 24 * 60 * 60 * 1000 + 2_000);

  const badPassword = await api('/auth/login', { method: 'POST', body: { email: 'fatima@demo.wigofly.app', password: 'wrong' } });
  assert.equal(badPassword.status, 401);

  const badEmail = await api('/auth/login', { method: 'POST', body: { email: 'inconnu@exemple.com', password: 'demo1234' } });
  assert.equal(badEmail.status, 401);
});

test('auth : un compte email reste bloque jusqu a sa verification', async () => {
  const email = `unverified-${Date.now()}@exemple.com`;
  const password = 'motdepasse123';
  const registration = await api('/auth/register', {
    method: 'POST',
    body: { name: 'Compte non verifie', email, password, cguAccepted: true },
  });
  assert.equal(registration.status, 200);
  assert.equal(registration.body.token, undefined);

  const loginBeforeVerification = await api('/auth/login', {
    method: 'POST', body: { email, password },
  });
  assert.equal(loginBeforeVerification.status, 200);
  assert.equal(loginBeforeVerification.body.needsVerification, true);
  assert.equal(loginBeforeVerification.body.token, undefined);

  const code = loginBeforeVerification.body.demoHint.match(/\d{6}/)[0];
  const verification = await api('/auth/verify-email', {
    method: 'POST', body: { email, code },
  });
  assert.equal(verification.status, 200);
  assert.ok(verification.body.token);

  const me = await api('/me', { token: verification.body.token });
  assert.equal(me.status, 200);
});

test('IDOR : un tiers ne peut pas lire la transaction d\'autrui', async () => {
  const fatima = tokens.fatima;
  const karim = tokens.karim;
  const mehdi = tokens.mehdi; // tiers, non partie à la transaction
  await completeTraining(karim);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Huile argan IDOR test', categoryId: 'argan', categoryLabel: "Huile d'argan",
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 30, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 10, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(listing.status, 200, JSON.stringify(listing.body));

  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const txId = accepted.body.transaction.id;

  const asParty = await api(`/transactions/${txId}`, { token: fatima });
  assert.equal(asParty.status, 200);

  const asOutsider = await api(`/transactions/${txId}`, { token: mehdi });
  assert.equal(asOutsider.status, 403);
});

test('un expéditeur ne peut pas accepter sa propre annonce', async () => {
  const fatima = tokens.fatima;
  await completeTraining(fatima);
  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Auto-acceptation test', categoryId: 'miel', categoryLabel: 'Miel',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 20, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 8, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(listing.status, 200);

  const selfAccept = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: fatima });
  assert.equal(selfAccept.status, 400);
  assert.match(selfAccept.body.error, /propre annonce/);
});

test('une catégorie en liste noire est refusée à la publication', async () => {
  const fatima = tokens.fatima;
  const res = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Compléments alimentaires', categoryId: 'complements', categoryLabel: 'Compléments',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 20, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 8, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.verdict, 'blacklisted');
});

test('pré-contrôle annonce : détecte publication directe, revue et blocages', async () => {
  const fatima = tokens.fatima;
  const base = {
    title: 'Précontrôle safran', categoryId: 'safran', categoryLabel: 'Safran',
    description: 'Description suffisamment longue pour le précontrôle', weightKg: 0.1,
    valueEur: 20, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
    travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
  };

  const ok = await api('/listings/preflight', { method: 'POST', token: fatima, body: base });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.preflight.status, 'published');
  assert.equal(ok.body.preflight.canSubmit, true);

  const gray = await api('/listings/preflight', {
    method: 'POST', token: fatima,
    body: { ...base, categoryId: `nouveau-produit-${Date.now()}`, categoryLabel: 'Nouveau produit' },
  });
  assert.equal(gray.body.preflight.status, 'pending_review');
  assert.ok(gray.body.preflight.warnings.includes('review'));

  const blocked = await api('/listings/preflight', {
    method: 'POST', token: fatima,
    body: { ...base, categoryId: 'medicaments', categoryLabel: 'Médicaments', valueEur: 999999 },
  });
  assert.equal(blocked.body.preflight.status, 'blocked');
  assert.equal(blocked.body.preflight.canSubmit, false);
  assert.ok(blocked.body.preflight.blockers.includes('category'));
  assert.ok(blocked.body.preflight.blockers.includes('limit'));
});

test('parcours complet : annonce → escrow → scellage → double validation → livraison → notation', async () => {
  const fatima = tokens.fatima;
  const karim = tokens.karim;
  await completeTraining(karim); // idempotent — indépendant de l'ordre des tests précédents

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Parcours complet test', categoryId: 'safran', categoryLabel: 'Safran',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 0.2,
      valueEur: 90, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 12, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(listing.status, 200);

  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  assert.equal(accepted.status, 200);
  const tx = accepted.body.transaction;
  assert.equal(tx.status, 'accepted');
  assert.equal(tx.escrow.state, 'held');
  const expectedTotal = Math.round((12 + 12 * 0.18) * 100) / 100;
  assert.equal(tx.escrow.amount, expectedTotal);
  // Modèle escrow « provider-ready » (P0.4) : le domaine porte dès maintenant les champs
  // qui permettront de brancher un vrai prestataire, même si V1 est simulé.
  assert.equal(tx.escrow.provider, 'simulated');
  assert.equal(tx.escrow.providerRef, null);
  assert.ok(tx.escrow.heldAt, 'l\'escrow séquestré doit être horodaté (heldAt)');

  const sealed = await api(`/transactions/${tx.id}/sealing-video`, {
    method: 'POST', token: fatima, body: { simulated: true, geo: '33.57311, -7.58984 (±25 m)' },
  });
  assert.equal(sealed.status, 200);
  assert.equal(sealed.body.transaction.status, 'sealed');
  assert.equal(sealed.body.transaction.sealingVideo.geo, '33.57311, -7.58984 (±25 m)');

  const detailForSender = await api(`/transactions/${tx.id}`, { token: fatima });
  const pickupCode = detailForSender.body.transaction.pickupCode;
  assert.ok(pickupCode);

  const pickedUp = await api(`/transactions/${tx.id}/confirm-pickup`, { method: 'POST', token: karim, body: { code: pickupCode } });
  assert.equal(pickedUp.status, 200);
  assert.equal(pickedUp.body.transaction.status, 'in_transit');

  const detailForTraveler = await api(`/transactions/${tx.id}`, { token: karim });
  const deliveryCode = detailForTraveler.body.transaction.deliveryCode;
  assert.ok(deliveryCode);

  const delivered = await api(`/transactions/${tx.id}/confirm-delivery`, { method: 'POST', token: fatima, body: { code: deliveryCode } });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.transaction.status, 'released');
  assert.equal(delivered.body.transaction.escrow.state, 'released');
  // La libération pose un horodatage (audit paiement P0.4/P0.8) et n'a jamais été un remboursement.
  assert.ok(delivered.body.transaction.escrow.releasedAt, 'la libération doit être horodatée (releasedAt)');
  assert.equal(delivered.body.transaction.escrow.refundedAt, undefined);

  const cleanRating = await api(`/transactions/${tx.id}/rate`, {
    method: 'POST', token: fatima, body: { targetId: 'u-karim', stars: 5, comment: 'Voyageur fiable, colis intact' },
  });
  assert.equal(cleanRating.status, 200);

  const leakedRating = await api(`/transactions/${tx.id}/rate`, {
    method: 'POST', token: karim, body: { targetId: 'u-fatima', stars: 5, comment: 'Contactez-moi au 0612345678' },
  });
  assert.equal(leakedRating.status, 400);

  const reviews = await api('/users/u-karim/reviews', { token: fatima });
  assert.equal(reviews.status, 200);
  assert.ok(reviews.body.reviews.some((r) => r.comment === 'Voyageur fiable, colis intact'));
});

test('dashboard fraude : réservé aux admins', async () => {
  const karim = tokens.karim;
  const admin = tokens.admin;

  const asTraveler = await api('/admin/fraud', { token: karim });
  assert.equal(asTraveler.status, 403);

  const asAdmin = await api('/admin/fraud', { token: admin });
  assert.equal(asAdmin.status, 200);
  assert.ok(Array.isArray(asAdmin.body.linkedAccounts));
  assert.ok(Array.isArray(asAdmin.body.repeatPairs));
});

test('centre opérations admin : agrège priorités et risques', async () => {
  const karim = tokens.karim;
  const admin = tokens.admin;

  const asTraveler = await api('/admin/ops', { token: karim });
  assert.equal(asTraveler.status, 403);

  const asAdmin = await api('/admin/ops', { token: admin });
  assert.equal(asAdmin.status, 200, JSON.stringify(asAdmin.body));
  assert.ok(['clear', 'watch', 'critical'].includes(asAdmin.body.ops.health.status));
  assert.equal(typeof asAdmin.body.ops.health.reviewOpen, 'number');
  assert.equal(typeof asAdmin.body.ops.health.riskSignals, 'number');
  assert.equal(typeof asAdmin.body.ops.health.offersActive, 'number');
  assert.equal(typeof asAdmin.body.ops.health.offersAtRisk, 'number');
  assert.ok(asAdmin.body.ops.tasks.some((t) => t.id === 'review-disputes'));
  assert.ok(asAdmin.body.ops.tasks.some((t) => t.id === 'kyc-overdue'));
  assert.ok(asAdmin.body.ops.tasks.some((t) => t.id === 'offer-watch'));
  assert.ok(Array.isArray(asAdmin.body.ops.latest.reviewQueue));
  assert.ok(Array.isArray(asAdmin.body.ops.latest.kyc));
  assert.ok(Array.isArray(asAdmin.body.ops.latest.offers));
});

test('anti brute-force : le login se bloque après trop de tentatives', async () => {
  // Email dédié à ce test, jamais réutilisé ailleurs dans la suite : rateLimit() est
  // vérifié avant même de chercher l'utilisateur, donc épuiser le quota d'un compte de
  // démo partagé (ex. fatima) ferait échouer tous les tests suivants qui s'y connectent.
  const email = 'rate-limit-test@exemple.com';
  let last;
  for (let i = 0; i < 11; i++) {
    last = await api('/auth/login', { method: 'POST', body: { email, password: 'mauvais-mot-de-passe' } });
  }
  assert.equal(last.status, 429);
});

test('KYC : soumission puis approbation admin fait passer le statut à vérifié', async () => {
  const n = Math.floor(Math.random() * 1e6);
  const email = `kyctest${n}@exemple.com`;
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { name: 'Testeur KYC', email, password: 'demo1234', cguAccepted: true },
  });
  assert.equal(reg.status, 200);
  const code = reg.body.demoHint.match(/\d{6}/)[0];

  const verify = await api('/auth/verify-email', { method: 'POST', body: { email, code } });
  assert.equal(verify.status, 200);
  const token = verify.body.token;

  const me = await api('/me', { token });
  assert.equal(me.body.user.kycStatus, 'none');

  const submit = await api('/kyc/submit', {
    method: 'POST', token,
    body: {
      legalName: 'Testeur KYC Complet', birthDate: '1990-01-01', documentType: 'passport',
      selfiePhoto: TINY_PNG, idFrontPhoto: TINY_PNG,
    },
  });
  assert.equal(submit.status, 200, JSON.stringify(submit.body));

  const meAfterSubmit = await api('/me', { token });
  assert.equal(meAfterSubmit.body.user.kycStatus, 'pending');

  const admin = tokens.admin;
  const queue = await api('/admin/kyc?status=pending', { token: admin });
  assert.equal(queue.status, 200);
  const submission = queue.body.submissions.find((s) => s.user?.email === email);
  assert.ok(submission, 'la soumission doit apparaître dans la file admin');

  const decide = await api(`/admin/kyc/${submission.id}/decide`, {
    method: 'POST', token: admin, body: { decision: 'approve' },
  });
  assert.equal(decide.status, 200);

  const audit = await api('/admin/audit-logs', { token: admin });
  assert.ok(audit.body.logs.some((l) =>
    l.action === 'kyc.approve' && l.targetType === 'kyc_submission' && l.targetId === submission.id
  ));
  const auditLimited = await api('/admin/audit-logs?limit=1', { token: admin });
  assert.equal(auditLimited.body.logs.length, 1);
  assert.equal(auditLimited.body.logs[0].actor.id, 'u-admin');

  const meAfterApproval = await api('/me', { token });
  assert.equal(meAfterApproval.body.user.kycStatus, 'verified');

  // La décision KYC déclenche une notification — vérifie qu'elle porte bien une clé
  // de template (pas du texte français figé) et se traduit correctement à la lecture.
  const notifFr = await api('/notifications', { token, lang: 'fr' });
  const kycNotif = notifFr.body.notifications.find((n) => n.key === 'kyc.verified');
  assert.ok(kycNotif, 'une notification kyc.verified doit être créée à l\'approbation');
  assert.match(kycNotif.text, /identité a été vérifiée/);
  const notifAr = await api('/notifications', { token, lang: 'ar' });
  assert.match(notifAr.body.notifications.find((n) => n.id === kycNotif.id).text, /تم التحقق/);
});

test('litige : ouverture, preuve, tiers exclu, arbitrage admin (remboursement)', async () => {
  const fatima = tokens.fatima;
  const karim = tokens.karim;
  const mehdi = tokens.mehdi;
  const admin = tokens.admin;
  await completeTraining(karim);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Litige test', categoryId: 'dattes', categoryLabel: 'Dattes',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 25, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 9, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const tx = accepted.body.transaction;

  await api(`/transactions/${tx.id}/sealing-video`, { method: 'POST', token: fatima, body: { simulated: true } });
  const pickupCode = (await api(`/transactions/${tx.id}`, { token: fatima })).body.transaction.pickupCode;
  await api(`/transactions/${tx.id}/confirm-pickup`, { method: 'POST', token: karim, body: { code: pickupCode } });

  // Un tiers ne peut pas ouvrir de litige sur une transaction qui ne le concerne pas.
  const outsiderDispute = await api(`/transactions/${tx.id}/dispute`, { method: 'POST', token: mehdi, body: { reason: 'Je tente ma chance ici' } });
  assert.equal(outsiderDispute.status, 403);

  const opened = await api(`/transactions/${tx.id}/dispute`, {
    method: 'POST', token: fatima, body: { reason: 'Le contenu livré ne correspond pas à la vidéo de scellage' },
  });
  assert.equal(opened.status, 200);
  const disputeId = opened.body.dispute.id;

  const txAfterOpen = await api(`/transactions/${tx.id}`, { token: fatima });
  assert.equal(txAfterOpen.body.transaction.status, 'disputed');
  assert.equal(txAfterOpen.body.transaction.escrow.state, 'frozen');

  // Le voyageur (partie au litige) peut soumettre une preuve ; un tiers ne peut pas.
  const outsiderEvidence = await api(`/disputes/${disputeId}/evidence`, { method: 'POST', token: mehdi, body: { text: 'Je m\'incruste' } });
  assert.equal(outsiderEvidence.status, 403);

  const evidence = await api(`/disputes/${disputeId}/evidence`, { method: 'POST', token: karim, body: { text: 'Voici ma version des faits' } });
  assert.equal(evidence.status, 200);
  assert.equal(evidence.body.dispute.evidence.length, 1);

  const overview = await api('/admin/overview', { token: admin });
  const queueItem = overview.body.reviewQueue.find((r) => r.type === 'dispute' && r.refId === disputeId);
  assert.ok(queueItem, 'le litige doit apparaître dans la file de revue admin');

  const decide = await api(`/admin/review/${queueItem.id}`, { method: 'POST', token: admin, body: { decision: 'refund_sender' } });
  assert.equal(decide.status, 200);

  const audit = await api('/admin/audit-logs', { token: admin });
  assert.ok(audit.body.logs.some((l) =>
    l.action === 'review.dispute.refund_sender' && l.targetType === 'dispute' && l.targetId === disputeId
      && l.meta?.txId === tx.id && l.meta?.escrowState === 'refunded'
  ));

  const txAfterResolution = await api(`/transactions/${tx.id}`, { token: fatima });
  assert.equal(txAfterResolution.body.transaction.status, 'refunded');
  assert.equal(txAfterResolution.body.transaction.escrow.state, 'refunded');

  // L'arbitrage notifie les parties — vérifie la clé de template et la traduction NL,
  // sur le chemin remboursement (celui exercé par ce test, distinct de release_traveler).
  const notifFr = await api('/notifications', { token: fatima, lang: 'fr' });
  const disputeNotif = notifFr.body.notifications.find((n) => n.key === 'dispute.resolved.sender');
  assert.ok(disputeNotif, 'une notification dispute.resolved.sender doit être créée au remboursement');
  assert.match(disputeNotif.text, /expéditeur remboursé/);
  const notifNl = await api('/notifications', { token: fatima, lang: 'nl' });
  assert.match(notifNl.body.notifications.find((n) => n.id === disputeNotif.id).text, /terugbetaald/);
});

test('zone grise : catégorie inconnue → revue humaine → promotion en liste blanche', async () => {
  const fatima = tokens.fatima;
  const admin = tokens.admin;
  const categoryId = `confiture-maison-${Date.now()}`;

  const firstListing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Confiture maison test', categoryId, categoryLabel: 'Confiture maison',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 15, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(firstListing.status, 200);
  assert.equal(firstListing.body.listing.whitelistVerdict, 'gray');
  assert.equal(firstListing.body.listing.status, 'pending_review');

  const overview = await api('/admin/overview', { token: admin });
  const queueItem = overview.body.reviewQueue.find((r) => r.type === 'listing' && r.refId === firstListing.body.listing.id);
  assert.ok(queueItem, 'l\'annonce en zone grise doit apparaître dans la file de revue');

  const approve = await api(`/admin/review/${queueItem.id}`, {
    method: 'POST', token: admin, body: { decision: 'approve', maxQty: '2 pots (500 g)' },
  });
  assert.equal(approve.status, 200);

  // Un second envoi dans la même catégorie doit désormais passer directement,
  // sans repasser en revue (c'est tout le sens de la promotion en liste blanche).
  const secondListing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Confiture maison test 2', categoryId, categoryLabel: 'Confiture maison',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 15, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(secondListing.status, 200);
  assert.equal(secondListing.body.listing.whitelistVerdict, 'whitelisted');
  assert.equal(secondListing.body.listing.status, 'published');
});

// Fait vivre une transaction du bout à bout jusqu'à released — factorisé car le test des
// plafonds progressifs a besoin d'en rejouer plusieurs pour un même voyageur.
async function runFullCycle(senderToken, travelerToken, categoryId, categoryLabel) {
  const listing = await api('/listings', {
    method: 'POST', token: senderToken,
    body: {
      title: `Cycle complet ${categoryId}`, categoryId, categoryLabel,
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 15, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  if (listing.status !== 200) throw new Error(`Échec création annonce (${listing.status}): ${JSON.stringify(listing.body)}`);
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: travelerToken });
  if (accepted.status !== 200) throw new Error(`Échec acceptation (${accepted.status}): ${JSON.stringify(accepted.body)}`);
  const tx = accepted.body.transaction;
  await api(`/transactions/${tx.id}/sealing-video`, { method: 'POST', token: senderToken, body: { simulated: true } });
  const pickupCode = (await api(`/transactions/${tx.id}`, { token: senderToken })).body.transaction.pickupCode;
  await api(`/transactions/${tx.id}/confirm-pickup`, { method: 'POST', token: travelerToken, body: { code: pickupCode } });
  const deliveryCode = (await api(`/transactions/${tx.id}`, { token: travelerToken })).body.transaction.deliveryCode;
  const delivered = await api(`/transactions/${tx.id}/confirm-delivery`, { method: 'POST', token: senderToken, body: { code: deliveryCode } });
  if (delivered.status !== 200) throw new Error(`Échec livraison (${delivered.status}): ${JSON.stringify(delivered.body)}`);
  return delivered.body.transaction;
}

test('plafonds progressifs : relevés automatiquement après 3 transactions réussies', async () => {
  const admin = tokens.admin;
  const sender = await registerKycVerifiedUser(admin, 'Expediteur');
  const traveler = await registerKycVerifiedUser(admin, 'Voyageur');
  await completeTraining(traveler.token);

  const meBefore = await api('/me', { token: traveler.token });
  assert.equal(meBefore.body.maxValue, 100);
  assert.equal(meBefore.body.maxActive, 1);

  // Deux premiers cycles : encore sous le seuil de 3, les plafonds ne bougent pas.
  await runFullCycle(sender.token, traveler.token, 'miel', 'Miel');
  const meAfterOne = await api('/me', { token: traveler.token });
  assert.equal(meAfterOne.body.maxValue, 100);

  await runFullCycle(sender.token, traveler.token, 'miel', 'Miel');
  const meAfterTwo = await api('/me', { token: traveler.token });
  assert.equal(meAfterTwo.body.maxValue, 100);

  // Troisième cycle : franchit le seuil, les plafonds sont relevés (PRD §0.3).
  await runFullCycle(sender.token, traveler.token, 'miel', 'Miel');
  const meAfterThree = await api('/me', { token: traveler.token });
  assert.equal(meAfterThree.body.maxValue, 500);
  assert.equal(meAfterThree.body.maxActive, 3);
});

test('refus sans pénalité : republie l\'annonce et rembourse l\'escrow', async () => {
  const fatima = tokens.fatima;
  const karim = tokens.karim;
  await completeTraining(karim);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Refus test', categoryId: 'epices', categoryLabel: 'Épices',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 18, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const tx = accepted.body.transaction;

  // Réservé au voyageur : l'expéditeur ne peut pas refuser sa propre transaction.
  const senderRefuse = await api(`/transactions/${tx.id}/refuse`, { method: 'POST', token: fatima, body: { reason: 'test' } });
  assert.equal(senderRefuse.status, 403);

  const refused = await api(`/transactions/${tx.id}/refuse`, { method: 'POST', token: karim, body: { reason: 'Contenu ne correspond pas à la description' } });
  assert.equal(refused.status, 200);
  assert.equal(refused.body.transaction.status, 'cancelled');
  assert.equal(refused.body.transaction.escrow.state, 'refunded');
  // Le remboursement est désormais horodaté (refundedAt) — indispensable pour tracer un vrai
  // remboursement prestataire (P0.4) et auditer les mouvements (P0.8). Auparavant absent.
  assert.ok(refused.body.transaction.escrow.refundedAt, 'le remboursement doit être horodaté (refundedAt)');

  const mine = await api('/listings/mine', { token: fatima });
  const listingAfter = mine.body.listings.find((l) => l.id === listing.body.listing.id);
  assert.equal(listingAfter.status, 'published');
});

test('messagerie : le partage de coordonnées est détecté et signalé', async () => {
  const fatima = tokens.fatima;
  const karim = tokens.karim;
  await completeTraining(karim);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Messagerie test', categoryId: 'huiles-essentielles', categoryLabel: 'Huiles essentielles',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 0.5,
      valueEur: 22, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const tx = accepted.body.transaction;

  const cleanMsg = await api(`/transactions/${tx.id}/messages`, { method: 'POST', token: fatima, body: { text: 'On se voit où pour la remise ?' } });
  assert.equal(cleanMsg.status, 200);
  assert.equal(cleanMsg.body.message.flagged, false);
  assert.equal(cleanMsg.body.warning, null);

  const leakedMsg = await api(`/transactions/${tx.id}/messages`, { method: 'POST', token: karim, body: { text: 'Appelle-moi au 0612345678 direct' } });
  assert.equal(leakedMsg.status, 422);
  assert.equal(leakedMsg.body.code, 'message_safety_blocked');
  assert.ok(leakedMsg.body.categories.includes('phone'));

  const mehdi = tokens.mehdi;
  const outsiderRead = await api(`/transactions/${tx.id}/messages`, { token: mehdi });
  assert.equal(outsiderRead.status, 403);
});

test('récapitulatif douane : contenu correct, réservé aux parties', async () => {
  const fatima = tokens.fatima;
  const karim = tokens.karim;
  const mehdi = tokens.mehdi;
  await completeTraining(karim);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Douane test', categoryId: 'argan', categoryLabel: "Huile d'argan",
      description: 'Description suffisamment longue pour passer la validation', weightKg: 2,
      valueEur: 40, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 10, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const tx = accepted.body.transaction;

  const outsider = await api(`/transactions/${tx.id}/customs-recap`, { token: mehdi });
  assert.equal(outsider.status, 403);

  const recap = await api(`/transactions/${tx.id}/customs-recap`, { token: karim });
  assert.equal(recap.status, 200);
  assert.equal(recap.body.recap.valueEur, 40);
  assert.equal(recap.body.recap.weightKg, 2);
  assert.ok(recap.body.recap.corridor, 'la franchise douanière du corridor doit être incluse');

  const recapNl = await api(`/transactions/${tx.id}/customs-recap`, { token: karim, lang: 'nl' });
  assert.equal(recapNl.body.recap.category, 'Verzegelde arganolie');
  assert.equal(recapNl.body.recap.corridor.franchise, '430 € per reiziger (luchtvervoer)');

  const recapAr = await api(`/transactions/${tx.id}/customs-recap`, { token: karim, lang: 'ar' });
  assert.equal(recapAr.body.recap.category, 'زيت أركان مختوم');
  assert.equal(recapAr.body.recap.corridor.franchise, '430 € لكل مسافر (جواً)');
});

test('KPIs admin : réservés aux admins, forme correcte', async () => {
  const karim = tokens.karim;
  const admin = tokens.admin;

  const asTraveler = await api('/admin/kpis', { token: karim });
  assert.equal(asTraveler.status, 403);

  const asAdmin = await api('/admin/kpis', { token: admin });
  assert.equal(asAdmin.status, 200);
  assert.ok('disputeRate' in asAdmin.body.kpis);
  assert.ok('transactionsPerMonth' in asAdmin.body.kpis);
  assert.equal(typeof asAdmin.body.totals.transactions, 'number');
});

test('modification d\'annonce : réservée à l\'expéditeur, bloquée une fois acceptée', async () => {
  const fatima = tokens.fatima;
  const mehdi = tokens.mehdi;
  const admin = tokens.admin;
  // Voyageur dédié plutôt que karim : karim accumule au fil de la suite des transactions
  // volontairement laissées non résolues (IDOR/messagerie/douane n'ont besoin que d'un
  // statut 'accepted') et finit par cogner son maxActive — l'accept ci-dessous échouerait
  // silencieusement avec karim, ce qui a fait échouer une première version de ce test.
  const traveler = await registerKycVerifiedUser(admin, 'EditeurVoyageur');
  await completeTraining(traveler.token);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Édition test', categoryId: 'cosmetiques', categoryLabel: 'Cosmétiques naturels',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 20, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 8, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const listingId = listing.body.listing.id;

  // Un tiers ne peut pas modifier l'annonce d'un autre.
  const outsiderEdit = await api(`/listings/${listingId}`, { method: 'PUT', token: mehdi, body: { title: 'Piraté' } });
  assert.equal(outsiderEdit.status, 403);

  // L'expéditeur peut modifier tant que l'annonce n'est pas acceptée.
  const ownerEdit = await api(`/listings/${listingId}`, { method: 'PUT', token: fatima, body: { title: 'Titre corrigé', weightKg: 1.5 } });
  assert.equal(ownerEdit.status, 200);
  assert.equal(ownerEdit.body.listing.title, 'Titre corrigé');
  assert.equal(ownerEdit.body.listing.weightKg, 1.5);

  // Une valeur qui dépasse le plafond du compte est refusée.
  const overCapEdit = await api(`/listings/${listingId}`, { method: 'PUT', token: fatima, body: { valueEur: 999999 } });
  assert.equal(overCapEdit.status, 400);

  // Une fois acceptée, l'annonce est figée — même pour son propriétaire.
  const accepted = await api(`/listings/${listingId}/accept`, { method: 'POST', token: traveler.token });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const editAfterAccept = await api(`/listings/${listingId}`, { method: 'PUT', token: fatima, body: { title: 'Trop tard' } });
  assert.equal(editAfterAccept.status, 400);
});

test('suppression de compte (RGPD) : bloquée si transaction active, anonymise sinon', async () => {
  const admin = tokens.admin;
  const sender = await registerKycVerifiedUser(admin, 'RgpdExpediteur');
  const traveler = await registerKycVerifiedUser(admin, 'RgpdVoyageur');
  await completeTraining(traveler.token);

  const listing = await api('/listings', {
    method: 'POST', token: sender.token,
    body: {
      title: 'RGPD test', categoryId: 'amlou', categoryLabel: 'Amlou',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 15, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: traveler.token });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

  // Transaction encore active (ni livrée, ni annulée, ni remboursée) : suppression bloquée.
  const deleteRequest = await api('/profile/delete/request', { method: 'POST', token: sender.token });
  assert.equal(deleteRequest.status, 200);
  const deleteCode = deleteRequest.body.demoHint.match(/\d{6}/)[0];
  const blockedDelete = await api('/profile/delete', { method: 'POST', token: sender.token, body: { code: deleteCode } });
  assert.equal(blockedDelete.status, 400);
  assert.match(blockedDelete.body.error, /en cours/);

  // Le voyageur refuse (sans pénalité) : la transaction passe en statut terminal 'cancelled',
  // ce qui débloque la suppression du compte de l'expéditeur.
  const refused = await api(`/transactions/${accepted.body.transaction.id}/refuse`, { method: 'POST', token: traveler.token, body: { reason: 'RGPD test cleanup' } });
  assert.equal(refused.status, 200);

  const deleted = await api('/profile/delete', { method: 'POST', token: sender.token, body: { code: deleteCode } });
  assert.equal(deleted.status, 200);

  // Anonymisée, pas juste marquée : la session est invalidée et l'ancien email ne reconnecte plus.
  const meAfterDelete = await api('/me', { token: sender.token });
  assert.equal(meAfterDelete.status, 401);

  const loginWithOldEmail = await api('/auth/login', { method: 'POST', body: { email: sender.email, password: 'demo1234' } });
  assert.equal(loginWithOldEmail.status, 401);
});

test('securite du compte : mot de passe et email exigent les confirmations attendues', async () => {
  const oldEmail = `security-${Date.now()}@exemple.com`;
  const newEmail = `security-new-${Date.now()}@exemple.com`;
  const registration = await api('/auth/register', {
    method: 'POST', body: { name: 'Compte securite', email: oldEmail, password: 'ancien-mdp1', cguAccepted: true },
  });
  const verifyCode = registration.body.demoHint.match(/\d{6}/)[0];
  const verified = await api('/auth/verify-email', { method: 'POST', body: { email: oldEmail, code: verifyCode } });
  assert.equal(verified.status, 200);

  const badPassword = await api('/profile/password', { method: 'POST', token: verified.body.token, body: { currentPassword: 'incorrect', password: 'nouveau-mdp1' } });
  assert.equal(badPassword.status, 400);
  const changedPassword = await api('/profile/password', { method: 'POST', token: verified.body.token, body: { currentPassword: 'ancien-mdp1', password: 'nouveau-mdp1' } });
  assert.equal(changedPassword.status, 200);
  const relogin = await api('/auth/login', { method: 'POST', body: { email: oldEmail, password: 'nouveau-mdp1' } });
  assert.equal(relogin.status, 200);

  const request = await api('/profile/email/change/request', { method: 'POST', token: relogin.body.token, body: { newEmail, currentPassword: 'nouveau-mdp1' } });
  assert.equal(request.status, 200);
  const code = request.body.demoHint.match(/\d{6}/)[0];
  const changedEmail = await api('/profile/email/change/confirm', { method: 'POST', token: relogin.body.token, body: { code } });
  assert.equal(changedEmail.status, 200);
  const loginNewEmail = await api('/auth/login', { method: 'POST', body: { email: newEmail, password: 'nouveau-mdp1' } });
  assert.equal(loginNewEmail.status, 200);
});

test('export RGPD : contient mes données, jamais le hash du mot de passe', async () => {
  const fatima = tokens.fatima;
  const exported = await api('/profile/export', { token: fatima });
  assert.equal(exported.status, 200);
  assert.equal(exported.body.user.id, 'u-fatima');
  assert.equal('passwordHash' in exported.body.user, false, 'le hash du mot de passe ne doit jamais apparaître dans un export');
  assert.ok(Array.isArray(exported.body.listings));
  assert.ok(exported.body.listings.every((l) => l.senderId === 'u-fatima'), 'ne doit contenir que les annonces de l\'utilisateur');
});

test('notifications : marquées lues correctement, scopées au bon utilisateur', async () => {
  const fatima = tokens.fatima;
  // Voyageur dédié, pas karim : à ce stade de la suite il a déjà 3 transactions actives
  // (maxActive) laissées non résolues par d'autres tests — même leçon que le test
  // d'édition d'annonce plus haut.
  const karim = (await registerKycVerifiedUser(tokens.admin, 'NotifVoyageur')).token;
  await completeTraining(karim);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Notifications test', categoryId: 'safran', categoryLabel: 'Safran',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 0.1,
      valueEur: 20, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  // Accepter déclenche une notification pour l'expéditeur (fatima), pas pour le voyageur lui-même.
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

  const before = await api('/notifications', { token: fatima });
  assert.equal(before.status, 200);
  assert.ok(before.body.unread > 0, 'fatima doit avoir au moins une notification non lue après acceptation');
  assert.ok(before.body.notifications.some((n) => n.txId === accepted.body.transaction.id && n.section === 'suivi'));

  await api('/notifications/read', { method: 'POST', token: fatima });
  const after = await api('/notifications', { token: fatima });
  assert.equal(after.body.unread, 0);

  // Les notifications d'un autre utilisateur, non concerné par cette transaction,
  // ne doivent jamais contenir cette annonce.
  const mehdiNotifs = await api('/notifications', { token: tokens.mehdi });
  assert.equal(mehdiNotifs.status, 200);
  assert.ok(mehdiNotifs.body.notifications.every((n) => n.txId !== accepted.body.transaction.id));
});

test('dashboard : agrège actions, matching, confiance et notifications', async () => {
  const fatima = tokens.fatima;
  const karim = (await registerKycVerifiedUser(tokens.admin, 'DashboardVoyageur')).token;
  await completeTraining(karim);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Dashboard colis', categoryId: 'safran', categoryLabel: 'Safran',
      description: 'Description suffisamment longue pour le dashboard utilisateur', weightKg: 0.1,
      valueEur: 20, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const trip = await api('/trips', {
    method: 'POST', token: karim,
    body: { from: 'Casablanca', to: 'Bruxelles', date: '2026-08-10', capacityKg: 3 },
  });
  const offer = await api('/matching-offers', {
    method: 'POST', token: fatima,
    body: { listingId: listing.body.listing.id, tripId: trip.body.trip.id },
  });

  const dashBefore = await api('/dashboard', { token: karim });
  assert.equal(dashBefore.status, 200);
  assert.ok(dashBefore.body.matches.some((l) => l.id === listing.body.listing.id), 'le matching doit inclure l’annonce compatible');
  assert.equal(dashBefore.body.trust.kycStatus, 'verified');
  assert.equal(dashBefore.body.offers.mineToAct >= 1, true);
  assert.ok(dashBefore.body.offers.latest.some((o) => o.id === offer.body.offer.id && o.waitingForMe));
  assert.ok(dashBefore.body.notifications.some((n) => n.section === 'matching'));

  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  const dashAfter = await api('/dashboard', { token: fatima });
  assert.equal(dashAfter.status, 200);
  assert.ok(dashAfter.body.actions.some((tx) => tx.id === accepted.body.transaction.id && tx.status === 'accepted'));
  assert.ok(dashAfter.body.notifications.some((n) => n.txId === accepted.body.transaction.id && n.section === 'suivi'));
});

test('centre de confiance : expose score, limites, actions et protections', async () => {
  const token = (await registerKycVerifiedUser(tokens.admin, 'TrustCenterUser')).token;
  const res = await api('/trust-center', { token });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.trust.identity.kycStatus, 'verified');
  assert.equal(typeof res.body.trust.score, 'number');
  assert.ok(res.body.trust.score >= 0 && res.body.trust.score <= 100);
  assert.equal(res.body.trust.limits.maxValue, 100);
  assert.equal(res.body.trust.limits.maxActive, 1);
  assert.ok(res.body.trust.actions.some((a) => a.id === 'build-reviews'));
  assert.ok(res.body.trust.protections.some((p) => p.id === 'escrow' && p.enabled === true));

  const blocked = await api('/trust-center');
  assert.equal(blocked.status, 401);
});

test('paramètres : les préférences de notifications sont persistées et appliquées', async () => {
  const fatima = tokens.fatima;
  const karim = (await registerKycVerifiedUser(tokens.admin, 'PrefsVoyageur')).token;
  await completeTraining(karim);

  const defaults = await api('/settings', { token: fatima });
  assert.equal(defaults.status, 200);
  assert.equal(defaults.body.settings.notifications.messages, true);
  assert.equal(defaults.body.settings.notifications.security, true);

  const saved = await api('/settings', {
    method: 'POST', token: fatima,
    body: { notifications: { messages: false, security: false } },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.settings.notifications.messages, false);
  assert.equal(saved.body.settings.notifications.security, true, 'la sécurité reste obligatoire');

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Préférences notifications', categoryId: 'safran', categoryLabel: 'Safran',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 0.1,
      valueEur: 20, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

  const before = await api('/notifications', { token: fatima });
  await api(`/transactions/${accepted.body.transaction.id}/messages`, {
    method: 'POST', token: karim, body: { text: 'Message qui ne doit pas notifier Fatima.' },
  });
  const after = await api('/notifications', { token: fatima });
  assert.equal(after.body.notifications.length, before.body.notifications.length);
  assert.ok(after.body.notifications.every((n) => !(n.txId === accepted.body.transaction.id && n.type === 'messages')));
});

test('onboarding : la completion est persistee sur le compte', async () => {
  const user = await registerKycVerifiedUser(tokens.admin, 'OnboardingUser');

  const before = await api('/me', { token: user.token });
  assert.equal(before.status, 200);
  assert.equal(before.body.user.onboardingDone, false);

  const saved = await api('/onboarding/complete', { method: 'POST', token: user.token });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.user.onboardingDone, true);
  assert.equal(saved.body.settings.onboardingDone, true);

  const after = await api('/me', { token: user.token });
  assert.equal(after.body.user.onboardingDone, true);
});

test('retrait d\'une catégorie de la liste blanche : réservé aux admins, repasse en zone grise', async () => {
  const fatima = tokens.fatima;
  const karim = tokens.karim;
  const admin = tokens.admin;
  const categoryId = `confiture-retrait-${Date.now()}`;

  const firstListing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Retrait test', categoryId, categoryLabel: 'Confiture retrait',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 15, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const overview = await api('/admin/overview', { token: admin });
  const queueItem = overview.body.reviewQueue.find((r) => r.type === 'listing' && r.refId === firstListing.body.listing.id);
  await api(`/admin/review/${queueItem.id}`, { method: 'POST', token: admin, body: { decision: 'approve', maxQty: '2 pots' } });

  const overviewAfterApprove = await api('/admin/overview', { token: admin });
  const promoted = overviewAfterApprove.body.customWhitelist.find((c) => c.id === categoryId);
  assert.ok(promoted, 'la catégorie doit apparaître dans la liste blanche promue');

  // Réservé aux admins.
  const outsiderDelete = await api(`/admin/whitelist/${promoted.id}`, { method: 'DELETE', token: karim });
  assert.equal(outsiderDelete.status, 403);

  const del = await api(`/admin/whitelist/${promoted.id}`, { method: 'DELETE', token: admin });
  assert.equal(del.status, 200);

  const audit = await api('/admin/audit-logs', { token: admin });
  assert.ok(audit.body.logs.some((l) =>
    l.action === 'custom_whitelist.remove' && l.targetType === 'custom_whitelist' && l.targetId === promoted.id
  ));

  // Une fois retirée, un nouvel envoi dans cette catégorie repasse en zone grise.
  const secondListing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Retrait test 2', categoryId, categoryLabel: 'Confiture retrait',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 15, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(secondListing.body.listing.whitelistVerdict, 'gray');
  assert.equal(secondListing.body.listing.status, 'pending_review');
});

test('mot de passe oublié : pas d\'énumération, code exact requis, sessions invalidées', async () => {
  const n = Math.floor(Math.random() * 1e9);
  const email = `resettest${n}@exemple.com`;
  const reg = await api('/auth/register', { method: 'POST', body: { name: 'Testeur Reset', email, password: 'ancien-mdp1', cguAccepted: true } });
  const verifyCode = reg.body.demoHint.match(/\d{6}/)[0];
  const verify = await api('/auth/verify-email', { method: 'POST', body: { email, code: verifyCode } });
  const originalToken = verify.body.token;

  // Réponse identique (200, ok:true) que le compte existe ou non — pas d'énumération d'emails.
  const forgotUnknown = await api('/auth/forgot', { method: 'POST', body: { email: 'personne-ici@exemple.com' } });
  assert.equal(forgotUnknown.status, 200);
  assert.equal(forgotUnknown.body.ok, true);

  const forgot = await api('/auth/forgot', { method: 'POST', body: { email } });
  assert.equal(forgot.status, 200);
  const resetCode = forgot.body.demoHint.match(/\d{6}/)[0];

  // Un code incorrect est rejeté.
  const badCode = await api('/auth/reset', { method: 'POST', body: { email, code: '000000', password: 'nouveau-mdp1' } });
  assert.equal(badCode.status, 400);

  const reset = await api('/auth/reset', { method: 'POST', body: { email, code: resetCode, password: 'nouveau-mdp1' } });
  assert.equal(reset.status, 200);
  assert.ok(reset.body.token);

  // L'ancien mot de passe ne fonctionne plus, le nouveau oui.
  const loginOldPwd = await api('/auth/login', { method: 'POST', body: { email, password: 'ancien-mdp1' } });
  assert.equal(loginOldPwd.status, 401);
  const loginNewPwd = await api('/auth/login', { method: 'POST', body: { email, password: 'nouveau-mdp1' } });
  assert.equal(loginNewPwd.status, 200);

  // La session ouverte avant la réinitialisation est invalidée (vol de session après fuite de mot de passe).
  const meWithOldToken = await api('/me', { token: originalToken });
  assert.equal(meWithOldToken.status, 401);
});

test('trajets : le feed se filtre sur le trajet déclaré du voyageur (PRD §2.1)', async () => {
  const fatima = tokens.fatima;
  const admin = tokens.admin;
  const traveler = await registerKycVerifiedUser(admin, 'TrajetVoyageur');
  // Date fixe dans la fenêtre des annonces ci-dessous (2026-08-01 → 2026-08-25), plutôt
  // qu'un décalage relatif à aujourd'hui qui pourrait tomber hors fenêtre selon la date
  // d'exécution des tests.
  const futureDate = '2026-08-10';

  const matching = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Colis compatible', categoryId: 'dattes', categoryLabel: 'Dattes',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 2,
      valueEur: 20, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-25',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const nonMatching = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Colis incompatible (autre sens)', categoryId: 'dattes', categoryLabel: 'Dattes',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 2,
      valueEur: 20, from: 'Bruxelles', to: 'Casablanca', dateFrom: '2026-08-01', dateTo: '2026-08-25',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });

  // Avant toute déclaration de trajet, le feed montre tout (rien à filtrer sur).
  const beforeTrip = await api('/listings', { token: traveler.token });
  assert.equal(beforeTrip.body.filteredByTrip, false);

  const trip = await api('/trips', { method: 'POST', token: traveler.token, body: { from: 'Casablanca', to: 'Bruxelles', date: futureDate, capacityKg: 5 } });
  assert.equal(trip.status, 200);

  const filtered = await api('/listings', { token: traveler.token });
  assert.equal(filtered.body.filteredByTrip, true);
  const filteredIds = filtered.body.listings.map((l) => l.id);
  assert.ok(filteredIds.includes(matching.body.listing.id), 'l\'annonce compatible doit apparaître');
  assert.ok(!filteredIds.includes(nonMatching.body.listing.id), 'l\'annonce incompatible ne doit pas apparaître');

  const mission = await api('/trips/mission', { token: traveler.token });
  assert.equal(mission.status, 200);
  assert.equal(mission.body.totals.trips, 1);
  assert.ok(mission.body.totals.matches >= 1);
  assert.ok(mission.body.totals.potentialPay >= 7);
  assert.ok(mission.body.missions[0].matchIds.includes(matching.body.listing.id));
  assert.ok(!mission.body.missions[0].matchIds.includes(nonMatching.body.listing.id));

  const unfiltered = await api('/listings?all=1', { token: traveler.token });
  const unfilteredIds = unfiltered.body.listings.map((l) => l.id);
  assert.ok(unfilteredIds.includes(matching.body.listing.id));
  assert.ok(unfilteredIds.includes(nonMatching.body.listing.id), '?all=1 doit tout montrer, y compris l\'incompatible');

  // Après suppression du trajet, plus rien à filtrer : retour au feed complet par défaut.
  await api(`/trips/${trip.body.trip.id}`, { method: 'DELETE', token: traveler.token });
  const afterDelete = await api('/listings', { token: traveler.token });
  assert.equal(afterDelete.body.filteredByTrip, false);
});

test('retrait d\'annonce (avant acceptation) : réservé à l\'expéditeur, bloqué après acceptation', async () => {
  const fatima = tokens.fatima;
  const mehdi = tokens.mehdi;
  const admin = tokens.admin;
  const traveler = await registerKycVerifiedUser(admin, 'RetraitVoyageur');
  await completeTraining(traveler.token);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Retrait annonce test', categoryId: 'miel', categoryLabel: 'Miel',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 15, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const listingId = listing.body.listing.id;

  const outsiderCancel = await api(`/listings/${listingId}/cancel`, { method: 'POST', token: mehdi });
  assert.equal(outsiderCancel.status, 403);

  const secondListing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Retrait annonce test 2', categoryId: 'miel', categoryLabel: 'Miel',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 15, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${secondListing.body.listing.id}/accept`, { method: 'POST', token: traveler.token });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const cancelAfterAccept = await api(`/listings/${secondListing.body.listing.id}/cancel`, { method: 'POST', token: fatima });
  assert.equal(cancelAfterAccept.status, 400);

  const ownerCancel = await api(`/listings/${listingId}/cancel`, { method: 'POST', token: fatima });
  assert.equal(ownerCancel.status, 200);
  assert.equal(ownerCancel.body.listing.status, 'cancelled');
});

test('centre de pilotage des envois : priorise les actions expediteur', async () => {
  const fatima = tokens.fatima;
  const admin = tokens.admin;
  const traveler = await registerKycVerifiedUser(admin, 'PilotageVoyageur');
  await completeTraining(traveler.token);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Pilotage colis test', categoryId: 'miel', categoryLabel: 'Miel',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 30, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 9, customsAccepted: true, photos: [TINY_PNG],
    },
  });

  const beforeAccept = await api('/shipments/command-center', { token: fatima });
  assert.equal(beforeAccept.status, 200);
  const waiting = beforeAccept.body.commandCenter.items.find((i) => i.listing.id === listing.body.listing.id);
  assert.equal(waiting.action.id, 'wait_traveler');
  assert.equal(beforeAccept.body.commandCenter.totals.published >= 1, true);

  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: traveler.token });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

  const afterAccept = await api('/shipments/command-center', { token: fatima });
  const active = afterAccept.body.commandCenter.items.find((i) => i.listing.id === listing.body.listing.id);
  assert.equal(active.action.id, 'seal');
  assert.equal(active.action.priority, 'high');
  assert.equal(active.transaction.myRole, 'sender');
  assert.ok(afterAccept.body.commandCenter.actions.some((a) => a.listingId === listing.body.listing.id && a.action.id === 'seal'));
  assert.ok(afterAccept.body.commandCenter.totals.escrowHeld >= accepted.body.transaction.escrow.amount);
});

test('centre financier : agrège escrow, rôles et actions', async () => {
  const fatima = tokens.fatima;
  const admin = tokens.admin;
  const traveler = await registerKycVerifiedUser(admin, 'FinanceVoyageur');
  await completeTraining(traveler.token);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Finance colis test', categoryId: 'argan', categoryLabel: "Huile d'argan",
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 40, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 10, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: traveler.token });
  const txId = accepted.body.transaction.id;
  const amount = accepted.body.transaction.escrow.amount;

  const senderFinance = await api('/finance-center', { token: fatima });
  assert.equal(senderFinance.status, 200);
  assert.ok(senderFinance.body.finance.totals.held >= amount);
  assert.ok(senderFinance.body.finance.totals.paidByMe >= amount);
  const senderRow = senderFinance.body.finance.rows.find((r) => r.transaction.id === txId);
  assert.equal(senderRow.role, 'sender');
  assert.equal(senderRow.action.id, 'seal_to_unlock');
  assert.ok(senderFinance.body.finance.actions.some((a) => a.txId === txId && a.action.id === 'seal_to_unlock'));

  const travelerFinance = await api('/finance-center', { token: traveler.token });
  const travelerRow = travelerFinance.body.finance.rows.find((r) => r.transaction.id === txId);
  assert.equal(travelerRow.role, 'traveler');
  assert.equal(travelerRow.transaction.escrow.state, 'held');
});

test('centre documents : indexe douane, scellage, escrow et KYC', async () => {
  const fatima = tokens.fatima;
  const admin = tokens.admin;
  const traveler = await registerKycVerifiedUser(admin, 'DocsVoyageur');
  await completeTraining(traveler.token);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Documents colis test', categoryId: 'safran', categoryLabel: 'Safran',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 0.2,
      valueEur: 35, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 8, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: traveler.token });
  const txId = accepted.body.transaction.id;
  await api(`/transactions/${txId}/sealing-video`, { method: 'POST', token: fatima, body: { simulated: true, geo: 'Casablanca' } });

  const center = await api('/documents-center', { token: fatima });
  assert.equal(center.status, 200);
  const dossier = center.body.documents.dossiers.find((d) => d.txId === txId);
  assert.ok(dossier, 'le dossier transaction doit apparaître');
  assert.equal(dossier.role, 'sender');
  assert.equal(dossier.docs.find((d) => d.id === 'customs').status, 'ready');
  assert.equal(dossier.docs.find((d) => d.id === 'sealing').status, 'ready');
  assert.equal(dossier.docs.find((d) => d.id === 'escrow').status, 'held');
  assert.ok(center.body.documents.totals.ready >= 2);
});

test('centre assistance : agrège actions, dossiers et guide', async () => {
  const fatima = tokens.fatima;
  const admin = tokens.admin;
  const traveler = await registerKycVerifiedUser(admin, 'SupportVoyageur');
  await completeTraining(traveler.token);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Support colis test', categoryId: 'miel', categoryLabel: 'Miel',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 25, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: traveler.token });
  const txId = accepted.body.transaction.id;

  const support = await api('/support-center', { token: fatima });
  assert.equal(support.status, 200);
  const supportCase = support.body.support.cases.find((c) => c.txId === txId);
  assert.ok(supportCase, 'la transaction doit apparaître dans les dossiers support');
  assert.equal(supportCase.action.id, 'seal_first');
  assert.ok(support.body.support.urgent.some((a) => a.txId === txId && a.action.id === 'seal_first'));
  assert.ok(support.body.support.guide.some((g) => g.id === 'evidence_72h'));
  assert.equal(support.body.support.totals.cases >= 1, true);
});

test('centre conformité : expose catalogue, corridors et risques utilisateur', async () => {
  const fatima = tokens.fatima;
  const preflightBody = {
    title: 'Controle i18n', categoryId: 'argan', categoryLabel: "Huile d'argan",
    description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
    valueEur: 30, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
    travelerPay: 10, customsAccepted: true, photos: [TINY_PNG],
  };
  const preflightNl = await api('/listings/preflight', { method: 'POST', token: fatima, lang: 'nl', body: preflightBody });
  assert.equal(preflightNl.body.preflight.category.label, 'Verzegelde arganolie');
  assert.equal(preflightNl.body.preflight.customs.corridor.franchise, '430 € per reiziger (luchtvervoer)');
  assert.ok(preflightNl.body.preflight.checks.every((check) => check.labelKey));

  const preflightAr = await api('/listings/preflight', { method: 'POST', token: fatima, lang: 'ar', body: preflightBody });
  assert.equal(preflightAr.body.preflight.category.label, 'زيت أركان مختوم');
  assert.equal(preflightAr.body.preflight.customs.corridor.franchise, '430 € لكل مسافر (جواً)');

  const gray = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Conformité zone grise', categoryId: 'autre', categoryLabel: 'Produit artisanal rare',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 30, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const over = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Conformité valeur haute', categoryId: 'argan', categoryLabel: "Huile d'argan",
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 500, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 10, customsAccepted: true, photos: [TINY_PNG],
    },
  });

  const center = await api('/compliance-center', { token: fatima });
  assert.equal(center.status, 200);
  assert.ok(center.body.compliance.corridors.some((c) => c.id === 'MA-EU'));
  assert.ok(center.body.compliance.catalogue.allowed.length >= 1);
  assert.ok(center.body.compliance.catalogue.forbidden.length >= 1);
  assert.ok(center.body.compliance.totals.reviewPending >= 1);
  assert.ok(center.body.compliance.totals.overFranchise >= 1);
  assert.ok(center.body.compliance.actions.some((a) => a.listingId === gray.body.listing.id && a.action.id === 'wait_review'));
  assert.ok(center.body.compliance.actions.some((a) => a.listingId === over.body.listing.id && a.action.id === 'customs_value'));

  const centerNl = await api('/compliance-center', { token: fatima, lang: 'nl' });
  assert.equal(centerNl.body.compliance.corridors[0].franchise, '430 € per reiziger (luchtvervoer)');
  assert.equal(centerNl.body.compliance.catalogue.allowed.find((item) => item.id === 'argan').label, 'Verzegelde arganolie');

  const centerAr = await api('/compliance-center', { token: fatima, lang: 'ar' });
  assert.equal(centerAr.body.compliance.corridors[0].franchise, '430 € لكل مسافر (جواً)');
  assert.equal(centerAr.body.compliance.catalogue.allowed.find((item) => item.id === 'argan').label, 'زيت أركان مختوم');
});

test('centre matching expediteur : relie annonces actives et trajets compatibles', async () => {
  const fatima = tokens.fatima;
  const admin = tokens.admin;
  const traveler = await registerKycVerifiedUser(admin, 'MatchingVoyageur');

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Matching colis test', categoryId: 'miel', categoryLabel: 'Miel',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 25, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 700, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(listing.status, 200, JSON.stringify(listing.body));

  const trip = await api('/trips', {
    method: 'POST', token: traveler.token,
    body: { from: 'Casablanca', to: 'Bruxelles', date: '2026-08-10', capacityKg: 5 },
  });
  assert.equal(trip.status, 200, JSON.stringify(trip.body));

  const missionNl = await api('/trips/mission', { token: traveler.token, lang: 'nl' });
  const missionNlItem = missionNl.body.missions.find((item) => item.trip.id === trip.body.trip.id);
  assert.equal(missionNlItem.customs.corridor.franchise, '430 € per reiziger (luchtvervoer)');
  assert.equal(missionNlItem.topMatches.find((item) => item.id === listing.body.listing.id).categoryLabel, 'Verpakte honing');

  const missionAr = await api('/trips/mission', { token: traveler.token, lang: 'ar' });
  const missionArItem = missionAr.body.missions.find((item) => item.trip.id === trip.body.trip.id);
  assert.equal(missionArItem.customs.corridor.franchise, '430 € لكل مسافر (جواً)');
  assert.equal(missionArItem.topMatches.find((item) => item.id === listing.body.listing.id).categoryLabel, 'عسل معبأ');

  const pending = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Matching revue test', categoryId: 'autre', categoryLabel: 'Produit rare',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 20, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(pending.status, 200, JSON.stringify(pending.body));

  const center = await api('/sender-matching', { token: fatima });
  assert.equal(center.status, 200);
  assert.ok(center.body.matching.totals.matched >= 1);
  assert.ok(center.body.matching.totals.candidates >= 1);

  const item = center.body.matching.items.find((i) => i.listing.id === listing.body.listing.id);
  assert.ok(item, 'l annonce doit apparaitre dans le centre matching');
  assert.equal(item.action.id, 'contact_ready');
  assert.ok(item.candidates.some((c) => c.trip.id === trip.body.trip.id));

  const pendingItem = center.body.matching.items.find((i) => i.listing.id === pending.body.listing.id);
  assert.equal(pendingItem.action.id, 'wait_review');
  assert.ok(center.body.matching.actions.some((a) => a.listingId === listing.body.listing.id && a.action.id === 'contact_ready'));
});

test('propositions matching : l expediteur invite un voyageur qui accepte en transaction', async () => {
  const fatima = tokens.fatima;
  const admin = tokens.admin;
  const traveler = await registerKycVerifiedUser(admin, 'OffreVoyageur');
  await completeTraining(traveler.token);
  const travelerMe = await api('/me', { token: traveler.token });
  const travelerId = travelerMe.body.user.id;

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Offre matching colis', categoryId: 'safran', categoryLabel: 'Safran',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 0.5,
      valueEur: 45, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 11, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const trip = await api('/trips', {
    method: 'POST', token: traveler.token,
    body: { from: 'Casablanca', to: 'Bruxelles', date: '2026-08-12', capacityKg: 6 },
  });

  const offer = await api('/matching-offers', {
    method: 'POST', token: fatima,
    body: { listingId: listing.body.listing.id, tripId: trip.body.trip.id, message: 'Pouvez-vous le prendre ?', expiresInHours: 24 },
  });
  assert.equal(offer.status, 200, JSON.stringify(offer.body));
  assert.equal(offer.body.offer.status, 'pending_traveler');
  assert.equal(offer.body.offer.offeredPay, 11);
  assert.equal(offer.body.offer.travelerId, travelerId);
  assert.ok(offer.body.offer.expiresAt - offer.body.offer.createdAt <= 24 * 36e5 + 1000);

  const travelerOffers = await api('/matching-offers', { token: traveler.token });
  assert.ok(travelerOffers.body.offers.some((o) => o.id === offer.body.offer.id && o.myRole === 'traveler' && o.listing.id === listing.body.listing.id));

  const counter = await api(`/matching-offers/${offer.body.offer.id}/counter`, {
    method: 'POST', token: traveler.token,
    body: { offeredPay: 14, message: 'Possible pour 14 EUR.' },
  });
  assert.equal(counter.status, 200, JSON.stringify(counter.body));
  assert.equal(counter.body.offer.status, 'countered_sender');
  assert.equal(counter.body.offer.offeredPay, 14);
  assert.ok(counter.body.offer.history.some((h) => h.type === 'counter' && h.pay === 14));

  const declinedListing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Offre matching refusee', categoryId: 'miel', categoryLabel: 'Miel',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 22, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const declineOffer = await api('/matching-offers', {
    method: 'POST', token: fatima,
    body: { listingId: declinedListing.body.listing.id, tripId: trip.body.trip.id },
  });
  const declined = await api(`/matching-offers/${declineOffer.body.offer.id}/decline`, { method: 'POST', token: traveler.token });
  assert.equal(declined.status, 200, JSON.stringify(declined.body));
  assert.equal(declined.body.offer.status, 'declined');

  const withdrawnListing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Offre matching retiree', categoryId: 'amlou', categoryLabel: 'Amlou',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 24, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 6, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const withdrawOffer = await api('/matching-offers', {
    method: 'POST', token: fatima,
    body: { listingId: withdrawnListing.body.listing.id, tripId: trip.body.trip.id },
  });
  const withdrawn = await api(`/matching-offers/${withdrawOffer.body.offer.id}/withdraw`, { method: 'POST', token: fatima });
  assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
  assert.equal(withdrawn.body.offer.status, 'withdrawn');
  assert.ok(withdrawn.body.offer.history.some((h) => h.type === 'withdrawn'));

  const soonListing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Offre matching relance', categoryId: 'safran', categoryLabel: 'Safran',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 0.8,
      valueEur: 28, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 8, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const soonOffer = await api('/matching-offers', {
    method: 'POST', token: fatima,
    body: { listingId: soonListing.body.listing.id, tripId: trip.body.trip.id, expiresInHours: 1 },
  });
  assert.equal(soonOffer.status, 200, JSON.stringify(soonOffer.body));
  const remindersBefore = await api('/notifications', { token: traveler.token });
  const reminderCount = remindersBefore.body.notifications
    .filter((n) => n.type === 'reminders' && n.section === 'matching' && n.text.includes('Offre matching relance'))
    .length;
  assert.equal(reminderCount, 1);
  const remindersAfter = await api('/notifications', { token: traveler.token });
  const reminderCountAfter = remindersAfter.body.notifications
    .filter((n) => n.type === 'reminders' && n.section === 'matching' && n.text.includes('Offre matching relance'))
    .length;
  assert.equal(reminderCountAfter, 1, 'la relance proche expiration ne doit pas être dupliquée');

  const expiredListing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Offre matching expiree', categoryId: 'safran', categoryLabel: 'Safran',
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 25, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 7, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  const expiredOffer = await api('/matching-offers', {
    method: 'POST', token: fatima,
    body: { listingId: expiredListing.body.listing.id, tripId: trip.body.trip.id, expiresInHours: 0 },
  });
  assert.equal(expiredOffer.status, 200, JSON.stringify(expiredOffer.body));
  const travelerExpiredOffers = await api('/matching-offers', { token: traveler.token });
  const expiredRow = travelerExpiredOffers.body.offers.find((o) => o.id === expiredOffer.body.offer.id);
  assert.equal(expiredRow.status, 'expired');
  assert.ok(expiredRow.history.some((h) => h.type === 'expired'));
  const expiredAccept = await api(`/matching-offers/${expiredOffer.body.offer.id}/accept`, { method: 'POST', token: traveler.token });
  assert.equal(expiredAccept.status, 400);
  const expiredNotifications = await api('/notifications', { token: traveler.token });
  assert.ok(expiredNotifications.body.notifications.some((n) =>
    n.type === 'reminders' && n.section === 'matching' && n.text.includes('Offre matching expiree')
  ));

  const notifications = await api('/notifications', { token: traveler.token });
  assert.ok(notifications.body.notifications.some((n) => n.section === 'matching' && n.text.includes('Offre matching colis')));

  const accepted = await api(`/matching-offers/${offer.body.offer.id}/accept`, { method: 'POST', token: fatima });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.offer.status, 'accepted');
  assert.equal(accepted.body.transaction.listingId, listing.body.listing.id);
  assert.equal(accepted.body.transaction.travelerId, travelerId);
  assert.equal(accepted.body.transaction.escrow.travelerPay, 14);
  assert.equal(accepted.body.transaction.escrow.state, 'held');

  const after = await api('/sender-matching', { token: fatima });
  assert.ok(!after.body.matching.items.some((i) => i.listing.id === listing.body.listing.id));
});

test('recherche élargie : couvre titre, description et catégorie (PRD UI/UX U11)', async () => {
  const fatima = tokens.fatima;
  const karim = tokens.karim;
  const uniq = `zephyr${Date.now()}`;

  // Le mot unique n'apparaît QUE dans la description, jamais dans le titre.
  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Huile argan recherche', categoryId: 'argan', categoryLabel: "Huile d'argan",
      description: `Bouteille scellée, mention ${uniq} pour le test de recherche`, weightKg: 1,
      valueEur: 30, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 10, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(listing.status, 200);

  const found = await api(`/listings?all=1&q=${uniq}`, { token: karim });
  assert.equal(found.status, 200);
  assert.ok(found.body.listings.some((l) => l.id === listing.body.listing.id),
    'un mot présent seulement dans la description doit être trouvé');

  const foundNl = await api(`/listings?all=1&q=${uniq}`, { token: karim, lang: 'nl' });
  assert.equal(foundNl.body.listings.find((l) => l.id === listing.body.listing.id).categoryLabel, 'Verzegelde arganolie');
  const foundAr = await api(`/listings?all=1&q=${uniq}`, { token: karim, lang: 'ar' });
  assert.equal(foundAr.body.listings.find((l) => l.id === listing.body.listing.id).categoryLabel, 'زيت أركان مختوم');

  const notFound = await api('/listings?all=1&q=motquinexistenullepart', { token: karim });
  assert.ok(!notFound.body.listings.some((l) => l.id === listing.body.listing.id));
});

test('i18n des erreurs API : Accept-Language traduit body.error (fr/ar/nl)', async () => {
  const bad = { method: 'POST', body: { email: 'fatima@demo.wigofly.app', password: 'wrong' } };

  const fr = await api('/auth/login', bad);
  assert.equal(fr.status, 401);
  assert.equal(fr.body.error, 'Email ou mot de passe incorrect');

  const ar = await api('/auth/login', { ...bad, lang: 'ar' });
  assert.equal(ar.body.error, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');

  // En-tête complexe de navigateur réel : le premier tag gagne.
  const nl = await api('/auth/login', { ...bad, lang: 'nl-BE,nl;q=0.9,fr;q=0.8' });
  assert.equal(nl.body.error, 'E-mail of wachtwoord onjuist');

  // Langue inconnue : repli français, jamais d'erreur cassée.
  const de = await api('/auth/login', { ...bad, lang: 'de' });
  assert.equal(de.body.error, 'Email ou mot de passe incorrect');
});

test('i18n des notifications : traduites à la lecture, la même notification suit Accept-Language', async () => {
  const fatima = tokens.fatima;
  // Compte voyageur dédié (pas le karim partagé) : les tests précédents peuvent avoir
  // déjà saturé son plafond de transactions actives (voir le même pattern plus haut,
  // ex. "centre matching expediteur").
  const karim = (await registerKycVerifiedUser(tokens.admin, 'NotifI18nVoyageur')).token;
  await completeTraining(karim);

  const listing = await api('/listings', {
    method: 'POST', token: fatima,
    body: {
      title: 'Notif i18n test', categoryId: 'argan', categoryLabel: "Huile d'argan",
      description: 'Description suffisamment longue pour passer la validation', weightKg: 1,
      valueEur: 30, from: 'Casablanca', to: 'Bruxelles', dateFrom: '2026-08-01', dateTo: '2026-08-20',
      travelerPay: 10, customsAccepted: true, photos: [TINY_PNG],
    },
  });
  assert.equal(listing.status, 200);

  const accepted = await api(`/listings/${listing.body.listing.id}/accept`, { method: 'POST', token: karim });
  assert.equal(accepted.status, 200);

  const fr = await api('/notifications', { token: fatima, lang: 'fr' });
  const first = fr.body.notifications[0];
  assert.match(first.text, /transporte/);
  assert.ok(first.key, 'la notification doit porter une clé de template, pas juste du texte figé');

  // Même notification persistée, lue en arabe puis en néerlandais : le texte change,
  // pas l'entrée en base — la traduction se fait à la lecture, pas à la création.
  const ar = await api('/notifications', { token: fatima, lang: 'ar' });
  assert.match(ar.body.notifications[0].text, /ينقل/);

  const nl = await api('/notifications', { token: fatima, lang: 'nl' });
  assert.match(nl.body.notifications[0].text, /vervoert/);

  const dashNl = await api('/dashboard', { token: fatima, lang: 'nl' });
  assert.match(dashNl.body.notifications[0].text, /vervoert/);

  assert.equal(fr.body.notifications[0].id, ar.body.notifications[0].id);
  assert.equal(fr.body.notifications[0].id, nl.body.notifications[0].id);
});

test('gestion des roles : promotion admin protegee et dernier admin conserve', async () => {
  const email = `role-${Date.now()}@exemple.com`;
  const password = 'motdepasse123';
  const registration = await api('/auth/register', {
    method: 'POST', body: { name: 'Membre roles', email, password, cguAccepted: true },
  });
  const code = registration.body.demoHint.match(/\d{6}/)[0];
  const verified = await api('/auth/verify-email', { method: 'POST', body: { email, code } });
  assert.equal(verified.status, 200);

  const forbidden = await api('/admin/users', { token: verified.body.token });
  assert.equal(forbidden.status, 403);

  const users = await api('/admin/users', { token: tokens.admin });
  assert.equal(users.status, 200);
  const member = users.body.users.find((user) => user.email === email);
  assert.ok(member);

  const forbiddenCaseFile = await api(`/admin/users/${member.id}/case-file`, { token: verified.body.token });
  assert.equal(forbiddenCaseFile.status, 403);
  const caseFile = await api(`/admin/users/${member.id}/case-file`, { token: tokens.admin });
  assert.equal(caseFile.status, 200, JSON.stringify(caseFile.body));
  assert.equal(caseFile.body.caseFile.member.id, member.id);
  assert.ok(Array.isArray(caseFile.body.caseFile.messages));
  const caseFileAccess = await api(`/admin/users/${member.id}/case-file/access`, {
    method: 'POST', token: tokens.admin, body: { section: 'overview' },
  });
  assert.equal(caseFileAccess.status, 200);

  const promoted = await api(`/admin/users/${member.id}/role`, {
    method: 'POST', token: tokens.admin, body: { role: 'admin' },
  });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.user.isAdmin, true);

  const promotedAccess = await api('/admin/overview', { token: verified.body.token });
  assert.equal(promotedAccess.status, 200);

  const removed = await api(`/admin/users/${member.id}/role`, {
    method: 'POST', token: tokens.admin, body: { role: 'member' },
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.user.isAdmin, false);

  const selfDemote = await api('/admin/users/u-admin/role', {
    method: 'POST', token: tokens.admin, body: { role: 'member' },
  });
  assert.equal(selfDemote.status, 400);
});

test('audit admin : les changements de profil et de trajet gardent avant et apres', async () => {
  const traveler = await registerKycVerifiedUser(tokens.admin, 'AuditHistorique');
  const profile = await api('/profile', {
    method: 'POST', token: traveler.token,
    body: { name: 'Membre audite', city: 'Oujda', phone: '0600000000' },
  });
  assert.equal(profile.status, 200, JSON.stringify(profile.body));

  const trip = await api('/trips', {
    method: 'POST', token: traveler.token,
    body: { from: 'Oujda', to: 'Bruxelles', date: '2099-07-18', capacityKg: 6, price: 25, description: 'Premier texte', conditions: 'Colis propre' },
  });
  assert.equal(trip.status, 200, JSON.stringify(trip.body));

  const editedTrip = await api(`/trips/${trip.body.trip.id}`, {
    method: 'PATCH', token: traveler.token,
    body: { price: 30, description: 'Texte modifie' },
  });
  assert.equal(editedTrip.status, 200, JSON.stringify(editedTrip.body));

  const users = await api('/admin/users', { token: tokens.admin });
  const member = users.body.users.find((user) => user.email === traveler.email);
  assert.ok(member);
  const file = await api(`/admin/users/${member.id}/case-file`, { token: tokens.admin });
  assert.equal(file.status, 200, JSON.stringify(file.body));

  const profileLog = file.body.caseFile.auditLogs.find((log) => log.action === 'profile.update');
  assert.equal(profileLog.meta.changes.find((change) => change.field === 'name').after, 'Membre audite');
  const tripLog = file.body.caseFile.auditLogs.find((log) => log.action === 'trip.update');
  assert.deepEqual(tripLog.meta.changes.find((change) => change.field === 'price'), { field: 'price', before: 25, after: 30 });
});

test('trajets : prend en charge avion et voiture avec avion par defaut', async () => {
  const traveler = await registerKycVerifiedUser(tokens.admin, 'TransportMode');
  const carTrip = await api('/trips', {
    method: 'POST',
    token: traveler.token,
    body: {
      transportMode: 'car',
      from: 'Bruxelles',
      to: 'Oujda',
      date: '2099-09-18',
      capacityKg: 10,
      price: 35,
    },
  });
  assert.equal(carTrip.status, 200, JSON.stringify(carTrip.body));
  assert.equal(carTrip.body.trip.transportMode, 'car');

  const planeTrip = await api('/trips', {
    method: 'POST',
    token: traveler.token,
    body: { from: 'Oujda', to: 'Paris', date: '2099-09-20', capacityKg: 4, price: 20 },
  });
  assert.equal(planeTrip.status, 200, JSON.stringify(planeTrip.body));
  assert.equal(planeTrip.body.trip.transportMode, 'plane');

  const changedToPlane = await api(`/trips/${carTrip.body.trip.id}`, {
    method: 'PATCH',
    token: traveler.token,
    body: { transportMode: 'plane' },
  });
  assert.equal(changedToPlane.status, 200, JSON.stringify(changedToPlane.body));
  assert.equal(changedToPlane.body.trip.transportMode, 'plane');

  const invalidMode = await api(`/trips/${carTrip.body.trip.id}`, {
    method: 'PATCH',
    token: traveler.token,
    body: { transportMode: 'boat' },
  });
  assert.equal(invalidMode.status, 400);
  assert.match(invalidMode.body.error, /transport/i);
});

test('suppression de conversation : retire seulement la boite du membre et preserve la preuve admin', async () => {
  const sender = await registerKycVerifiedUser(tokens.admin, 'SuppressionMessage');
  const recipient = await registerKycVerifiedUser(tokens.admin, 'DestinataireMessage');
  const recipientMe = await api('/me', { token: recipient.token });
  assert.equal(recipientMe.status, 200);

  const created = await api('/conversations', {
    method: 'POST', token: sender.token, body: { userId: recipientMe.body.user.id },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const conversationId = created.body.conversation.id;
  const message = await api(`/conversations/${conversationId}/messages`, {
    method: 'POST', token: sender.token, body: { text: 'Message conserve pour le dossier admin.' },
  });
  assert.equal(message.status, 200, JSON.stringify(message.body));

  const removed = await api(`/conversations/${conversationId}`, { method: 'DELETE', token: sender.token });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const senderInbox = await api('/conversations', { token: sender.token });
  assert.equal(senderInbox.body.conversations.some((item) => item.id === conversationId), false);
  const recipientConversation = await api(`/conversations/${conversationId}`, { token: recipient.token });
  assert.equal(recipientConversation.status, 200, JSON.stringify(recipientConversation.body));

  const users = await api('/admin/users', { token: tokens.admin });
  const member = users.body.users.find((user) => user.email === sender.email);
  const caseFile = await api(`/admin/users/${member.id}/case-file`, { token: tokens.admin });
  assert.equal(caseFile.status, 200, JSON.stringify(caseFile.body));
  assert.ok(caseFile.body.caseFile.messages.some((item) => item.id === message.body.message.id));
  const deletion = caseFile.body.caseFile.auditLogs.find((log) => log.action === 'conversation.delete');
  assert.equal(deletion.meta.retainedForAdmin, true);
  assert.equal(deletion.meta.scope, 'inbox_only');
});

test('refonte simple : trajets voyageurs, enregistres, messagerie et operations', async () => {
  const fatima = tokens.fatima;
  const karim = tokens.karim;
  const mehdi = tokens.mehdi;
  const admin = tokens.admin;

  const published = await api('/trips', {
    method: 'POST',
    token: karim,
    body: {
      from: 'Oujda',
      to: 'Bruxelles',
      date: '2026-09-10',
      capacityKg: 7,
      price: 31,
      description: 'Je peux transporter un petit colis propre pendant mon vol.',
      conditions: 'Pas de liquide ouvert ni produit interdit.',
    },
  });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.trip.price, 31);
  assert.match(published.body.trip.description, /petit colis propre/);

  const mineBeforeOperation = await api('/trips/mine', { token: karim });
  assert.equal(mineBeforeOperation.status, 200);
  const minePublished = mineBeforeOperation.body.trips.find((t) => t.id === published.body.trip.id);
  assert.ok(minePublished, 'le profil voyageur doit lister le trajet publie');
  assert.equal(minePublished.activeOperations, 0);

  const ownTripDetail = await api(`/trips/${published.body.trip.id}`, { token: karim });
  assert.equal(ownTripDetail.status, 200);
  assert.equal(ownTripDetail.body.trip.activeOperations, 0, 'le proprietaire voit le nombre de ses operations actives');

  const otherTravelersOnly = await api('/trips?excludeMine=1', { token: karim });
  assert.equal(otherTravelersOnly.status, 200);
  assert.ok(!otherTravelersOnly.body.trips.some((t) => t.id === published.body.trip.id), 'le feed des autres exclut mes trajets');

  const removable = await api('/trips', {
    method: 'POST',
    token: karim,
    body: {
      from: 'Fes',
      to: 'Paris',
      date: '2026-10-01',
      capacityKg: 4,
      price: 19,
      description: 'Trajet test qui peut etre retire.',
    },
  });
  assert.equal(removable.status, 200, JSON.stringify(removable.body));
  const editByOther = await api(`/trips/${removable.body.trip.id}`, {
    method: 'PATCH',
    token: fatima,
    body: { price: 22 },
  });
  assert.equal(editByOther.status, 404, 'un utilisateur ne peut pas modifier le trajet d un autre');
  const edited = await api(`/trips/${removable.body.trip.id}`, {
    method: 'PATCH',
    token: karim,
    body: {
      from: 'Fes',
      to: 'Lyon',
      date: '2026-10-02',
      capacityKg: 5,
      price: 21,
      description: 'Trajet test modifie avant retrait.',
      conditions: 'Colis ferme uniquement.',
    },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.trip.to, 'Lyon');
  assert.equal(edited.body.trip.price, 21);
  const feedAfterEdit = await api('/trips?to=Lyon', { token: fatima });
  assert.equal(feedAfterEdit.status, 200);
  assert.ok(feedAfterEdit.body.trips.some((t) => t.id === removable.body.trip.id && t.price === 21), 'un trajet modifie apparait avec ses nouvelles infos');
  const removed = await api(`/trips/${removable.body.trip.id}`, { method: 'DELETE', token: karim });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const feedAfterRemove = await api('/trips', { token: fatima });
  assert.equal(feedAfterRemove.status, 200);
  assert.ok(!feedAfterRemove.body.trips.some((t) => t.id === removable.body.trip.id), 'un trajet retire disparait du feed');

  const feed = await api('/trips', { token: fatima });
  assert.equal(feed.status, 200);
  assert.ok(feed.body.trips.length >= 1, 'le feed doit exposer des posts voyageurs');
  const overview = await api('/trips/overview', { token: fatima });
  assert.equal(overview.status, 200, JSON.stringify(overview.body));
  assert.ok(Array.isArray(overview.body.trips));
  assert.ok(Array.isArray(overview.body.myTrips));
  const trip = feed.body.trips.find((t) => t.id === published.body.trip.id)
    || feed.body.trips.find((t) => t.from === 'Casablanca' && t.to === 'Bruxelles')
    || feed.body.trips[0];
  assert.equal(trip.status, 'published');
  assert.ok(trip.traveler);
  assert.equal(trip.saved, false);

  const detail = await api(`/trips/${trip.id}`, { token: fatima });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.trip.price > 0, true);
  assert.ok(detail.body.trip.description);

  const filteredByDate = await api('/trips?date=2026-09-01', { token: fatima });
  assert.equal(filteredByDate.status, 200);
  assert.ok(filteredByDate.body.trips.some((t) => t.id === trip.id), 'le filtre date minimum garde les trajets posterieurs');
  assert.ok(feed.body.trips.every((t) => t.traveler?.kycStatus === 'verified'), 'le feed ne montre que des voyageurs KYC verifies');

  const saved1 = await api(`/saved-trips/${trip.id}`, { method: 'POST', token: fatima });
  assert.equal(saved1.status, 200);
  assert.equal(saved1.body.trip.saved, true);
  const saved2 = await api(`/saved-trips/${trip.id}`, { method: 'POST', token: fatima });
  assert.equal(saved2.status, 200);
  const savedList = await api('/saved-trips', { token: fatima });
  assert.equal(savedList.status, 200);
  assert.equal(savedList.body.trips.filter((t) => t.id === trip.id).length, 1, 'un trajet enregistre reste unique');

  const conversation = await api('/conversations', { method: 'POST', token: fatima, body: { tripId: trip.id } });
  assert.equal(conversation.status, 200, JSON.stringify(conversation.body));
  assert.equal(conversation.body.conversation.trip.id, trip.id);

  const sent = await api(`/conversations/${conversation.body.conversation.id}/messages`, {
    method: 'POST',
    token: fatima,
    body: { text: 'Bonjour, votre trajet est-il toujours disponible ?' },
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.message.flagged, false);
  assert.equal(sent.body.conversation.contextType, 'trip');
  assert.ok(sent.body.conversation.lastMessagePreview);

  const retryClientId = `client-test-${Date.now()}`;
  const retry1 = await api(`/conversations/${conversation.body.conversation.id}/messages`, {
    method: 'POST',
    token: fatima,
    body: { text: 'Message idempotent', clientId: retryClientId },
  });
  const retry2 = await api(`/conversations/${conversation.body.conversation.id}/messages`, {
    method: 'POST',
    token: fatima,
    body: { text: 'Message idempotent', clientId: retryClientId },
  });
  assert.equal(retry1.status, 200, JSON.stringify(retry1.body));
  assert.equal(retry2.status, 200, JSON.stringify(retry2.body));
  assert.equal(retry2.body.message.id, retry1.body.message.id, 'un retry avec le meme clientId ne duplique pas le message');

  const attached = await api(`/conversations/${conversation.body.conversation.id}/messages`, {
    method: 'POST',
    token: fatima,
    body: {
      text: 'Voici la photo du colis.',
      clientId: `client-attachment-${Date.now()}`,
      attachments: [{ name: 'colis.png', dataUrl: TINY_PNG }],
    },
  });
  assert.equal(attached.status, 200, JSON.stringify(attached.body));
  assert.equal(attached.body.message.type, 'attachment');
  assert.equal(attached.body.message.attachments.length, 1);
  assert.equal(attached.body.message.attachments[0].type, 'image');

  const located = await api(`/conversations/${conversation.body.conversation.id}/messages`, {
    method: 'POST',
    token: fatima,
    body: {
      location: {
        kind: 'current', label: 'Point de rendez-vous', latitude: 50.85045, longitude: 4.34878,
        accuracy: 18, expiresInMinutes: 30,
      },
    },
  });
  assert.equal(located.status, 200, JSON.stringify(located.body));
  assert.equal(located.body.message.type, 'location');
  assert.equal(located.body.message.location.precision, 'approximate');
  assert.equal(located.body.message.location.latitude, 50.85);
  assert.equal(located.body.message.location.expiresAt > Date.now(), true);

  const badLocation = await api(`/conversations/${conversation.body.conversation.id}/messages`, {
    method: 'POST', token: fatima, body: { location: { kind: 'current', latitude: 999, longitude: 4 } },
  });
  assert.equal(badLocation.status, 400);

  const badAttachment = await api(`/conversations/${conversation.body.conversation.id}/messages`, {
    method: 'POST',
    token: fatima,
    body: {
      text: 'Fichier invalide',
      attachments: [{ name: 'note.txt', dataUrl: 'data:text/plain;base64,SGVsbG8=' }],
    },
  });
  assert.equal(badAttachment.status, 400);

  const flaggedConversationMessage = await api(`/conversations/${conversation.body.conversation.id}/messages`, {
    method: 'POST',
    token: fatima,
    body: { text: 'Mon telephone est 0612345678 mais je reste sur Wigofly.' },
  });
  assert.equal(flaggedConversationMessage.status, 422, JSON.stringify(flaggedConversationMessage.body));
  assert.equal(flaggedConversationMessage.body.code, 'message_safety_blocked');
  assert.ok(flaggedConversationMessage.body.categories.includes('phone'));

  const navKarimUnread = await api('/navigation-summary', { token: karim });
  assert.equal(navKarimUnread.status, 200);
  assert.equal(navKarimUnread.body.messagesUnread >= 1, true, 'le badge messagerie doit compter les messages non lus');

  const readByKarim = await api(`/conversations/${conversation.body.conversation.id}/read`, { method: 'POST', token: karim });
  assert.equal(readByKarim.status, 200, JSON.stringify(readByKarim.body));
  assert.equal(readByKarim.body.conversation.unread, 0);
  const unreadAgain = await api(`/conversations/${conversation.body.conversation.id}/unread`, { method: 'POST', token: karim });
  assert.equal(unreadAgain.status, 200, JSON.stringify(unreadAgain.body));
  assert.equal(unreadAgain.body.conversation.unreadCount >= 1, true, 'marquer non lu restaure un compteur local');
  await api(`/conversations/${conversation.body.conversation.id}/read`, { method: 'POST', token: karim });

  const unreadFilter = await api('/conversations?filter=unread', { token: karim });
  assert.equal(unreadFilter.status, 200);
  assert.equal(unreadFilter.body.conversations.some((c) => c.id === conversation.body.conversation.id), false);

  const pinned = await api(`/conversations/${conversation.body.conversation.id}/pin`, {
    method: 'POST',
    token: fatima,
    body: { pinned: true },
  });
  assert.equal(pinned.status, 200, JSON.stringify(pinned.body));
  assert.equal(pinned.body.conversation.pinned, true);
  const pinnedFilter = await api('/conversations?filter=pinned', { token: fatima });
  assert.equal(pinnedFilter.status, 200);
  assert.equal(pinnedFilter.body.conversations[0].id, conversation.body.conversation.id);
  await api(`/conversations/${conversation.body.conversation.id}/pin`, {
    method: 'POST',
    token: fatima,
    body: { pinned: false },
  });

  const archived = await api(`/conversations/${conversation.body.conversation.id}/archive`, {
    method: 'POST',
    token: fatima,
    body: { archived: true },
  });
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  assert.equal(archived.body.conversation.archived, true);
  const hiddenAfterArchive = await api('/conversations', { token: fatima });
  assert.equal(hiddenAfterArchive.body.conversations.some((c) => c.id === conversation.body.conversation.id), false);
  const archivedList = await api('/conversations?filter=archived', { token: fatima });
  assert.equal(archivedList.body.conversations.some((c) => c.id === conversation.body.conversation.id), true);
  const restored = await api(`/conversations/${conversation.body.conversation.id}/archive`, {
    method: 'POST',
    token: fatima,
    body: { archived: false },
  });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.conversation.archived, false);
  const archivedListAfterRestore = await api('/conversations?filter=archived', { token: fatima });
  assert.equal(archivedListAfterRestore.body.conversations.some((c) => c.id === conversation.body.conversation.id), false);

  const report = await api(`/conversations/${conversation.body.conversation.id}/report`, {
    method: 'POST',
    token: fatima,
    body: {
      reasonCode: 'suspicious',
      reason: 'Comportement suspect dans la discussion',
      comment: 'La personne insiste pour sortir de Wigofly',
    },
  });
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.equal(report.body.report.conversationId, conversation.body.conversation.id);
  assert.equal(report.body.report.reasonCode, 'suspicious');
  assert.match(report.body.report.comment, /sortir de Wigofly/);
  const adminOverview = await api('/admin/overview', { token: admin });
  assert.equal(adminOverview.status, 200, JSON.stringify(adminOverview.body));
  const conversationReview = adminOverview.body.reviewQueue.find((item) =>
    item.type === 'conversation' && item.refId === conversation.body.conversation.id
  );
  assert.ok(conversationReview, 'le signalement conversation doit entrer en file admin');
  assert.equal(conversationReview.conversation.reportCount, 1);
  assert.equal(conversationReview.conversation.reports[0].reasonCode, 'suspicious');
  assert.match(conversationReview.conversation.reports[0].comment, /sortir de Wigofly/);
  assert.equal(conversationReview.conversation.participants.length, 2);
  assert.ok(conversationReview.conversation.messages.length >= 1);
  const adminOps = await api('/admin/ops', { token: admin });
  assert.equal(adminOps.status, 200, JSON.stringify(adminOps.body));
  assert.ok(adminOps.body.ops.tasks.some((task) => task.id === 'review-conversations' && task.count >= 1));
  const actionFilter = await api('/conversations?filter=action', { token: fatima });
  assert.equal(actionFilter.status, 200);
  assert.ok(Array.isArray(actionFilter.body.conversations));
  const reviewedConversation = await api(`/admin/review/${conversationReview.id}`, {
    method: 'POST',
    token: admin,
    body: { decision: 'conversation_dismissed' },
  });
  assert.equal(reviewedConversation.status, 200, JSON.stringify(reviewedConversation.body));
  const overviewAfterConversationReview = await api('/admin/overview', { token: admin });
  assert.equal(overviewAfterConversationReview.body.reviewQueue.some((item) => item.id === conversationReview.id), false);
  const outsiderReport = await api(`/conversations/${conversation.body.conversation.id}/report`, {
    method: 'POST',
    token: mehdi,
    body: { reason: 'Je ne devrais pas pouvoir signaler ceci' },
  });
  assert.equal(outsiderReport.status, 404);

  const navKarimRead = await api('/navigation-summary', { token: karim });
  assert.equal(navKarimRead.status, 200);
  assert.equal(navKarimRead.body.messagesUnread, 0, 'le badge messagerie redescend apres marquage lu');

  const messages = await api(`/conversations/${conversation.body.conversation.id}/messages`, { token: fatima });
  assert.equal(messages.status, 200);
  assert.equal(messages.body.messages.filter((m) => m.clientId === retryClientId).length, 1);
  const pagedMessages = await api(`/conversations/${conversation.body.conversation.id}/messages?limit=2`, { token: fatima });
  assert.equal(pagedMessages.status, 200);
  assert.equal(pagedMessages.body.messages.length, 2);
  assert.equal(pagedMessages.body.page.hasMore, true);
  const olderMessages = await api(`/conversations/${conversation.body.conversation.id}/messages?limit=2&before=${pagedMessages.body.page.nextBefore}`, { token: fatima });
  assert.equal(olderMessages.status, 200);
  assert.equal(olderMessages.body.messages.length >= 1, true);
  assert.ok(olderMessages.body.messages.every((m) => m.at < pagedMessages.body.page.nextBefore));
  const searchedMessages = await api(`/conversations/${conversation.body.conversation.id}/messages?q=photo%20du%20colis`, { token: fatima });
  assert.equal(searchedMessages.status, 200);
  assert.equal(searchedMessages.body.messages.some((m) => m.id === attached.body.message.id), true);
  assert.equal(searchedMessages.body.messages.every((m) => `${m.text || ''} ${(m.attachments || []).map((a) => a.name).join(' ')}`.toLowerCase().includes('photo du colis')), true);

  const acceptedThenRejected = await api(`/trips/${trip.id}/accept`, {
    method: 'POST',
    token: fatima,
    body: { descriptionParcel: 'Demande test refus voyageur', shipmentType: 'parcel', weightKg: 2, price: 1 },
  });
  assert.equal(acceptedThenRejected.status, 200, JSON.stringify(acceptedThenRejected.body));
  assert.equal(acceptedThenRejected.body.operation.operationStatus, 'attente_confirmation');
  assert.equal(acceptedThenRejected.body.operation.shipmentType, 'parcel');
  assert.equal(acceptedThenRejected.body.operation.weightKg, 2);
  assert.equal(acceptedThenRejected.body.operation.price, Math.round((trip.price / trip.capacityKg) * 2 * 100) / 100, 'le prix colis doit etre calcule par le serveur');
  const rejected = await api(`/operations/${acceptedThenRejected.body.operation.id}/reject`, {
    method: 'POST',
    token: karim,
    body: { reason: 'Plus de place disponible' },
  });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejected.body.operation.operationStatus, 'termine');
  assert.equal(rejected.body.operation.status, 'cancelled');

  const acceptedThenCancelled = await api(`/trips/${trip.id}/accept`, {
    method: 'POST',
    token: fatima,
    body: { descriptionParcel: 'Demande test annulation expediteur', shipmentType: 'document', documentCount: 2, price: 1 },
  });
  assert.equal(acceptedThenCancelled.status, 200, JSON.stringify(acceptedThenCancelled.body));
  assert.equal(acceptedThenCancelled.body.operation.operationStatus, 'attente_confirmation');
  assert.equal(acceptedThenCancelled.body.operation.shipmentType, 'document');
  assert.equal(acceptedThenCancelled.body.operation.documentCount, 2);
  assert.equal(acceptedThenCancelled.body.operation.price, 6, 'un document coute 3 EUR');
  const cancelledBySender = await api(`/operations/${acceptedThenCancelled.body.operation.id}/cancel`, {
    method: 'POST',
    token: fatima,
    body: { reason: 'Changement de plan' },
  });
  assert.equal(cancelledBySender.status, 200, JSON.stringify(cancelledBySender.body));
  assert.equal(cancelledBySender.body.operation.operationStatus, 'termine');
  assert.equal(cancelledBySender.body.operation.status, 'cancelled');
  const activeAfterCancel = await api('/operations', { token: fatima });
  assert.equal(activeAfterCancel.status, 200);
  assert.ok(!activeAfterCancel.body.operations.some((op) => op.id === acceptedThenCancelled.body.operation.id));
  const historyAfterCancel = await api('/operations?history=1', { token: fatima });
  assert.equal(historyAfterCancel.status, 200);
  assert.ok(historyAfterCancel.body.operations.some((op) => op.id === acceptedThenCancelled.body.operation.id));

  const accepted = await api(`/trips/${trip.id}/accept`, {
    method: 'POST',
    token: fatima,
    body: { descriptionParcel: 'Petit colis propre, 2 kg', price: trip.price },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.operation.trip.id, trip.id);
  assert.equal(accepted.body.operation.operationStatus, 'attente_confirmation');
  assert.equal(accepted.body.operation.paymentStatus, 'pending');

  const operationConversation = await api('/conversations', {
    method: 'POST',
    token: fatima,
    body: { operationId: accepted.body.operation.id },
  });
  assert.equal(operationConversation.status, 200, JSON.stringify(operationConversation.body));
  assert.equal(operationConversation.body.conversation.operation.id, accepted.body.operation.id);

  const payTooSoon = await api(`/operations/${accepted.body.operation.id}/pay`, { method: 'POST', token: fatima });
  assert.equal(payTooSoon.status, 400, 'le paiement doit attendre la confirmation du voyageur');

  const mineWithOperation = await api('/trips/mine', { token: karim });
  assert.equal(mineWithOperation.status, 200);
  const mineActive = mineWithOperation.body.trips.find((t) => t.id === trip.id);
  assert.ok(mineActive.activeOperations >= 1, 'le profil doit signaler les operations actives sur un trajet');
  const removeBlocked = await api(`/trips/${trip.id}`, { method: 'DELETE', token: karim });
  assert.equal(removeBlocked.status, 400, 'un trajet avec operation active ne peut pas etre retire');
  const editBlocked = await api(`/trips/${trip.id}`, {
    method: 'PATCH',
    token: karim,
    body: { price: trip.price + 3 },
  });
  assert.equal(editBlocked.status, 400, 'un trajet avec operation active ne peut pas etre modifie');

  const navKarimAction = await api('/navigation-summary', { token: karim });
  assert.equal(navKarimAction.status, 200);
  assert.equal(navKarimAction.body.operationsActionRequired >= 1, true, 'le badge en cours doit compter les demandes a confirmer');

  const travelerConfirmed = await api(`/operations/${accepted.body.operation.id}/confirm`, { method: 'POST', token: karim });
  assert.equal(travelerConfirmed.status, 200, JSON.stringify(travelerConfirmed.body));
  assert.equal(travelerConfirmed.body.operation.operationStatus, 'paiement_requis');

  const navFatimaAction = await api('/navigation-summary', { token: fatima });
  assert.equal(navFatimaAction.status, 200);
  assert.equal(navFatimaAction.body.operationsActionRequired >= 1, true, 'le badge en cours doit compter les actions requises');

  const operations = await api('/operations', { token: fatima });
  assert.equal(operations.status, 200);
  assert.ok(operations.body.operations.some((op) => op.id === accepted.body.operation.id));

  const paid = await api(`/operations/${accepted.body.operation.id}/pay`, { method: 'POST', token: fatima });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.operation.operationStatus, 'paye');
  assert.equal(paid.body.operation.pickupCode, undefined, 'un code ne fuite jamais dans la vue operation');
  assert.equal(paid.body.operation.securityCodes, undefined, 'les hashes ne quittent jamais le serveur');
  const genericBypass = await api(`/operations/${accepted.body.operation.id}/confirm`, { method: 'POST', token: fatima });
  assert.equal(genericBypass.status, 400, 'la transition generique ne peut pas contourner le code de remise');

  const pickupCodeBySender = await api(`/operations/${accepted.body.operation.id}/pickup-code`, { method: 'POST', token: fatima });
  assert.equal(pickupCodeBySender.status, 403, 'seul le voyageur recoit le code de remise');
  const pickupCode = await api(`/operations/${accepted.body.operation.id}/pickup-code`, { method: 'POST', token: karim });
  assert.equal(pickupCode.status, 200, JSON.stringify(pickupCode.body));
  assert.match(pickupCode.body.code, /^\d{8}$/);
  assert.equal(pickupCode.body.operation.pickupCode, undefined, 'le code ne revient pas dans la ressource operation');

  const invalidPickup = await api(`/operations/${accepted.body.operation.id}/confirm-pickup`, { method: 'POST', token: fatima, body: { code: '00000000' } });
  assert.equal(invalidPickup.status, 400, 'un faux code ne fait pas avancer la remise');
  const stillPaid = await api(`/operations/${accepted.body.operation.id}`, { token: fatima });
  assert.equal(stillPaid.body.operation.operationStatus, 'paye');
  const pickup = await api(`/operations/${accepted.body.operation.id}/confirm-pickup`, { method: 'POST', token: fatima, body: { code: pickupCode.body.code } });
  assert.equal(pickup.status, 200);
  assert.equal(pickup.body.operation.operationStatus, 'en_transport');
  assert.equal(pickup.body.operation.status, 'in_transit');

  const deliveryCodeByTraveler = await api(`/operations/${accepted.body.operation.id}/delivery-code`, { method: 'POST', token: karim });
  assert.equal(deliveryCodeByTraveler.status, 403, 'seul l expediteur recoit le code de livraison');
  const deliveryCode = await api(`/operations/${accepted.body.operation.id}/delivery-code`, { method: 'POST', token: fatima });
  assert.equal(deliveryCode.status, 200, JSON.stringify(deliveryCode.body));
  assert.match(deliveryCode.body.code, /^\d{8}$/);
  const delivered = await api(`/operations/${accepted.body.operation.id}/confirm-delivery`, { method: 'POST', token: karim, body: { code: deliveryCode.body.code } });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.operation.operationStatus, 'termine');
  assert.equal(delivered.body.operation.status, 'released');

  const activeAfterDelivery = await api('/operations', { token: fatima });
  assert.ok(!activeAfterDelivery.body.operations.some((op) => op.id === accepted.body.operation.id));
  const historyAfterDelivery = await api('/operations?history=1', { token: fatima });
  assert.equal(historyAfterDelivery.status, 200);
  assert.ok(historyAfterDelivery.body.operations.some((op) => op.id === accepted.body.operation.id));

  const detailAfterDelivery = await api(`/operations/${accepted.body.operation.id}`, { token: fatima });
  assert.equal(detailAfterDelivery.status, 200);
  assert.equal(detailAfterDelivery.body.operation.operationStatus, 'termine');

  const ratedTraveler = await api(`/transactions/${accepted.body.operation.id}/rate`, {
    method: 'POST',
    token: fatima,
    body: { targetId: detailAfterDelivery.body.operation.travelerId, stars: 5, comment: 'Voyageur fiable sur ce trajet.' },
  });
  assert.equal(ratedTraveler.status, 200, JSON.stringify(ratedTraveler.body));
  const travelerReviews = await api(`/users/${detailAfterDelivery.body.operation.travelerId}/reviews`, { token: fatima });
  assert.equal(travelerReviews.status, 200);
  assert.ok(travelerReviews.body.reviews.some((r) => r.comment === 'Voyageur fiable sur ce trajet.'), 'la notation simple apparait sur le profil');
  const travelerProfile = await api(`/users/${detailAfterDelivery.body.operation.travelerId}`, { token: fatima });
  assert.equal(travelerProfile.status, 200);
  assert.equal(travelerProfile.body.user.id, detailAfterDelivery.body.operation.travelerId);
  assert.ok(Array.isArray(travelerProfile.body.trips));
  assert.equal(typeof travelerProfile.body.stats.completed, 'number');

  const codeLockedOperation = await api(`/trips/${trip.id}/accept`, {
    method: 'POST', token: fatima, body: { descriptionParcel: 'Test verrouillage code', shipmentType: 'parcel', weightKg: 1 },
  });
  assert.equal(codeLockedOperation.status, 200);
  await api(`/operations/${codeLockedOperation.body.operation.id}/confirm`, { method: 'POST', token: karim });
  await api(`/operations/${codeLockedOperation.body.operation.id}/pay`, { method: 'POST', token: fatima });
  const protectedCode = await api(`/operations/${codeLockedOperation.body.operation.id}/pickup-code`, { method: 'POST', token: karim });
  assert.equal(protectedCode.status, 200);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const wrong = await api(`/operations/${codeLockedOperation.body.operation.id}/confirm-pickup`, { method: 'POST', token: fatima, body: { code: '11111111' } });
    assert.equal(wrong.status, attempt === 5 ? 429 : 400);
  }
  const lockedCorrectCode = await api(`/operations/${codeLockedOperation.body.operation.id}/confirm-pickup`, { method: 'POST', token: fatima, body: { code: protectedCode.body.code } });
  assert.equal(lockedCorrectCode.status, 429, 'un code verrouille ne peut pas etre force meme s il est ensuite connu');
  const lockedView = await api(`/operations/${codeLockedOperation.body.operation.id}`, { token: fatima });
  assert.equal(lockedView.body.operation.operationStatus, 'paye');
  assert.equal(lockedView.body.operation.security.pickup.locked, true);

  const acceptedForDispute = await api(`/trips/${trip.id}/accept`, {
    method: 'POST',
    token: fatima,
    body: { descriptionParcel: 'Deuxieme colis test litige', price: trip.price },
  });
  assert.equal(acceptedForDispute.status, 200);
  await api(`/operations/${acceptedForDispute.body.operation.id}/pay`, { method: 'POST', token: fatima });
  const disputed = await api(`/operations/${acceptedForDispute.body.operation.id}/dispute`, {
    method: 'POST',
    token: fatima,
    body: { reason: 'Le rendez-vous pose probleme' },
  });
  assert.equal(disputed.status, 200);
  assert.equal(disputed.body.operation.operationStatus, 'litige');
  assert.equal(disputed.body.operation.status, 'disputed');
  assert.match(disputed.body.dispute.reason, /rendez-vous/);
  const detailWithDispute = await api(`/operations/${acceptedForDispute.body.operation.id}`, { token: fatima });
  assert.equal(detailWithDispute.status, 200);
  assert.equal(detailWithDispute.body.operation.dispute.id, disputed.body.dispute.id);
  const evidence = await api(`/operations/${acceptedForDispute.body.operation.id}/evidence`, {
    method: 'POST',
    token: fatima,
    body: { text: 'Capture de conversation et heure du rendez-vous ajoutees.' },
  });
  assert.equal(evidence.status, 200, JSON.stringify(evidence.body));
  assert.equal(evidence.body.operation.dispute.evidence.length, 1);
  assert.match(evidence.body.operation.dispute.evidence[0].text, /Capture de conversation/);
});

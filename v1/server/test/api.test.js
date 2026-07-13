// Suite d'intégration boîte noire : tourne contre une vraie instance du serveur (port et
// data.json dédiés, voir helpers.js), exactement les scénarios vérifiés à la main en curl
// tout au long de ce projet. Objectif : que ces vérifications ne dépendent plus de la
// mémoire de qui a testé quoi la dernière fois.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, api, loginAs, completeTraining, TINY_PNG } from './helpers.js';

before(startServer);
after(stopServer);

test('GET /api/config répond', async () => {
  const { status, body } = await api('/config');
  assert.equal(status, 200);
  assert.equal(body.demo, true);
});

test('connexion : identifiants valides vs invalides', async () => {
  const ok = await api('/auth/login', { method: 'POST', body: { email: 'fatima@demo.wigofly.app', password: 'demo1234' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);

  const badPassword = await api('/auth/login', { method: 'POST', body: { email: 'fatima@demo.wigofly.app', password: 'wrong' } });
  assert.equal(badPassword.status, 401);

  const badEmail = await api('/auth/login', { method: 'POST', body: { email: 'inconnu@exemple.com', password: 'demo1234' } });
  assert.equal(badEmail.status, 401);
});

test('IDOR : un tiers ne peut pas lire la transaction d\'autrui', async () => {
  const fatima = await loginAs('fatima@demo.wigofly.app');
  const karim = await loginAs('karim@demo.wigofly.app');
  const mehdi = await loginAs('mehdi@demo.wigofly.app'); // tiers, non partie à la transaction
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
  const fatima = await loginAs('fatima@demo.wigofly.app');
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
  const fatima = await loginAs('fatima@demo.wigofly.app');
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

test('parcours complet : annonce → escrow → scellage → double validation → livraison → notation', async () => {
  const fatima = await loginAs('fatima@demo.wigofly.app');
  const karim = await loginAs('karim@demo.wigofly.app');
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
  const karim = await loginAs('karim@demo.wigofly.app');
  const admin = await loginAs('admin@demo.wigofly.app');

  const asTraveler = await api('/admin/fraud', { token: karim });
  assert.equal(asTraveler.status, 403);

  const asAdmin = await api('/admin/fraud', { token: admin });
  assert.equal(asAdmin.status, 200);
  assert.ok(Array.isArray(asAdmin.body.linkedAccounts));
  assert.ok(Array.isArray(asAdmin.body.repeatPairs));
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

  const admin = await loginAs('admin@demo.wigofly.app');
  const queue = await api('/admin/kyc?status=pending', { token: admin });
  assert.equal(queue.status, 200);
  const submission = queue.body.submissions.find((s) => s.user?.email === email);
  assert.ok(submission, 'la soumission doit apparaître dans la file admin');

  const decide = await api(`/admin/kyc/${submission.id}/decide`, {
    method: 'POST', token: admin, body: { decision: 'approve' },
  });
  assert.equal(decide.status, 200);

  const meAfterApproval = await api('/me', { token });
  assert.equal(meAfterApproval.body.user.kycStatus, 'verified');
});

test('litige : ouverture, preuve, tiers exclu, arbitrage admin (remboursement)', async () => {
  const fatima = await loginAs('fatima@demo.wigofly.app');
  const karim = await loginAs('karim@demo.wigofly.app');
  const mehdi = await loginAs('mehdi@demo.wigofly.app');
  const admin = await loginAs('admin@demo.wigofly.app');
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

  const txAfterResolution = await api(`/transactions/${tx.id}`, { token: fatima });
  assert.equal(txAfterResolution.body.transaction.status, 'refunded');
  assert.equal(txAfterResolution.body.transaction.escrow.state, 'refunded');
});

test('zone grise : catégorie inconnue → revue humaine → promotion en liste blanche', async () => {
  const fatima = await loginAs('fatima@demo.wigofly.app');
  const admin = await loginAs('admin@demo.wigofly.app');
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

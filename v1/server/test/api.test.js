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
  const karim = tokens.karim;
  const admin = tokens.admin;

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

  const admin = tokens.admin;
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
  const tx = accepted.body.transaction;

  // Réservé au voyageur : l'expéditeur ne peut pas refuser sa propre transaction.
  const senderRefuse = await api(`/transactions/${tx.id}/refuse`, { method: 'POST', token: fatima, body: { reason: 'test' } });
  assert.equal(senderRefuse.status, 403);

  const refused = await api(`/transactions/${tx.id}/refuse`, { method: 'POST', token: karim, body: { reason: 'Contenu ne correspond pas à la description' } });
  assert.equal(refused.status, 200);
  assert.equal(refused.body.transaction.status, 'cancelled');
  assert.equal(refused.body.transaction.escrow.state, 'refunded');

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
  const tx = accepted.body.transaction;

  const cleanMsg = await api(`/transactions/${tx.id}/messages`, { method: 'POST', token: fatima, body: { text: 'On se voit où pour la remise ?' } });
  assert.equal(cleanMsg.status, 200);
  assert.equal(cleanMsg.body.message.flagged, false);
  assert.equal(cleanMsg.body.warning, null);

  const leakedMsg = await api(`/transactions/${tx.id}/messages`, { method: 'POST', token: karim, body: { text: 'Appelle-moi au 0612345678 direct' } });
  assert.equal(leakedMsg.status, 200); // le chat avertit mais ne bloque pas (contrairement aux avis)
  assert.equal(leakedMsg.body.message.flagged, true);
  assert.ok(leakedMsg.body.warning);

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
  const tx = accepted.body.transaction;

  const outsider = await api(`/transactions/${tx.id}/customs-recap`, { token: mehdi });
  assert.equal(outsider.status, 403);

  const recap = await api(`/transactions/${tx.id}/customs-recap`, { token: karim });
  assert.equal(recap.status, 200);
  assert.equal(recap.body.recap.valueEur, 40);
  assert.equal(recap.body.recap.weightKg, 2);
  assert.ok(recap.body.recap.corridor, 'la franchise douanière du corridor doit être incluse');
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

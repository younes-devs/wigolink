// Black-box integration tests against an isolated server and data store.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TINY_PNG,
  api,
  loginAs,
  startServer,
  stopServer,
} from './helpers.js';

const tokens = {};

before(async () => {
  await startServer();
  tokens.fatima = await loginAs('fatima@demo.wigofly.app');
  tokens.karim = await loginAs('karim@demo.wigofly.app');
  tokens.mehdi = await loginAs('mehdi@demo.wigofly.app');
  tokens.admin = await loginAs('admin@demo.wigofly.app');
});

after(stopServer);

test('configuration, health and authentication', async () => {
  const config = await api('/config');
  assert.equal(config.status, 200);
  assert.equal(config.body.demo, true);

  const health = await api('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.database, 'local');
  assert.ok(Date.parse(health.body.at));
  assert.equal(health.body.databaseUrl, undefined);

  const regular = await api('/auth/login', {
    method: 'POST',
    body: {
      email: 'fatima@demo.wigofly.app',
      password: 'demo1234',
    },
  });
  assert.equal(regular.status, 200);
  assert.ok(regular.body.token);
  assert.equal(regular.body.sessionDurationDays, 1);

  const remembered = await api('/auth/login', {
    method: 'POST',
    body: {
      email: 'fatima@demo.wigofly.app',
      password: 'demo1234',
      rememberMe: true,
    },
  });
  assert.equal(remembered.status, 200);
  assert.equal(remembered.body.sessionDurationDays, 30);

  const refused = await api('/auth/login', {
    method: 'POST',
    body: {
      email: 'fatima@demo.wigofly.app',
      password: 'incorrect',
    },
  });
  assert.equal(refused.status, 401);
});

test('email accounts remain blocked until verification', async () => {
  const email = `unverified-${Date.now()}@example.com`;
  const password = 'motdepasse123';
  const registration = await api('/auth/register', {
    method: 'POST',
    body: {
      name: 'Compte non verifie',
      email,
      password,
      cguAccepted: true,
    },
  });
  assert.equal(registration.status, 200);
  assert.equal(registration.body.token, undefined);

  const login = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.needsVerification, true);
  assert.equal(login.body.token, undefined);

  const code = login.body.demoHint.match(/\d{6}/)?.[0];
  assert.ok(code);
  const verification = await api('/auth/verify-email', {
    method: 'POST',
    body: { email, code },
  });
  assert.equal(verification.status, 200);
  assert.ok(verification.body.token);

  const me = await api('/me', { token: verification.body.token });
  assert.equal(me.status, 200);
});

test('current trip, conversation and operation workflow', async () => {
  const published = await api('/trips', {
    method: 'POST',
    token: tokens.karim,
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
  const trip = published.body.trip;

  const mine = await api('/trips/mine', { token: tokens.karim });
  assert.ok(mine.body.trips.some(({ id }) => id === trip.id));
  const others = await api('/trips?excludeMine=1', { token: tokens.karim });
  assert.ok(!others.body.trips.some(({ id }) => id === trip.id));

  const edited = await api(`/trips/${trip.id}`, {
    method: 'PATCH',
    token: tokens.karim,
    body: {
      from: 'Oujda',
      to: 'Bruxelles',
      date: '2026-09-11',
      capacityKg: 8,
      price: 32,
      description: 'Trajet modifie avant toute demande.',
      conditions: 'Colis ferme uniquement.',
    },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.trip.price, 32);

  const saved = await api(`/saved-trips/${trip.id}`, {
    method: 'POST',
    token: tokens.fatima,
  });
  assert.equal(saved.status, 200);
  const savedList = await api('/saved-trips', { token: tokens.fatima });
  assert.equal(
    savedList.body.trips.filter(({ id }) => id === trip.id).length,
    1,
  );

  const conversation = await api('/conversations', {
    method: 'POST',
    token: tokens.fatima,
    body: { tripId: trip.id },
  });
  assert.equal(conversation.status, 200, JSON.stringify(conversation.body));
  const conversationId = conversation.body.conversation.id;

  const sent = await api(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    token: tokens.fatima,
    body: {
      text: 'Bonjour, votre trajet est-il toujours disponible ?',
      clientId: `integration-${Date.now()}`,
    },
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.message.flagged, false);

  const attached = await api(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    token: tokens.fatima,
    body: {
      text: 'Voici une photo du colis.',
      attachments: [{ name: 'colis.png', dataUrl: TINY_PNG }],
    },
  });
  assert.equal(attached.status, 200, JSON.stringify(attached.body));
  assert.equal(attached.body.message.attachments[0].type, 'image');
  assert.equal(attached.body.message.attachments[0].dataUrl, undefined);

  const blocked = await api(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    token: tokens.fatima,
    body: { text: 'Appelez-moi au 0612345678.' },
  });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.code, 'message_safety_blocked');

  const unread = await api('/navigation-summary', { token: tokens.karim });
  assert.ok(unread.body.messagesUnread >= 1);
  const read = await api(`/conversations/${conversationId}/read`, {
    method: 'POST',
    token: tokens.karim,
  });
  assert.equal(read.status, 200);
  assert.equal(read.body.conversation.unread, 0);

  const request = await api(`/trips/${trip.id}/accept`, {
    method: 'POST',
    token: tokens.fatima,
    body: {
      descriptionParcel: 'Petit colis propre de 2 kg.',
      shipmentType: 'parcel',
      weightKg: 2,
    },
  });
  assert.equal(request.status, 200, JSON.stringify(request.body));
  const operation = request.body.operation;
  assert.equal(operation.operationStatus, 'attente_confirmation');
  assert.equal(operation.price, 8);

  const payTooSoon = await api(`/operations/${operation.id}/pay`, {
    method: 'POST',
    token: tokens.fatima,
  });
  assert.equal(payTooSoon.status, 400);

  const confirmation = await api(`/operations/${operation.id}/confirm`, {
    method: 'POST',
    token: tokens.karim,
  });
  assert.equal(confirmation.status, 200);
  assert.equal(confirmation.body.operation.operationStatus, 'paiement_requis');

  const paid = await api(`/operations/${operation.id}/pay`, {
    method: 'POST',
    token: tokens.fatima,
  });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.operation.operationStatus, 'paye');
  assert.equal(paid.body.operation.securityCodes, undefined);

  const pickupCode = await api(`/operations/${operation.id}/pickup-code`, {
    method: 'POST',
    token: tokens.karim,
  });
  assert.equal(pickupCode.status, 200);
  assert.match(pickupCode.body.code, /^\d{8}$/);

  const pickup = await api(`/operations/${operation.id}/confirm-pickup`, {
    method: 'POST',
    token: tokens.fatima,
    body: { code: pickupCode.body.code },
  });
  assert.equal(pickup.status, 200);
  assert.equal(pickup.body.operation.operationStatus, 'en_transport');

  const deliveryCode = await api(`/operations/${operation.id}/delivery-code`, {
    method: 'POST',
    token: tokens.fatima,
  });
  assert.equal(deliveryCode.status, 200);
  assert.match(deliveryCode.body.code, /^\d{8}$/);

  const delivered = await api(`/operations/${operation.id}/confirm-delivery`, {
    method: 'POST',
    token: tokens.karim,
    body: { code: deliveryCode.body.code },
  });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.operation.operationStatus, 'termine');

  const history = await api('/operations?history=1', {
    token: tokens.fatima,
  });
  assert.ok(history.body.operations.some(({ id }) => id === operation.id));
});

test('conversation deletion stays available to administrators', async () => {
  const trips = await api('/trips?excludeMine=1', { token: tokens.fatima });
  const trip = trips.body.trips[0];
  assert.ok(trip);

  const created = await api('/conversations', {
    method: 'POST',
    token: tokens.fatima,
    body: { tripId: trip.id },
  });
  const conversationId = created.body.conversation.id;
  const sent = await api(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    token: tokens.fatima,
    body: { text: 'Message conserve pour historique.' },
  });
  assert.equal(sent.status, 200);

  const removed = await api(`/conversations/${conversationId}`, {
    method: 'DELETE',
    token: tokens.fatima,
  });
  assert.equal(removed.status, 200);

  const me = await api('/me', { token: tokens.fatima });
  const caseFile = await api(`/admin/users/${me.body.user.id}/case-file`, {
    token: tokens.admin,
  });
  assert.equal(caseFile.status, 200, JSON.stringify(caseFile.body));
  assert.ok(
    caseFile.body.caseFile.messages.some(
      ({ id }) => id === sent.body.message.id,
    ),
  );
  const audit = caseFile.body.caseFile.auditLogs.find(
    ({ action }) => action === 'conversation.delete',
  );
  assert.equal(audit.meta.retainedForAdmin, true);
  assert.equal(audit.meta.scope, 'inbox_only');
});

test('authorization protects member and administrator resources', async () => {
  const anonymous = await api('/navigation-summary');
  assert.equal(anonymous.status, 401);

  const adminAsMember = await api('/admin/overview', {
    token: tokens.fatima,
  });
  assert.equal(adminAsMember.status, 403);

  const admin = await api('/admin/overview', { token: tokens.admin });
  assert.equal(admin.status, 200);

  const trips = await api('/trips?excludeMine=1', { token: tokens.fatima });
  const trip = trips.body.trips[0];
  const forbiddenEdit = await api(`/trips/${trip.id}`, {
    method: 'PATCH',
    token: tokens.mehdi,
    body: { price: 1 },
  });
  assert.equal(forbiddenEdit.status, 404);
});

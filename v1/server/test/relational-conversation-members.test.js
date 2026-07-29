import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureConversationMembers,
  relationalConversationMembersEnabled,
} from '../relational-conversation-members.js';

test('etat participant relationnel exige une activation explicite', () => {
  assert.equal(relationalConversationMembersEnabled({}), false);
  assert.equal(relationalConversationMembersEnabled({
    RELATIONAL_CONVERSATION_MEMBERS: 'true',
  }), true);
});

test('initialisation cree une ligne par participant avec les preferences historiques', async () => {
  const calls = [];
  await ensureConversationMembers({
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  }, {
    id: 'conv-1',
    participantIds: ['u-2', 'u-1', 'u-1'],
    archivedBy: ['u-1'],
    pinnedBy: ['u-2'],
    deletedBy: [],
    blockedBy: ['u-2'],
    createdAt: 1_000,
  }, {
    now: () => 2_000,
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /on conflict \(conversation_id, user_id\) do nothing/);
  const byUser = new Map(calls.map(({ params }) => [params[1], params]));
  assert.deepEqual(byUser.get('u-1').slice(2, 6), [true, false, false, false]);
  assert.deepEqual(byUser.get('u-2').slice(2, 6), [false, true, false, true]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateInlineMessageMedia } from '../migrate-message-media.js';

test('migration media remplace les images inline et reste relancable', async () => {
  const uploads = [];
  const state = {
    messages: [{
      id: 'm-1',
      conversationId: 'conv-1',
      attachments: [
        { id: 'att-1', dataUrl: 'data:image/png;base64,YQ==' },
        { id: 'att-2', storagePath: 'existing.png' },
      ],
    }],
  };
  const messageMedia = {
    enabled: true,
    async storeDataUrl(input) {
      uploads.push(input);
      return { storagePath: 'stored/att-1.png', mime: 'image/png', size: 1 };
    },
  };

  const first = await migrateInlineMessageMedia({ state, messageMedia });
  const second = await migrateInlineMessageMedia({ state, messageMedia });

  assert.equal(first.migrated, 1);
  assert.equal(first.skipped, 1);
  assert.equal(second.migrated, 0);
  assert.equal(uploads[0].upsert, true);
  assert.equal(state.messages[0].attachments[0].dataUrl, undefined);
  assert.equal(state.messages[0].attachments[0].storagePath, 'stored/att-1.png');
});

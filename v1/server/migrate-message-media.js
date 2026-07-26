export async function migrateInlineMessageMedia({ state, messageMedia }) {
  if (!messageMedia?.enabled) throw new Error('Supabase Storage doit etre configure.');
  const messages = Array.isArray(state?.messages) ? state.messages : [];
  let migrated = 0;
  let skipped = 0;

  for (const message of messages) {
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    for (const attachment of attachments) {
      if (!attachment?.dataUrl) {
        skipped += 1;
        continue;
      }
      const stored = await messageMedia.storeDataUrl({
        conversationId: message.conversationId,
        attachmentId: attachment.id,
        dataUrl: attachment.dataUrl,
        upsert: true,
      });
      attachment.storagePath = stored.storagePath;
      attachment.mime = stored.mime;
      attachment.size = stored.size;
      delete attachment.dataUrl;
      migrated += 1;
    }
  }

  return { state, migrated, skipped };
}

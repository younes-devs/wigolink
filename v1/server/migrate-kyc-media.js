const PHOTO_FIELDS = ['selfiePhoto', 'idFrontPhoto', 'idBackPhoto'];

export async function migrateInlineKycMedia({ state, kycMedia }) {
  if (!kycMedia?.enabled) throw new Error('Supabase Storage doit etre configure.');
  const submissions = Array.isArray(state?.kycSubmissions) ? state.kycSubmissions : [];
  let migrated = 0;
  let skipped = 0;

  for (const submission of submissions) {
    const inlinePhotos = Object.fromEntries(PHOTO_FIELDS.map((field) => [
      field,
      typeof submission?.[field] === 'string' && submission[field].startsWith('data:image/')
        ? submission[field]
        : null,
    ]));
    const pendingFields = PHOTO_FIELDS.filter((field) => inlinePhotos[field]);
    if (!pendingFields.length) {
      skipped += 1;
      continue;
    }

    const stored = await kycMedia.storeSubmission({
      userId: submission.userId,
      photos: inlinePhotos,
    });
    for (const field of pendingFields) {
      submission[field] = stored[field];
      migrated += 1;
    }
  }

  return { state, migrated, skipped };
}

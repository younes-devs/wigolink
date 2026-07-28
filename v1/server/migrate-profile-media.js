export async function migrateInlineProfileMedia({ state, profileMedia }) {
  if (!profileMedia?.enabled) throw new Error('Supabase Storage doit etre configure.');
  const users = Array.isArray(state?.users) ? state.users : [];
  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    if (typeof user?.photoUrl !== 'string' || !user.photoUrl.startsWith('data:image/')) {
      skipped += 1;
      continue;
    }
    user.photoUrl = await profileMedia.storeDataUrl({
      userId: user.id,
      dataUrl: user.photoUrl,
    });
    migrated += 1;
  }

  return { state, migrated, skipped };
}

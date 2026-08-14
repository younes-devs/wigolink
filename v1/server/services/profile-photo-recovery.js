export async function hydrateTripProfilePhotos({
  result,
  pool,
  profileMedia,
  persistUser,
  onError = () => {},
}) {
  const trips = result?.trips || (result?.body?.trip ? [result.body.trip] : []);
  const travelers = [...new Map(
    trips
      .map((trip) => trip?.traveler)
      .filter((traveler) => traveler?.id && !traveler.photoUrl)
      .map((traveler) => [traveler.id, traveler]),
  ).values()];
  if (!travelers.length) return result;

  let legacyUrls = new Map();
  try {
    const legacy = await pool.query(
      `select member->>'id' as id, member->>'photoUrl' as photo_url
       from public.wigolink_app_state state
       cross join lateral jsonb_array_elements(coalesce(state.state->'users', '[]'::jsonb)) member
       where state.id = 1 and member->>'id' = any($1::text[])`,
      [travelers.map((traveler) => traveler.id)],
    );
    legacyUrls = new Map(legacy.rows.map((row) => [row.id, row.photo_url]));
  } catch (error) {
    onError(error, null);
  }

  await Promise.all(travelers.map(async (traveler) => {
    try {
      const legacyUrl = String(legacyUrls.get(traveler.id) || '').trim();
      const photoUrl = legacyUrl.startsWith('data:image/')
        ? await profileMedia.storeDataUrl({ userId: traveler.id, dataUrl: legacyUrl })
        : legacyUrl.startsWith('https://')
          ? legacyUrl
          : await profileMedia.recoverPublicUrl({ userId: traveler.id });
      if (!photoUrl) return;
      // The public response must not depend on the legacy-to-relational backfill.
      // A persistence failure should not hide an avatar that was already found.
      const previousTraveler = { ...traveler };
      traveler.photoUrl = photoUrl;
      await persistUser({ ...traveler, photoUrl }, previousTraveler);
    } catch (error) {
      onError(error, traveler.id);
    }
  }));
  return result;
}

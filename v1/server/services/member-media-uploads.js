import crypto from 'node:crypto';

const UPLOAD_TTL_MS = 15 * 60 * 1000;
const MAX_BYTES = 700 * 1024;
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const KYC_FIELDS = new Set(['selfiePhoto', 'idFrontPhoto', 'idBackPhoto']);

export function createMemberMediaUploadService({
  getPool,
  kycMedia,
  profileMedia,
  now = Date.now,
}) {
  const pool = () => {
    const value = getPool();
    if (!value || typeof value.query !== 'function') {
      throw new Error('Base relationnelle indisponible');
    }
    return value;
  };

  async function reserveKyc({ userId, photos = {} }) {
    if (!kycMedia?.enabled) throw new Error('Stockage KYC indisponible');
    const entries = Object.entries(photos)
      .filter(([field]) => KYC_FIELDS.has(field))
      .map(([field, value]) => [field, validateDescriptor(value)]);
    if (entries.length < 2 || entries.length > 3) {
      throw new Error('Photos KYC invalides');
    }
    const uploadId = mediaUploadId();
    const uploads = await Promise.all(entries.map(([field, descriptor]) => (
      kycMedia.createSignedUpload({
        userId,
        uploadId,
        field,
        mime: descriptor.mime,
      }).then((upload) => ({ ...upload, size: descriptor.size }))
    )));
    await saveReservation({
      uploadId,
      userId,
      mediaType: 'kyc',
      uploads,
    });
    return { uploadId, uploads };
  }

  async function reserveProfile({ userId, mime, size }) {
    if (!profileMedia?.enabled) throw new Error('Stockage profil indisponible');
    const descriptor = validateDescriptor({ mime, size });
    const uploadId = mediaUploadId();
    const upload = await profileMedia.createSignedUpload({
      userId,
      uploadId,
      mime: descriptor.mime,
    });
    const uploads = [{ ...upload, size: descriptor.size, field: 'photo' }];
    await saveReservation({
      uploadId,
      userId,
      mediaType: 'profile',
      uploads,
    });
    return { uploadId, upload: uploads[0] };
  }

  async function claimKyc({ userId, uploadId, fields }) {
    const data = await claim({ userId, uploadId, mediaType: 'kyc' });
    const expected = [...new Set(fields || [])].sort();
    const reserved = data.uploads.map((upload) => upload.field).sort();
    if (JSON.stringify(expected) !== JSON.stringify(reserved)) {
      await cancel(uploadId, data);
      throw new Error('Reservation KYC incomplete');
    }
    try {
      const verified = await verifyUploads(data.uploads, kycMedia);
      return {
        uploadId,
        photos: Object.fromEntries(verified.map((upload) => [upload.field, {
          storagePath: upload.storagePath,
          mime: upload.mime,
          size: upload.size,
        }])),
      };
    } catch (error) {
      await cancel(uploadId, data);
      throw error;
    }
  }

  async function claimProfile({ userId, uploadId }) {
    const data = await claim({ userId, uploadId, mediaType: 'profile' });
    try {
      const [upload] = await verifyUploads(data.uploads, profileMedia);
      const url = profileMedia.publicUrl(upload.storagePath);
      if (!url) throw new Error('URL profil indisponible');
      return { uploadId, url, storagePath: upload.storagePath };
    } catch (error) {
      await cancel(uploadId, data);
      throw error;
    }
  }

  async function complete(uploadId) {
    await pool().query(
      `delete from public.wigofly_runtime_records
       where kind = 'member_media_upload' and id = $1`,
      [String(uploadId)],
    );
  }

  async function cancel(uploadId, knownData = null) {
    const data = knownData || await reservation(uploadId);
    if (data) await cleanupData(data);
    await complete(uploadId);
  }

  async function cleanupData(data) {
    const paths = (data?.uploads || []).map((upload) => upload.storagePath);
    if (data?.mediaType === 'kyc') await kycMedia?.removePaths(paths);
    if (data?.mediaType === 'profile') await profileMedia?.removePaths(paths);
  }

  async function cleanupMany(items = []) {
    const kycPaths = [];
    const profilePaths = [];
    for (const data of items) {
      const target = data?.mediaType === 'kyc' ? kycPaths : profilePaths;
      for (const upload of data?.uploads || []) {
        if (upload?.storagePath) target.push(upload.storagePath);
      }
    }
    await Promise.all([
      kycPaths.length ? kycMedia?.removePaths(kycPaths) : null,
      profilePaths.length ? profileMedia?.removePaths(profilePaths) : null,
    ]);
  }

  async function saveReservation({ uploadId, userId, mediaType, uploads }) {
    const data = { userId: String(userId), mediaType, claimed: false, uploads };
    await pool().query(
      `insert into public.wigofly_runtime_records
         (kind, id, data, expires_at, updated_at)
       values ('member_media_upload', $1, $2::jsonb, to_timestamp($3 / 1000.0), now())`,
      [uploadId, JSON.stringify(data), now() + UPLOAD_TTL_MS],
    );
  }

  async function claim({ userId, uploadId, mediaType }) {
    const result = await pool().query(
      `update public.wigofly_runtime_records
       set data = data || '{"claimed":true}'::jsonb, updated_at = now()
       where kind = 'member_media_upload'
         and id = $1
         and data->>'userId' = $2
         and data->>'mediaType' = $3
         and coalesce((data->>'claimed')::boolean, false) = false
         and expires_at > now()
       returning data`,
      [String(uploadId), String(userId), mediaType],
    );
    if (!result.rows[0]?.data) throw new Error('Reservation upload invalide ou expiree');
    return result.rows[0].data;
  }

  async function reservation(uploadId) {
    const result = await pool().query(
      `select data from public.wigofly_runtime_records
       where kind = 'member_media_upload' and id = $1`,
      [String(uploadId)],
    );
    return result.rows[0]?.data || null;
  }

  return {
    reserveKyc,
    reserveProfile,
    claimKyc,
    claimProfile,
    complete,
    cancel,
    cleanupData,
    cleanupMany,
  };
}

async function verifyUploads(uploads, media) {
  return Promise.all((uploads || []).map(async (upload) => {
    const stored = await media?.info(upload.storagePath);
    if (
      !stored
      || !MIMES.has(stored.mime || upload.mime)
      || stored.mime !== upload.mime
      || stored.size <= 0
      || stored.size > MAX_BYTES
    ) {
      throw new Error('Fichier upload invalide');
    }
    return { ...upload, size: stored.size, mime: stored.mime };
  }));
}

function validateDescriptor(value = {}) {
  const mime = String(value.mime || '');
  const size = Number(value.size || 0);
  if (!MIMES.has(mime) || !Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    throw new Error('Image invalide ou trop lourde');
  }
  return { mime, size };
}

function mediaUploadId() {
  return `media-${crypto.randomUUID()}`;
}

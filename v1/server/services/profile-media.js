import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'wigofly-profile-media';
const EXTENSIONS = ['jpg', 'png', 'webp'];

export function createProfileMediaService({
  url,
  secretKey,
  bucket = DEFAULT_BUCKET,
  storageClient = null,
}) {
  const baseUrl = String(url || '').replace(/\/$/, '');
  const key = String(secretKey || '').trim();
  const enabled = !!(storageClient || (baseUrl && key));
  const storage = storageClient || (enabled
    ? createClient(baseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).storage
    : null);
  let bucketPromise = null;

  async function ensureBucket() {
    if (!enabled) return false;
    if (!bucketPromise) {
      bucketPromise = (async () => {
        const { error: lookupError } = await storage.getBucket(bucket);
        if (!lookupError) return true;
        if (!isMissingBucket(lookupError)) throw lookupError;
        const { error: createError } = await storage.createBucket(bucket, {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          fileSizeLimit: 700 * 1024,
        });
        if (createError && !isDuplicateBucket(createError)) throw createError;
        return true;
      })().catch((error) => {
        bucketPromise = null;
        throw error;
      });
    }
    return bucketPromise;
  }

  async function storeDataUrl({ userId, dataUrl }) {
    if (!enabled) return null;
    await ensureBucket();
    const parsed = parseImageDataUrl(dataUrl);
    const prefix = `users/${safeSegment(userId)}/avatar`;
    const storagePath = `${prefix}.${parsed.extension}`;
    const { error } = await storage.from(bucket).upload(storagePath, parsed.bytes, {
      cacheControl: '31536000',
      contentType: parsed.mime,
      upsert: true,
    });
    if (error) throw error;
    const obsolete = EXTENSIONS
      .filter((extension) => extension !== parsed.extension)
      .map((extension) => `${prefix}.${extension}`);
    await storage.from(bucket).remove(obsolete).catch(() => {});
    const { data } = storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) throw new Error('URL publique du profil indisponible');
    return `${publicUrl}?v=${Date.now()}`;
  }

  async function remove(userId) {
    if (!enabled) return;
    await ensureBucket();
    const prefix = `users/${safeSegment(userId)}/avatar`;
    const { error } = await storage.from(bucket).remove(
      EXTENSIONS.map((extension) => `${prefix}.${extension}`),
    );
    if (error && !isMissingObject(error)) throw error;
  }

  return {
    enabled,
    storeDataUrl,
    remove,
  };
}

function parseImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error('Photo de profil invalide');
  const mime = match[1];
  return {
    mime,
    extension: mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg',
    bytes: Buffer.from(match[2], 'base64'),
  };
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
}

function errorText(error) {
  return `${error?.name || ''} ${error?.message || ''} ${error?.error || ''}`.toLowerCase();
}

function isMissingBucket(error) {
  return Number(error?.statusCode || error?.status) === 404
    || errorText(error).includes('not found');
}

function isDuplicateBucket(error) {
  return Number(error?.statusCode || error?.status) === 409
    || errorText(error).includes('already exists')
    || errorText(error).includes('duplicate');
}

function isMissingObject(error) {
  return Number(error?.statusCode || error?.status) === 404
    || errorText(error).includes('not found');
}

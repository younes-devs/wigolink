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

  async function createSignedUpload({ userId, uploadId, mime }) {
    if (!enabled) return null;
    await ensureBucket();
    const extension = extensionForMime(mime);
    if (!extension) throw new Error('Type image profil invalide');
    const storagePath = `users/${safeSegment(userId)}/avatars/${safeSegment(uploadId)}.${extension}`;
    const { data, error } = await storage
      .from(bucket)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data) throw error || new Error('URL upload profil indisponible');
    return { mime, storagePath, signedUrl: data.signedUrl };
  }

  async function info(storagePath) {
    if (!enabled || !storagePath) return null;
    const { data, error } = await storage.from(bucket).info(storagePath);
    if (error || !data) return null;
    return {
      mime: data.contentType || data.metadata?.mimetype || null,
      size: Number(data.size || data.metadata?.size || 0),
    };
  }

  function publicUrl(storagePath) {
    if (!enabled || !storagePath) return null;
    const { data } = storage.from(bucket).getPublicUrl(storagePath);
    return data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : null;
  }

  async function removePaths(paths) {
    const selected = [...new Set((paths || []).filter(Boolean))];
    if (!enabled || !selected.length) return;
    const { error } = await storage.from(bucket).remove(selected);
    if (error && !isMissingObject(error)) throw error;
  }

  async function removePublicUrl(userId, value) {
    if (!enabled || !value) return;
    try {
      const parsed = new URL(value);
      if (parsed.origin !== new URL(baseUrl).origin) return;
      const marker = `/storage/v1/object/public/${bucket}/`;
      const index = parsed.pathname.indexOf(marker);
      if (index < 0) return;
      const storagePath = decodeURIComponent(parsed.pathname.slice(index + marker.length));
      if (!storagePath.startsWith(`users/${safeSegment(userId)}/`)) return;
      await removePaths([storagePath]);
    } catch {
      // Legacy inline and external profile URLs have no object to remove here.
    }
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
    createSignedUpload,
    info,
    publicUrl,
    removePaths,
    removePublicUrl,
    storeDataUrl,
    remove,
  };
}

function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  return null;
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

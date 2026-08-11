import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'wigolink-parcel-media';

export function createParcelMediaService({
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
        if (!isMissing(lookupError)) throw lookupError;
        const { error } = await storage.createBucket(bucket, {
          public: false,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          fileSizeLimit: 700 * 1024,
        });
        if (error && !isDuplicate(error)) throw error;
        return true;
      })().catch((error) => {
        bucketPromise = null;
        throw error;
      });
    }
    return bucketPromise;
  }

  async function createSignedUpload({ userId, uploadId, photoId, mime }) {
    await ensureBucket();
    const extension = extensionForMime(mime);
    if (!extension) throw new Error('Type image colis invalide');
    const storagePath = `requests/${safe(userId)}/${safe(uploadId)}/${safe(photoId)}.${extension}`;
    const { data, error } = await storage.from(bucket)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data) throw error || new Error('URL upload colis indisponible');
    return { photoId, storagePath, signedUrl: data.signedUrl };
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

  async function download(storagePath) {
    if (!enabled || !storagePath) return null;
    const { data, error } = await storage.from(bucket).download(storagePath);
    if (error || !data) return { status: Number(error?.statusCode || error?.status || 404) };
    return {
      status: 200,
      body: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || 'application/octet-stream',
    };
  }

  async function removePaths(paths) {
    const selected = [...new Set((paths || []).filter(Boolean))];
    if (!enabled || !selected.length) return 0;
    const { error } = await storage.from(bucket).remove(selected);
    if (error && !isMissing(error)) throw error;
    return selected.length;
  }

  return { enabled, createSignedUpload, info, download, removePaths };
}

function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  return null;
}

function safe(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
}

function errorText(error) {
  return `${error?.name || ''} ${error?.message || ''} ${error?.error || ''}`.toLowerCase();
}

function isMissing(error) {
  return Number(error?.statusCode || error?.status) === 404 || errorText(error).includes('not found');
}

function isDuplicate(error) {
  return Number(error?.statusCode || error?.status) === 409
    || errorText(error).includes('already exists')
    || errorText(error).includes('duplicate');
}

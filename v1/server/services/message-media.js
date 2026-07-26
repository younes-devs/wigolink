import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'wigofly-message-media';

export function createMessageMediaService({
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
          public: false,
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

  async function storeDataUrl({ conversationId, attachmentId, dataUrl, upsert = false }) {
    if (!enabled) return null;
    await ensureBucket();
    const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw new Error('Image media invalide');
    const mime = match[1];
    const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const bytes = Buffer.from(match[2], 'base64');
    const storagePath = `conversations/${safeSegment(conversationId)}/${safeSegment(attachmentId)}.${extension}`;
    const { error } = await storage.from(bucket).upload(storagePath, bytes, {
      cacheControl: '86400',
      contentType: mime,
      upsert,
    });
    if (error) throw error;
    return { storagePath, mime, size: bytes.length };
  }

  async function download(storagePath) {
    if (!enabled || !storagePath) return null;
    const { data, error } = await storage.from(bucket).download(storagePath);
    if (error || !data) {
      return { status: Number(error?.statusCode || error?.status || 404) };
    }
    return {
      status: 200,
      body: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || 'application/octet-stream',
      etag: null,
    };
  }

  return {
    enabled,
    storeDataUrl,
    download,
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

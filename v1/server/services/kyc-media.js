import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'wigofly-kyc-media';
const PHOTO_FIELDS = ['selfiePhoto', 'idFrontPhoto', 'idBackPhoto'];

export function createKycMediaService({
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

  async function storeSubmission({ userId, photos }) {
    if (!enabled) return photos;
    await ensureBucket();
    const submissionKey = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
    const storedPaths = [];

    try {
      const entries = await Promise.all(PHOTO_FIELDS.map(async (field) => {
        const dataUrl = photos?.[field];
        if (!dataUrl) return [field, null];
        const parsed = parseImageDataUrl(dataUrl);
        const storagePath = `users/${safeSegment(userId)}/${submissionKey}/${field}.${parsed.extension}`;
        const { error } = await storage.from(bucket).upload(storagePath, parsed.bytes, {
          cacheControl: '300',
          contentType: parsed.mime,
          upsert: false,
        });
        if (error) throw error;
        storedPaths.push(storagePath);
        return [field, {
          storagePath,
          mime: parsed.mime,
          size: parsed.bytes.length,
        }];
      }));
      return Object.fromEntries(entries);
    } catch (error) {
      if (storedPaths.length) {
        await storage.from(bucket).remove(storedPaths).catch(() => {});
      }
      throw error;
    }
  }

  async function viewUrl(photo, { expiresIn = 300 } = {}) {
    if (!photo) return null;
    if (typeof photo === 'string') return photo;
    if (!enabled || !photo.storagePath) return null;
    const ttl = Math.max(60, Math.min(900, Number(expiresIn) || 300));
    const { data, error } = await storage
      .from(bucket)
      .createSignedUrl(photo.storagePath, ttl);
    if (error) throw error;
    return data?.signedUrl || null;
  }

  return {
    enabled,
    storeSubmission,
    viewUrl,
  };
}

function parseImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error('Image KYC invalide');
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

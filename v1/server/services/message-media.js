const DEFAULT_BUCKET = 'wigofly-message-media';

export function createMessageMediaService({
  url,
  secretKey,
  bucket = DEFAULT_BUCKET,
  fetchImpl = fetch,
}) {
  const baseUrl = String(url || '').replace(/\/$/, '');
  const key = String(secretKey || '').trim();
  const enabled = !!(baseUrl && key);
  let bucketPromise = null;

  const headers = () => ({
    apikey: key,
    authorization: `Bearer ${key}`,
  });

  async function ensureBucket() {
    if (!enabled) return false;
    if (!bucketPromise) {
      bucketPromise = (async () => {
        const current = await fetchImpl(
          `${baseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
          { headers: headers() },
        );
        if (current.ok) return true;
        if (current.status !== 404) {
          throw new Error(`Stockage media indisponible (${current.status})`);
        }
        const created = await fetchImpl(`${baseUrl}/storage/v1/bucket`, {
          method: 'POST',
          headers: {
            ...headers(),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            id: bucket,
            name: bucket,
            public: false,
            file_size_limit: 700 * 1024,
            allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
          }),
        });
        if (!created.ok && created.status !== 409) {
          throw new Error(`Creation du stockage media impossible (${created.status})`);
        }
        return true;
      })().catch((error) => {
        bucketPromise = null;
        throw error;
      });
    }
    return bucketPromise;
  }

  async function storeDataUrl({ conversationId, attachmentId, dataUrl }) {
    if (!enabled) return null;
    await ensureBucket();
    const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw new Error('Image media invalide');
    const mime = match[1];
    const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const bytes = Buffer.from(match[2], 'base64');
    const storagePath = `conversations/${safeSegment(conversationId)}/${safeSegment(attachmentId)}.${extension}`;
    const upload = await fetchImpl(
      `${baseUrl}/storage/v1/object/${encodePath(bucket, storagePath)}`,
      {
        method: 'POST',
        headers: {
          ...headers(),
          'content-type': mime,
          'x-upsert': 'false',
        },
        body: bytes,
      },
    );
    if (!upload.ok) {
      throw new Error(`Envoi du media impossible (${upload.status})`);
    }
    return { storagePath, mime, size: bytes.length };
  }

  async function download(storagePath) {
    if (!enabled || !storagePath) return null;
    const result = await fetchImpl(
      `${baseUrl}/storage/v1/object/authenticated/${encodePath(bucket, storagePath)}`,
      { headers: headers() },
    );
    if (!result.ok) return { status: result.status };
    return {
      status: 200,
      body: Buffer.from(await result.arrayBuffer()),
      contentType: result.headers.get('content-type') || 'application/octet-stream',
      etag: result.headers.get('etag') || null,
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

function encodePath(bucket, storagePath) {
  return [bucket, ...String(storagePath).split('/')]
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

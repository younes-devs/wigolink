export async function dataUrlBlob(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error('Image illisible');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1] });
}

export async function uploadSignedBlob(signedUrl, blob, cacheControl = '300') {
  if (!signedUrl || !blob) throw new Error('Upload invalide');
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const form = new FormData();
    form.append('cacheControl', cacheControl);
    form.append('', blob);
    try {
      const response = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'x-upsert': 'false' },
        body: form,
      });
      if (response.ok) return;
      lastError = new Error(`Upload impossible (${response.status})`);
      if (response.status < 500 && response.status !== 408 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    await wait(350);
  }
  throw new Error(lastError?.message || 'Upload impossible');
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

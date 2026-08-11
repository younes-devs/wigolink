export async function dataUrlBlob(dataUrl) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Image illisible');
  return response.blob();
}

export async function uploadSignedBlob(signedUrl, blob, cacheControl = '300') {
  if (!signedUrl || !blob) throw new Error('Upload invalide');
  const form = new FormData();
  form.append('cacheControl', cacheControl);
  form.append('', blob);
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'false' },
    body: form,
  });
  if (!response.ok) throw new Error('Upload impossible');
}

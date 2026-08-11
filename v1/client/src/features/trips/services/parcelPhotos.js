import { api } from '../../../api';
import { uploadSignedBlob } from '../../../core/directUpload.js';

const MAX_BYTES = 700 * 1024;
const MAX_DIMENSION = 1600;

export async function prepareParcelPhoto(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('invalid_type');
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let quality = 0.86;
  let blob = await canvasBlob(canvas, quality);
  while (blob.size > MAX_BYTES && quality > 0.46) {
    quality -= 0.1;
    blob = await canvasBlob(canvas, quality);
  }
  if (blob.size > MAX_BYTES) throw new Error('too_large');
  return blob;
}

export async function uploadParcelPhotos(photos) {
  const reservation = await api('/trip-requests/parcel-photos/uploads', {
    method: 'POST',
    body: {
      photos: photos.map(({ blob }) => ({ mime: blob.type, size: blob.size })),
    },
  });
  await Promise.all((reservation.uploads || []).map((upload, index) => (
    uploadSignedBlob(upload.signedUrl, photos[index].blob, '300')
  )));
  return reservation.uploadId;
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('encode_failed')),
      'image/jpeg',
      quality,
    );
  });
}

const PROFILE_PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_PROFILE_PHOTO_LENGTH = 700 * 1024;

export function validateProfileUpdate(body = {}) {
  const value = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) {
      return { status: 400, error: 'Nom trop court' };
    }
    value.name = name.slice(0, 60);
  }
  if (body.city !== undefined) {
    value.city = String(body.city).trim().slice(0, 60);
  }
  if (body.phone !== undefined) {
    value.phone = String(body.phone).trim().slice(0, 20);
  }

  return { value };
}

export function validateProfilePhoto(dataUrl) {
  if (dataUrl === null) return { value: null };
  if (!PROFILE_PHOTO_RE.test(dataUrl || '')) {
    return {
      status: 400,
      error: 'Format d\'image invalide (JPEG, PNG ou WebP)',
    };
  }
  if (dataUrl.length > MAX_PROFILE_PHOTO_LENGTH) {
    return {
      status: 400,
      error: 'Image trop lourde (500 Ko max après compression)',
    };
  }
  return { value: dataUrl };
}

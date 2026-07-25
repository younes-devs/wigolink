export function computeAge(birthDate, now = new Date()) {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function validateKycSubmission(body, {
  validPhotos,
  now = new Date(),
}) {
  const {
    legalName,
    birthDate,
    documentType,
    selfiePhoto,
    idFrontPhoto,
    idBackPhoto,
  } = body || {};

  if (!legalName || String(legalName).trim().length < 3) {
    return { status: 400, error: 'Nom légal complet requis' };
  }
  if (!['id_card', 'passport'].includes(documentType)) {
    return { status: 400, error: 'Type de document invalide' };
  }

  const age = computeAge(birthDate, now);
  if (age === null) {
    return { status: 400, error: 'Date de naissance invalide' };
  }
  if (age < 18) {
    return { status: 400, error: 'Vous devez avoir 18 ans ou plus' };
  }

  if (!validPhotos([selfiePhoto])) {
    return { status: 400, error: 'Selfie invalide (JPEG/PNG/WebP, 500 Ko max)' };
  }
  if (!validPhotos([idFrontPhoto])) {
    return { status: 400, error: 'Photo du recto invalide' };
  }
  if (documentType === 'id_card' && !validPhotos([idBackPhoto])) {
    return {
      status: 400,
      error: 'Photo du verso invalide (obligatoire pour une carte d\'identité)',
    };
  }

  return {
    value: {
      legalName: String(legalName).trim().slice(0, 120),
      birthDate,
      age,
      documentType,
      selfiePhoto,
      idFrontPhoto,
      idBackPhoto: documentType === 'id_card' ? idBackPhoto : null,
    },
  };
}

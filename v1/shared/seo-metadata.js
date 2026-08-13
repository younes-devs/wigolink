import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locale-routing.js';

export const SITE_ORIGIN = 'https://wigolink.com';
export const SOCIAL_IMAGE = `${SITE_ORIGIN}/assets/logo-mark-512.png`;
export const INDEXABLE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1';
export const PRIVATE_ROBOTS = 'noindex, nofollow';

const COPY = {
  fr: {
    tripsTitle: 'Trajets pour colis et documents | Wigolink',
    tripsDescription: 'Trouvez des voyageurs verifies et des trajets disponibles pour envoyer vos colis et documents entre le Maroc et l Europe.',
    termsTitle: 'Conditions generales d utilisation | Wigolink',
    termsDescription: 'Consultez les conditions generales d utilisation de Wigolink.',
    privacyTitle: 'Politique de confidentialite | Wigolink',
    privacyDescription: 'Consultez la politique de confidentialite et la gestion des donnees personnelles chez Wigolink.',
    routeJoiner: 'vers', datePrefix: 'le', available: 'disponibles',
    service: 'Transport collaboratif de colis et documents',
    feedHeading: 'Trajets disponibles',
    feedIntro: 'Consultez les prochains trajets proposes par des voyageurs verifies.',
  },
  en: {
    tripsTitle: 'Trips for parcels and documents | Wigolink',
    tripsDescription: 'Find verified travelers and available trips to send parcels and documents between Morocco and Europe.',
    termsTitle: 'Terms of use | Wigolink', termsDescription: 'Read the Wigolink terms of use.',
    privacyTitle: 'Privacy policy | Wigolink', privacyDescription: 'Read how Wigolink handles and protects personal data.',
    routeJoiner: 'to', datePrefix: 'on', available: 'available',
    service: 'Collaborative parcel and document transport',
    feedHeading: 'Available trips', feedIntro: 'Browse upcoming trips offered by verified travelers.',
  },
  es: {
    tripsTitle: 'Viajes para paquetes y documentos | Wigolink',
    tripsDescription: 'Encuentra viajeros verificados y viajes disponibles para enviar paquetes y documentos entre Marruecos y Europa.',
    termsTitle: 'Condiciones de uso | Wigolink', termsDescription: 'Consulta las condiciones de uso de Wigolink.',
    privacyTitle: 'Politica de privacidad | Wigolink', privacyDescription: 'Consulta como Wigolink gestiona y protege los datos personales.',
    routeJoiner: 'a', datePrefix: 'el', available: 'disponibles',
    service: 'Transporte colaborativo de paquetes y documentos',
    feedHeading: 'Viajes disponibles', feedIntro: 'Consulta los proximos viajes de viajeros verificados.',
  },
  nl: {
    tripsTitle: 'Reizen voor pakketten en documenten | Wigolink',
    tripsDescription: 'Vind geverifieerde reizigers en beschikbare reizen voor pakketten en documenten tussen Marokko en Europa.',
    termsTitle: 'Gebruiksvoorwaarden | Wigolink', termsDescription: 'Lees de gebruiksvoorwaarden van Wigolink.',
    privacyTitle: 'Privacybeleid | Wigolink', privacyDescription: 'Lees hoe Wigolink persoonsgegevens verwerkt en beschermt.',
    routeJoiner: 'naar', datePrefix: 'op', available: 'beschikbaar',
    service: 'Collaboratief vervoer van pakketten en documenten',
    feedHeading: 'Beschikbare reizen', feedIntro: 'Bekijk komende reizen van geverifieerde reizigers.',
  },
  ar: {
    tripsTitle: 'رحلات لنقل الطرود والوثائق | Wigolink',
    tripsDescription: 'اعثر على مسافرين موثقين ورحلات متاحة لإرسال الطرود والوثائق بين المغرب وأوروبا.',
    termsTitle: 'شروط الاستخدام | Wigolink', termsDescription: 'اطلع على شروط استخدام Wigolink.',
    privacyTitle: 'سياسة الخصوصية | Wigolink', privacyDescription: 'اطلع على كيفية معالجة Wigolink للبيانات الشخصية وحمايتها.',
    routeJoiner: 'إلى', datePrefix: 'بتاريخ', available: 'متاحة',
    service: 'نقل تعاوني للطرود والوثائق',
    feedHeading: 'الرحلات المتاحة', feedIntro: 'تصفح الرحلات القادمة التي يقدمها مسافرون موثقون.',
  },
};

export function seoCopy(locale) {
  return COPY[locale] || COPY[DEFAULT_LOCALE];
}

export function localizedUrl(locale, path) {
  return `${SITE_ORIGIN}/${locale}${path}`;
}

export function alternateLinks(path) {
  return [
    ...SUPPORTED_LOCALES.map((locale) => ({ locale, href: localizedUrl(locale, path) })),
    { locale: 'x-default', href: localizedUrl(DEFAULT_LOCALE, path) },
  ];
}

export function staticPageSeo(page, locale = DEFAULT_LOCALE) {
  const copy = seoCopy(locale);
  const pages = {
    trips: { title: copy.tripsTitle, description: copy.tripsDescription, path: '/trajets' },
    terms: { title: copy.termsTitle, description: copy.termsDescription, path: '/cgu' },
    privacy: { title: copy.privacyTitle, description: copy.privacyDescription, path: '/confidentialite' },
  };
  return pages[page] || pages.trips;
}

export function tripPageSeo(trip, locale = DEFAULT_LOCALE) {
  if (!trip) return {};
  const copy = seoCopy(locale);
  const route = `${trip.from} ${copy.routeJoiner} ${trip.to}`;
  const formattedDate = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${trip.departureDate}T00:00:00Z`));
  const title = `${route} ${copy.datePrefix} ${formattedDate} | Wigolink`;
  const description = `${route} ${copy.datePrefix} ${formattedDate}. ${trip.capacityKg} kg ${copy.available} a ${trip.price} ${trip.currency}. ${trip.description || ''}`.trim();
  const path = `/trajets/${encodeURIComponent(trip.id)}`;
  const url = localizedUrl(locale, path);
  return {
    title, description, path,
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'Offer', name: title, description, url,
      price: trip.price, priceCurrency: trip.currency,
      availability: 'https://schema.org/InStock', validThrough: trip.departureDate,
      itemOffered: {
        '@type': 'Service', name: `${copy.service}: ${trip.from} - ${trip.to}`,
        serviceType: copy.service,
        provider: trip.traveler?.name ? { '@type': 'Person', name: trip.traveler.name } : undefined,
      },
    },
  };
}

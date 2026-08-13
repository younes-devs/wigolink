import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locale-routing.js';
import { localizedUrl } from './seo-metadata.js';

const DEFINITIONS = {
  'parcel-morocco-belgium': {
    paths: {
      fr: '/envoyer-colis/maroc-belgique', en: '/send-parcel/morocco-belgium',
      es: '/enviar-paquete/marruecos-belgica', nl: '/pakket-versturen/marokko-belgie',
      ar: '/sift-colis/maghrib-belgique',
    },
    copy: {
      fr: {
        title: 'Envoyer un colis du Maroc vers la Belgique | Wigolink',
        description: 'Trouvez un voyageur vérifié pour transporter un colis du Maroc vers la Belgique avec Wigolink.',
        eyebrow: 'Maroc → Belgique', h1: 'Envoyer un colis du Maroc vers la Belgique',
        intro: 'Consultez les trajets publiés par des voyageurs, comparez les dates et échangez directement dans la messagerie sécurisée de Wigolink.',
        cta: 'Voir les trajets disponibles', howTitle: 'Comment ça marche ?',
        steps: ['Trouvez un trajet qui correspond à votre destination.', 'Décrivez votre colis et envoyez votre demande au voyageur.', 'Suivez la remise et la livraison depuis votre espace Wigolink.'],
        detailsTitle: 'Préparez votre envoi', details: 'Indiquez clairement le poids, le contenu et les dimensions du colis. Le voyageur reste libre d’accepter ou de refuser la demande après avoir consulté les informations fournies.',
        faqTitle: 'Questions fréquentes', faqs: [
          ['Puis-je consulter les trajets sans compte ?', 'Oui. La liste et le détail des trajets sont publics. Un compte est demandé au moment d’envoyer une demande ou un message.'],
          ['Qui fixe le prix ?', 'Le voyageur publie son prix et l’expéditeur voit le montant avant de confirmer sa demande.'],
          ['Les voyageurs sont-ils vérifiés ?', 'La vérification d’identité est requise pour publier un trajet et transporter un envoi.'],
        ],
      },
      en: {
        title: 'Send a parcel from Morocco to Belgium | Wigolink',
        description: 'Find a verified traveler to carry a parcel from Morocco to Belgium with Wigolink.',
        eyebrow: 'Morocco → Belgium', h1: 'Send a parcel from Morocco to Belgium',
        intro: 'Browse trips posted by travelers, compare departure dates and talk directly through Wigolink’s secure messaging.',
        cta: 'Browse available trips', howTitle: 'How does it work?',
        steps: ['Find a trip matching your destination.', 'Describe your parcel and send a request to the traveler.', 'Follow handover and delivery from your Wigolink account.'],
        detailsTitle: 'Prepare your shipment', details: 'Clearly provide the parcel weight, contents and dimensions. The traveler can review the information before accepting or declining the request.',
        faqTitle: 'Frequently asked questions', faqs: [
          ['Can I browse trips without an account?', 'Yes. Trip listings and details are public. An account is required to send a request or a message.'],
          ['Who sets the price?', 'The traveler publishes a price and the sender sees the amount before confirming a request.'],
          ['Are travelers verified?', 'Identity verification is required to publish a trip and carry a shipment.'],
        ],
      },
      es: {
        title: 'Enviar un paquete de Marruecos a Bélgica | Wigolink',
        description: 'Encuentra un viajero verificado para llevar un paquete de Marruecos a Bélgica con Wigolink.',
        eyebrow: 'Marruecos → Bélgica', h1: 'Enviar un paquete de Marruecos a Bélgica',
        intro: 'Consulta los viajes publicados, compara las fechas y habla directamente mediante la mensajería segura de Wigolink.',
        cta: 'Ver viajes disponibles', howTitle: '¿Cómo funciona?',
        steps: ['Encuentra un viaje hacia tu destino.', 'Describe el paquete y envía tu solicitud al viajero.', 'Sigue la entrega desde tu cuenta Wigolink.'],
        detailsTitle: 'Prepara tu envío', details: 'Indica claramente el peso, el contenido y las dimensiones. El viajero revisa la información antes de aceptar o rechazar la solicitud.',
        faqTitle: 'Preguntas frecuentes', faqs: [
          ['¿Puedo consultar viajes sin cuenta?', 'Sí. La lista y los detalles son públicos. Necesitas una cuenta para enviar una solicitud o un mensaje.'],
          ['¿Quién fija el precio?', 'El viajero publica su precio y el remitente ve el importe antes de confirmar.'],
          ['¿Los viajeros están verificados?', 'La verificación de identidad es obligatoria para publicar un viaje y transportar un envío.'],
        ],
      },
      nl: {
        title: 'Een pakket van Marokko naar België versturen | Wigolink',
        description: 'Vind een geverifieerde reiziger voor een pakket van Marokko naar België via Wigolink.',
        eyebrow: 'Marokko → België', h1: 'Een pakket van Marokko naar België versturen',
        intro: 'Bekijk reizen van reizigers, vergelijk vertrekdata en overleg rechtstreeks via de beveiligde berichten van Wigolink.',
        cta: 'Beschikbare reizen bekijken', howTitle: 'Hoe werkt het?',
        steps: ['Vind een reis naar jouw bestemming.', 'Beschrijf je pakket en stuur een aanvraag.', 'Volg overdracht en levering in je Wigolink-account.'],
        detailsTitle: 'Bereid je zending voor', details: 'Vermeld duidelijk het gewicht, de inhoud en de afmetingen. De reiziger bekijkt deze informatie vóór acceptatie of weigering.',
        faqTitle: 'Veelgestelde vragen', faqs: [
          ['Kan ik zonder account reizen bekijken?', 'Ja. De lijst en details zijn openbaar. Voor een aanvraag of bericht is een account nodig.'],
          ['Wie bepaalt de prijs?', 'De reiziger publiceert een prijs en de afzender ziet het bedrag vóór bevestiging.'],
          ['Zijn reizigers geverifieerd?', 'Identiteitscontrole is vereist om een reis te publiceren en een zending te vervoeren.'],
        ],
      },
      ar: {
        title: 'صيفط كولية من المغرب لبلجيكا | Wigolink',
        description: 'لقى مسافر موثّق يقدر يوصّل ليك كولية من المغرب لبلجيكا مع Wigolink.',
        eyebrow: 'المغرب ← بلجيكا', h1: 'صيفط كولية من المغرب لبلجيكا',
        intro: 'شوف الرحلات اللي ناشرين المسافرين، قارن التواريخ وتفاهم معاهم مباشرة فالميساج الآمن ديال Wigolink.',
        cta: 'شوف الرحلات الموجودة', howTitle: 'كيفاش كتخدم؟',
        steps: ['قلب على رحلة غادية للوجهة اللي بغيتي.', 'شرح شنو كاين فالكولية وصيفط الطلب للمسافر.', 'تبع التسليم والتوصيل من الحساب ديالك فـ Wigolink.'],
        detailsTitle: 'وجد الكولية ديالك', details: 'كتب الوزن والمحتوى والقياس بوضوح. المسافر كيشوف المعلومات كاملة قبل ما يقبل ولا يرفض الطلب.',
        faqTitle: 'أسئلة كيتعاودو بزاف', faqs: [
          ['نقدر نشوف الرحلات بلا حساب؟', 'إييه. الرحلات والتفاصيل ديالها باينين للعموم. الحساب كيتطلب غير ملي بغيتي تصيفط طلب ولا ميساج.'],
          ['شكون كيحدد الثمن؟', 'المسافر كينشر الثمن ديالو، والمرسل كيشوف المبلغ قبل ما يأكد الطلب.'],
          ['واش المسافرين موثّقين؟', 'التحقق من الهوية ضروري باش المسافر ينشر رحلة وينقل شي إرسال.'],
        ],
      },
    },
  },
  'parcel-morocco-france': {
    paths: {
      fr: '/envoyer-colis/maroc-france', en: '/send-parcel/morocco-france',
      es: '/enviar-paquete/marruecos-francia', nl: '/pakket-versturen/marokko-frankrijk',
      ar: '/sift-colis/maghrib-france',
    },
    copy: {
      fr: { title: 'Envoyer un colis du Maroc vers la France | Wigolink', description: 'Consultez les trajets de voyageurs vérifiés pour envoyer un colis du Maroc vers la France.', eyebrow: 'Maroc → France', h1: 'Envoyer un colis du Maroc vers la France', intro: 'Repérez un trajet adapté, présentez votre colis au voyageur et suivez chaque étape depuis Wigolink.', cta: 'Rechercher un trajet', howTitle: 'Un parcours simple', steps: ['Consultez les villes et dates proposées.', 'Envoyez les informations et les photos du colis.', 'Échangez avec le voyageur puis suivez l’opération.'], detailsTitle: 'Avant d’envoyer votre demande', details: 'Vérifiez que le contenu est autorisé et fournissez des informations exactes. Les photos du colis aident le voyageur à décider en connaissance de cause.', faqTitle: 'Questions fréquentes', faqs: [['Puis-je choisir une ville précise ?', 'Oui. Utilisez la recherche des trajets pour indiquer votre départ et votre arrivée.'], ['Combien de photos puis-je ajouter ?', 'Pour un colis, Wigolink demande au moins une photo et en accepte jusqu’à cinq.'], ['Puis-je parler au voyageur ?', 'Oui, après connexion, la messagerie reste liée au trajet concerné.']] },
      en: { title: 'Send a parcel from Morocco to France | Wigolink', description: 'Browse trips from verified travelers to send a parcel from Morocco to France.', eyebrow: 'Morocco → France', h1: 'Send a parcel from Morocco to France', intro: 'Find a suitable trip, show the traveler what you want to send and follow every step through Wigolink.', cta: 'Search for a trip', howTitle: 'A simple journey', steps: ['Browse available cities and dates.', 'Send parcel details and photos.', 'Talk to the traveler and track the operation.'], detailsTitle: 'Before sending your request', details: 'Make sure the contents are allowed and provide accurate information. Parcel photos help the traveler make an informed decision.', faqTitle: 'Frequently asked questions', faqs: [['Can I choose a specific city?', 'Yes. Use trip search to enter your departure and destination.'], ['How many photos can I add?', 'For a parcel, Wigolink requires at least one photo and accepts up to five.'], ['Can I talk to the traveler?', 'Yes. Once signed in, messaging stays linked to the relevant trip.']] },
      es: { title: 'Enviar un paquete de Marruecos a Francia | Wigolink', description: 'Consulta viajes de viajeros verificados para enviar un paquete de Marruecos a Francia.', eyebrow: 'Marruecos → Francia', h1: 'Enviar un paquete de Marruecos a Francia', intro: 'Encuentra un viaje adecuado, presenta tu paquete al viajero y sigue cada etapa desde Wigolink.', cta: 'Buscar un viaje', howTitle: 'Un proceso sencillo', steps: ['Consulta ciudades y fechas disponibles.', 'Envía los datos y fotos del paquete.', 'Habla con el viajero y sigue la operación.'], detailsTitle: 'Antes de enviar tu solicitud', details: 'Comprueba que el contenido esté permitido y facilita información exacta. Las fotos ayudan al viajero a decidir.', faqTitle: 'Preguntas frecuentes', faqs: [['¿Puedo elegir una ciudad?', 'Sí. Usa la búsqueda para indicar salida y destino.'], ['¿Cuántas fotos puedo añadir?', 'Wigolink pide al menos una foto del paquete y acepta hasta cinco.'], ['¿Puedo hablar con el viajero?', 'Sí. Tras iniciar sesión, la conversación queda vinculada al viaje.']] },
      nl: { title: 'Een pakket van Marokko naar Frankrijk versturen | Wigolink', description: 'Bekijk reizen van geverifieerde reizigers voor pakketten van Marokko naar Frankrijk.', eyebrow: 'Marokko → Frankrijk', h1: 'Een pakket van Marokko naar Frankrijk versturen', intro: 'Vind een passende reis, toon je pakket aan de reiziger en volg elke stap via Wigolink.', cta: 'Een reis zoeken', howTitle: 'Een eenvoudig proces', steps: ['Bekijk beschikbare steden en data.', 'Stuur pakketgegevens en foto’s.', 'Overleg met de reiziger en volg de operatie.'], detailsTitle: 'Voordat je aanvraagt', details: 'Controleer of de inhoud is toegestaan en geef correcte informatie. Foto’s helpen de reiziger een goede beslissing te nemen.', faqTitle: 'Veelgestelde vragen', faqs: [['Kan ik een stad kiezen?', 'Ja. Vul vertrek en bestemming in bij het zoeken.'], ['Hoeveel foto’s kan ik toevoegen?', 'Wigolink vraagt minimaal één en accepteert maximaal vijf pakketfoto’s.'], ['Kan ik de reiziger spreken?', 'Ja. Na het inloggen blijft het gesprek aan de reis gekoppeld.']] },
      ar: { title: 'صيفط كولية من المغرب لفرنسا | Wigolink', description: 'شوف رحلات ديال مسافرين موثّقين باش تصيفط كولية من المغرب لفرنسا.', eyebrow: 'المغرب ← فرنسا', h1: 'صيفط كولية من المغرب لفرنسا', intro: 'لقى الرحلة المناسبة، وري للمسافر الكولية اللي بغيتي تصيفط وتبع المراحل كاملة فـ Wigolink.', cta: 'قلب على رحلة', howTitle: 'مراحل واضحة وبسيطة', steps: ['شوف المدن والتواريخ الموجودة.', 'صيفط معلومات وصور الكولية.', 'تفاهم مع المسافر وتبع العملية.'], detailsTitle: 'قبل ما تصيفط الطلب', details: 'تأكد باللي المحتوى مسموح وكتب المعلومات صحيحة. صور الكولية كيساعدو المسافر يقرر وهو فاهم شنو غادي ينقل.', faqTitle: 'أسئلة كيتعاودو بزاف', faqs: [['نقدر نختار مدينة محددة؟', 'إييه. كتب مدينة الانطلاق والوصول فالبحث ديال الرحلات.'], ['شحال من صورة نقدر نزيد؟', 'فالكولية خاص صورة وحدة على الأقل، وتقدر تزيد حتى لخمسة.'], ['نقدر نهضر مع المسافر؟', 'إييه. من بعد الدخول، الميساج كيبقى مربوط بنفس الرحلة.']] },
    },
  },
  'document-morocco-europe': {
    paths: {
      fr: '/envoyer-document/maroc-europe', en: '/send-document/morocco-europe',
      es: '/enviar-documento/marruecos-europa', nl: '/document-versturen/marokko-europa',
      ar: '/sift-watiqa/maghrib-europe',
    },
    copy: {
      fr: { title: 'Envoyer un document du Maroc vers l’Europe | Wigolink', description: 'Trouvez un voyageur vérifié pour remettre un document du Maroc vers une destination en Europe.', eyebrow: 'Maroc → Europe', h1: 'Envoyer un document du Maroc vers l’Europe', intro: 'Diplôme, dossier ou autre document : consultez les trajets et faites une demande adaptée au nombre de documents à transporter.', cta: 'Voir les trajets', howTitle: 'Envoyer un document avec Wigolink', steps: ['Choisissez un trajet et sélectionnez « Document ».', 'Indiquez le nombre de documents et votre demande.', 'Suivez la remise et la livraison dans l’application.'], detailsTitle: 'Un tarif lisible', details: 'Le prix d’une demande de document est calculé selon le nombre de documents indiqué. Le montant est affiché avant la confirmation.', faqTitle: 'Questions fréquentes', faqs: [['Quels documents puis-je envoyer ?', 'Vous devez décrire précisément votre document et respecter les règles ainsi que les lois applicables.'], ['Dois-je renseigner un poids ?', 'Non. Pour un document, vous indiquez le nombre de documents plutôt qu’un poids en kilogrammes.'], ['Puis-je rechercher plusieurs pays européens ?', 'Oui. La page des trajets permet de rechercher une ville de destination en France, en Belgique et dans les autres zones publiées.']] },
      en: { title: 'Send a document from Morocco to Europe | Wigolink', description: 'Find a verified traveler to carry a document from Morocco to a destination in Europe.', eyebrow: 'Morocco → Europe', h1: 'Send a document from Morocco to Europe', intro: 'Diploma, file or another document: browse trips and make a request based on the number of documents you need carried.', cta: 'Browse trips', howTitle: 'Send a document with Wigolink', steps: ['Choose a trip and select “Document”.', 'Enter the number of documents and describe your request.', 'Track handover and delivery in the app.'], detailsTitle: 'Clear pricing', details: 'A document request is priced according to the number of documents entered. The amount is shown before confirmation.', faqTitle: 'Frequently asked questions', faqs: [['Which documents can I send?', 'Describe the document accurately and follow the platform rules and applicable laws.'], ['Do I need to enter a weight?', 'No. For documents, enter the number of documents instead of a weight in kilograms.'], ['Can I search several European countries?', 'Yes. Trip search covers destination cities in France, Belgium and other published areas.']] },
      es: { title: 'Enviar un documento de Marruecos a Europa | Wigolink', description: 'Encuentra un viajero verificado para llevar un documento de Marruecos a Europa.', eyebrow: 'Marruecos → Europa', h1: 'Enviar un documento de Marruecos a Europa', intro: 'Diploma, expediente u otro documento: consulta viajes y solicita el transporte según el número de documentos.', cta: 'Ver viajes', howTitle: 'Enviar un documento con Wigolink', steps: ['Elige un viaje y selecciona «Documento».', 'Indica el número de documentos y describe tu solicitud.', 'Sigue la entrega desde la aplicación.'], detailsTitle: 'Precio claro', details: 'El precio se calcula según el número de documentos indicado y se muestra antes de confirmar.', faqTitle: 'Preguntas frecuentes', faqs: [['¿Qué documentos puedo enviar?', 'Describe el documento con precisión y respeta las normas y leyes aplicables.'], ['¿Debo indicar el peso?', 'No. Para documentos se indica la cantidad, no el peso en kilogramos.'], ['¿Puedo buscar varios países?', 'Sí. Puedes buscar ciudades de Francia, Bélgica y otras zonas publicadas.']] },
      nl: { title: 'Een document van Marokko naar Europa versturen | Wigolink', description: 'Vind een geverifieerde reiziger voor een document van Marokko naar een Europese bestemming.', eyebrow: 'Marokko → Europa', h1: 'Een document van Marokko naar Europa versturen', intro: 'Diploma, dossier of ander document: bekijk reizen en vraag vervoer aan op basis van het aantal documenten.', cta: 'Reizen bekijken', howTitle: 'Een document versturen met Wigolink', steps: ['Kies een reis en selecteer “Document”.', 'Vul het aantal documenten en je aanvraag in.', 'Volg overdracht en levering in de app.'], detailsTitle: 'Duidelijke prijs', details: 'De prijs wordt berekend op basis van het opgegeven aantal documenten en verschijnt vóór bevestiging.', faqTitle: 'Veelgestelde vragen', faqs: [['Welke documenten kan ik versturen?', 'Beschrijf het document nauwkeurig en houd je aan de regels en toepasselijke wetgeving.'], ['Moet ik een gewicht invoeren?', 'Nee. Voor documenten geef je het aantal op in plaats van het gewicht.'], ['Kan ik meerdere landen zoeken?', 'Ja. Zoek op steden in Frankrijk, België en andere gepubliceerde gebieden.']] },
      ar: { title: 'صيفط وثيقة من المغرب لأوروبا | Wigolink', description: 'لقى مسافر موثّق يوصّل ليك وثيقة من المغرب لشي وجهة فأوروبا.', eyebrow: 'المغرب ← أوروبا', h1: 'صيفط وثيقة من المغرب لأوروبا', intro: 'دبلوم، دوسي ولا أي وثيقة أخرى: شوف الرحلات وصيفط طلب على حساب عدد الوثائق اللي بغيتي توصل.', cta: 'شوف الرحلات', howTitle: 'كيفاش تصيفط وثيقة؟', steps: ['اختار رحلة ودير الاختيار على «وثيقة».', 'دخل عدد الوثائق وشرح الطلب ديالك.', 'تبع التسليم والتوصيل من التطبيق.'], detailsTitle: 'الثمن باين من الأول', details: 'ثمن طلب الوثائق كيتحسب على حساب العدد اللي دخلتي، والمبلغ كيبان ليك قبل التأكيد.', faqTitle: 'أسئلة كيتعاودو بزاف', faqs: [['شنو من وثائق نقدر نصيفط؟', 'خاصك تشرح الوثيقة مزيان وتحترم قوانين المنصة والقوانين المعمول بها.'], ['خاصني ندخل الوزن؟', 'لا. فالوثائق كتدخل العدد بلاصة الوزن بالكيلو.'], ['نقدر نقلب فمدن أوروبية مختلفة؟', 'إييه. تقدر تقلب على مدن ففرنسا وبلجيكا ومناطق أخرى منشورة فالرحلات.']] },
    },
  },
};

export const SEO_LANDING_KEYS = Object.freeze(Object.keys(DEFINITIONS));

export function listSeoLandings(locale = DEFAULT_LOCALE) {
  const normalized = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  return SEO_LANDING_KEYS.map((key) => buildLanding(key, normalized));
}

export function getSeoLanding(locale = DEFAULT_LOCALE, path = '') {
  const normalized = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const cleanPath = `/${String(path).replace(/^\/+|\/+$/g, '')}`;
  const key = SEO_LANDING_KEYS.find((candidate) => DEFINITIONS[candidate].paths[normalized] === cleanPath);
  return key ? buildLanding(key, normalized) : null;
}

function buildLanding(key, locale) {
  const definition = DEFINITIONS[key];
  const copy = definition.copy[locale] || definition.copy[DEFAULT_LOCALE];
  const path = definition.paths[locale];
  const alternates = [
    ...SUPPORTED_LOCALES.map((code) => ({ locale: code, href: localizedUrl(code, definition.paths[code]) })),
    { locale: 'x-default', href: localizedUrl(DEFAULT_LOCALE, definition.paths[DEFAULT_LOCALE]) },
  ];
  const url = localizedUrl(locale, path);
  return {
    key, locale, path, alternates, ...copy,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: copy.h1, description: copy.description, url, inLanguage: locale },
        {
          '@type': 'FAQPage',
          mainEntity: copy.faqs.map(([name, text]) => ({
            '@type': 'Question', name,
            acceptedAnswer: { '@type': 'Answer', text },
          })),
        },
      ],
    },
  };
}

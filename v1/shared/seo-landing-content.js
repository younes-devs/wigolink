const CONTENT = {
  fr: {
    audienceTitle: 'Une solution pensée pour deux besoins',
    audience: [
      ['Vous envoyez', 'Trouvez une date et une destination qui correspondent à votre besoin, puis présentez votre demande avec des informations claires.'],
      ['Vous voyagez', 'Publiez un trajet que vous avez déjà prévu et indiquez l’espace disponible dans vos bagages ou votre véhicule.'],
      ['Vous voulez suivre', 'Retrouvez la conversation, les étapes et les confirmations au même endroit, sans devoir coordonner l’opération ailleurs.'],
    ],
    preparationTitle: 'Avant d’envoyer une demande',
    preparation: ['Choisissez la bonne catégorie : colis ou document.', 'Décrivez précisément le contenu et indiquez les informations demandées.', 'Pour un colis, ajoutez des photos utiles afin que le voyageur puisse décider en connaissance de cause.', 'Vérifiez la date, le départ, l’arrivée et le prix affiché avant de confirmer.'],
    trustTitle: 'Un parcours clair, de la recherche à la remise',
    trust: 'Wigolink est une plateforme de mise en relation. Les membres échangent dans la messagerie liée au trajet, puis suivent une opération guidée avec des confirmations aux moments importants. Les règles de la plateforme et les lois applicables restent prioritaires.',
    relatedTitle: 'Continuer votre recherche',
    related: [['Voir les trajets disponibles', '/trajets'], ['Comprendre le colis-voiturage', '/colis-voiturage'], ['Envoyer un document', '/envoyer-document/maroc-europe']],
  },
  en: {
    audienceTitle: 'Designed for both sides of the journey',
    audience: [['You are sending', 'Find a date and destination that match your needs, then submit a clear request with the relevant details.'], ['You are traveling', 'Post a trip you already plan to take and show how much space you have available.'], ['You want to stay informed', 'Keep the conversation, operation steps and confirmations together instead of coordinating elsewhere.']],
    preparationTitle: 'Before sending a request',
    preparation: ['Choose the right category: parcel or document.', 'Describe the contents accurately and provide the requested information.', 'For a parcel, add useful photos so the traveler can make an informed decision.', 'Check the date, route and displayed price before confirming.'],
    trustTitle: 'A clear path from search to handover',
    trust: 'Wigolink is a matching platform. Members communicate through the trip-linked conversation and follow a guided operation with confirmations at important moments. Platform rules and applicable laws always take priority.',
    relatedTitle: 'Continue your search',
    related: [['Browse available trips', '/trajets'], ['Learn about parcel crowdshipping', '/parcel-crowdshipping'], ['Send a document', '/send-document/morocco-europe']],
  },
  es: {
    audienceTitle: 'Una solución para las dos partes del viaje',
    audience: [['Si envías', 'Encuentra una fecha y un destino adecuados y presenta una solicitud clara.'], ['Si viajas', 'Publica un viaje que ya tienes previsto e indica el espacio disponible.'], ['Si quieres seguirlo', 'Reúne la conversación, las etapas y las confirmaciones en un mismo lugar.']],
    preparationTitle: 'Antes de enviar una solicitud',
    preparation: ['Elige la categoría correcta: paquete o documento.', 'Describe el contenido con precisión.', 'Para un paquete, añade fotos útiles para que el viajero pueda decidir.', 'Comprueba fecha, ruta y precio antes de confirmar.'],
    trustTitle: 'Un proceso claro hasta la entrega',
    trust: 'Wigolink es una plataforma de contacto. Los miembros hablan en la conversación vinculada al viaje y siguen una operación guiada. Siempre se aplican las reglas de la plataforma y las leyes correspondientes.',
    relatedTitle: 'Continúa tu búsqueda',
    related: [['Ver viajes disponibles', '/trajets'], ['Conocer el transporte colaborativo', '/transporte-colaborativo-paquetes'], ['Enviar un documento', '/enviar-documento/marruecos-europa']],
  },
  nl: {
    audienceTitle: 'Ontworpen voor beide kanten van de reis',
    audience: [['Je verstuurt', 'Vind een passende datum en bestemming en stuur een duidelijke aanvraag.'], ['Je reist', 'Publiceer een reis die je al gepland hebt en vermeld de beschikbare ruimte.'], ['Je wilt volgen', 'Houd berichten, stappen en bevestigingen bij elkaar in Wigolink.']],
    preparationTitle: 'Voor je een aanvraag verstuurt',
    preparation: ['Kies de juiste categorie: pakket of document.', 'Beschrijf de inhoud nauwkeurig.', 'Voeg bij een pakket nuttige foto’s toe zodat de reiziger kan beslissen.', 'Controleer datum, route en prijs voordat je bevestigt.'],
    trustTitle: 'Een duidelijk traject tot de overdracht',
    trust: 'Wigolink is een matchingplatform. Leden communiceren via het gesprek dat aan de reis gekoppeld is en volgen een begeleide operatie. De platformregels en toepasselijke wetgeving blijven leidend.',
    relatedTitle: 'Ga verder met zoeken',
    related: [['Beschikbare reizen bekijken', '/trajets'], ['Meer over pakketvervoer', '/pakket-meenemen-reiziger'], ['Een document versturen', '/document-versturen/marokko-europa']],
  },
  ar: {
    audienceTitle: 'حل مناسب للمرسل والمسافر',
    audience: [['إلى بغيتي تصيفط', 'قلب على الرحلة والتاريخ المناسبين وصيفط طلب واضح بالمعلومات الضرورية.'], ['إلى كنت مسافر', 'نشر رحلة مخطط ليها من قبل ووضح شحال من بلاصة عندك.'], ['إلى بغيتي تتبع العملية', 'خلي الميساجات والمراحل والتأكيدات مجموعين فـ Wigolink.']],
    preparationTitle: 'قبل ما تصيفط الطلب',
    preparation: ['اختار الصنف المناسب: كولية ولا وثيقة.', 'شرح المحتوى بوضوح ودخل المعلومات المطلوبة.', 'إلى كانت كولية، زيد تصاور مفيدة باش المسافر يقدر يقرر.', 'تأكد من التاريخ والطريق والثمن قبل التأكيد.'],
    trustTitle: 'مسار واضح حتى التسليم',
    trust: 'Wigolink منصة كتجمع بين المرسل والمسافر. التواصل كيبقى مربوط بالرحلة وكاينة عملية موجهة فيها تأكيدات فالمراحل المهمة. قوانين المنصة والقوانين المعمول بها ديما هي الأساس.',
    relatedTitle: 'كمل البحث ديالك',
    related: [['شوف الرحلات الموجودة', '/trajets'], ['فهم نقل الكوليات مع المسافرين', '/naql-colis-m3a-mosafir'], ['صيفط وثيقة', '/sift-watiqa/maghrib-europe']],
  },
};

export function getSeoLandingContent(locale = 'fr') {
  return CONTENT[locale] || CONTENT.fr;
}

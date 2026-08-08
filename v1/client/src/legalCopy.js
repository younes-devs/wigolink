import { getLang } from './i18n.js';
import legalEn from './locales/legal.en.js';
import legalEs from './locales/legal.es.js';

const privacyTable = {
  fr: {
    headers: ['Catégorie', 'Exemples', 'Origine'],
    rows: [
      ['Compte', 'Nom, email, ville, photo, langue, préférences', 'Vous'],
      ['Connexion et sécurité', 'Mot de passe haché, sessions, tentatives de connexion, journaux de sécurité', 'Application'],
      ["Vérification d'identité", 'Nom légal, date de naissance, pièce, selfie, décisions de vérification', 'Vous'],
      ['Trajets et opérations', 'Itinéraires, dates, capacité, annonces, prix proposés, preuves', 'Vous et votre partenaire'],
      ['Messagerie', 'Messages, photos jointes, signalements et actions de modération', 'Vous'],
      ['Localisation ponctuelle', 'Lieu choisi ou position actuelle, précision, expiration', 'Vous, après autorisation du navigateur'],
      ['Paiement', "Statut et montants d'une opération lorsque le paiement réel sera activé", 'Prestataire de paiement'],
    ],
  },
  nl: {
    headers: ['Categorie', 'Voorbeelden', 'Bron'],
    rows: [
      ['Account', 'Naam, e-mail, stad, foto, taal, voorkeuren', 'U'],
      ['Aanmelding en beveiliging', 'Gehasht wachtwoord, sessies, aanmeldpogingen, beveiligingslogboeken', 'Applicatie'],
      ['Identiteitsverificatie', 'Wettelijke naam, geboortedatum, identiteitsdocument, selfie, verificatiebeslissingen', 'U'],
      ['Reizen en operaties', 'Routes, datums, capaciteit, advertenties, voorgestelde prijzen, bewijzen', 'U en uw partner'],
      ['Berichten', 'Berichten, bijgevoegde foto’s, meldingen en moderatieacties', 'U'],
      ['Eenmalige locatie', 'Gekozen plaats of huidige locatie, nauwkeurigheid, vervaldatum', 'U, na toestemming van de browser'],
      ['Betaling', 'Status en bedragen van een operatie zodra echte betalingen actief zijn', 'Betalingsprovider'],
    ],
  },
  ar: {
    headers: ['الفئة', 'أمثلة', 'المصدر'],
    rows: [
      ['الحساب', 'الاسم، البريد الإلكتروني، المدينة، الصورة، اللغة، التفضيلات', 'أنت'],
      ['تسجيل الدخول والأمان', 'كلمة مرور مشفرة، الجلسات، محاولات الدخول، سجلات الأمان', 'التطبيق'],
      ['التحقق من الهوية', 'الاسم القانوني، تاريخ الميلاد، وثيقة الهوية، صورة السيلفي، قرارات التحقق', 'أنت'],
      ['الرحلات والعمليات', 'المسارات، التواريخ، السعة، الإعلانات، الأسعار المقترحة، الأدلة', 'أنت وشريكك'],
      ['الرسائل', 'الرسائل، الصور المرفقة، البلاغات وإجراءات الإشراف', 'أنت'],
      ['الموقع المؤقت', 'المكان المختار أو الموقع الحالي، الدقة، انتهاء الصلاحية', 'أنت، بعد إذن المتصفح'],
      ['الدفع', 'حالة ومبالغ العملية عند تفعيل الدفع الحقيقي', 'مزود الدفع'],
    ],
  },
};

const privacy = {
  fr: {
    title: 'Politique de confidentialité',
    lastUpdate: '18 juillet 2026',
    updated: 'Dernière mise à jour : {date}',
    warning: 'Texte pré-publication : complétez les champs entre crochets, les durées de conservation et les informations de société avant le lancement commercial.',
    question: 'Question concernant vos données ?',
    contact: '[À COMPLÉTER - contact confidentialité et adresse postale]',
    retention: '[À COMPLÉTER - durée validée avec votre conseil juridique]',
    sections: [
      { id: 'controller', title: '1. Responsable du traitement', paragraphs: [
        'Le responsable du traitement est [À COMPLÉTER - raison sociale de Wigolink], établi à [À COMPLÉTER - adresse du siège].',
        'Pour toute question ou demande concernant vos données : {contact}. Ne désignez une personne comme DPO que lorsqu’elle a été officiellement nommée.',
      ] },
      { id: 'data', title: '2. Données traitées', table: privacyTable.fr },
      { id: 'purposes', title: '3. Finalités et bases légales', list: [
        'Exécution du contrat : créer le compte, proposer des trajets, coordonner les opérations et fournir la messagerie.',
        'Intérêt légitime : protéger le service, prévenir la fraude, modérer les abus, conserver une trace des actions et améliorer la fiabilité.',
        'Consentement : utiliser la localisation de l’appareil, recevoir des communications optionnelles ou activer un fournisseur optionnel.',
        'Obligation légale : répondre à une demande valable d’une autorité, respecter les obligations applicables au service et conserver les éléments requis.',
      ] },
      { id: 'location', title: '4. Localisation', paragraphs: [
        'Wigolink ne suit pas votre position en continu. La localisation n’est lue qu’après votre action dans une conversation et l’autorisation de votre navigateur. Vous pouvez choisir votre position actuelle ou un lieu de rendez-vous.',
        'Le partage est ponctuel, expire après 30 minutes ou 2 heures et reste approximatif avant la confirmation d’une opération. Une fois expiré, le destinataire ne peut plus l’ouvrir dans l’interface. La trace du message peut néanmoins rester liée à la conversation pendant la durée de conservation applicable.',
      ] },
      { id: 'recipients', title: '5. Destinataires et sous-traitants', list: [
        'Votre partenaire de transaction : uniquement les informations nécessaires à la coordination et celles que vous partagez dans l’application.',
        'Équipe Wigolink : accès limité aux dossiers, demandes de vérification, signalements et litiges selon le besoin d’intervention.',
        'Supabase : base de données, authentification technique et temps réel.',
        'Vercel : hébergement de l’application et fonctions serveur.',
        'Resend : envoi des emails transactionnels, notamment la vérification d’email.',
        'Google : seulement si et lorsque la connexion Google OAuth est effectivement activée.',
        'Un prestataire de paiement ou de KYC ne sera ajouté qu’après son activation et la mise à jour de cette politique.',
        'Autorités publiques : uniquement en cas d’obligation légale ou de demande valable.',
      ] },
      { id: 'retention', title: '6. Conservation et suppression', list: [
        'Compte et profil : pendant la durée du compte, puis selon {retention}.',
        'Messages, photos et données de localisation : {retention}. La visibilité d’une localisation peut expirer avant la suppression technique des données.',
        'Pièces et selfie de vérification : {retention}, avec accès strictement limité. Les images KYC sont exclues de l’export standard.',
        'Journal de sécurité et de modération : {retention}.',
        'En cas de suppression du compte, Wigolink anonymise les données de profil lorsque cela est techniquement et légalement possible ; les éléments nécessaires à une obligation légale ou à un litige en cours peuvent être conservés.',
      ] },
      { id: 'rights', title: '7. Vos droits', paragraphs: [
        'Vous pouvez demander l’accès, la rectification, l’effacement, la limitation, l’opposition et la portabilité de vos données. L’application propose déjà l’export et la suppression du compte dans les réglages, sous certaines conditions de sécurité et d’opérations en cours.',
        'Adressez les demandes spécifiques à {contact}. Une réponse est fournie dans le délai légal applicable, en principe un mois. Vous pouvez également introduire une réclamation auprès de l’autorité de protection des données compétente.',
      ] },
      { id: 'security', title: '8. Sécurité, stockage local et cookies', paragraphs: [
        'Les mots de passe sont stockés sous forme hachée. Wigolink utilise des sessions, des protections contre les tentatives de connexion abusives et des contrôles de sécurité pour la messagerie et les comptes.',
        'L’application utilise le stockage local du navigateur pour conserver notamment la session, la langue, le thème et certains brouillons. Aucun cookie publicitaire tiers n’est utilisé à ce jour. Cette affirmation devra être revue si des outils de mesure d’audience, de publicité ou des pixels sont ajoutés.',
      ] },
      { id: 'transfers', title: '9. Transferts internationaux et modifications', paragraphs: [
        'Les emplacements réels de traitement et les mécanismes de transfert des sous-traitants doivent être confirmés dans leurs documents contractuels avant le lancement commercial. Si un transfert hors EEE est nécessaire, Wigolink mettra en place le mécanisme légal approprié et mettra cette politique à jour.',
        'Cette politique peut évoluer en cas de changement légal, technique ou fonctionnel. Les changements importants seront annoncés dans l’application avant leur prise d’effet.',
      ] },
    ],
  },
  nl: {
    title: 'Privacybeleid',
    lastUpdate: '18 juli 2026',
    updated: 'Laatst bijgewerkt: {date}',
    warning: 'Tekst vóór publicatie: vul de velden tussen haakjes, de bewaartermijnen en de bedrijfsgegevens in vóór de commerciële lancering.',
    question: 'Een vraag over uw gegevens?',
    contact: '[AAN TE VULLEN - privacycontact en postadres]',
    retention: '[AAN TE VULLEN - termijn bevestigd met uw juridisch adviseur]',
    sections: [
      { id: 'controller', title: '1. Verwerkingsverantwoordelijke', paragraphs: [
        'De verwerkingsverantwoordelijke is [AAN TE VULLEN - wettelijke naam van Wigolink], gevestigd te [AAN TE VULLEN - adres van de maatschappelijke zetel].',
        'Voor vragen of verzoeken over uw gegevens: {contact}. Wijs alleen een DPO aan wanneer deze persoon officieel is benoemd.',
      ] },
      { id: 'data', title: '2. Verwerkte gegevens', table: privacyTable.nl },
      { id: 'purposes', title: '3. Doeleinden en rechtsgronden', list: [
        'Uitvoering van de overeenkomst: het account aanmaken, reizen aanbieden, operaties coördineren en berichten aanbieden.',
        'Gerechtvaardigd belang: de dienst beschermen, fraude voorkomen, misbruik modereren, acties registreren en de betrouwbaarheid verbeteren.',
        'Toestemming: de locatie van het apparaat gebruiken, optionele communicatie ontvangen of een optionele provider activeren.',
        'Wettelijke verplichting: reageren op een geldig verzoek van een autoriteit, toepasselijke verplichtingen naleven en vereiste elementen bewaren.',
      ] },
      { id: 'location', title: '4. Locatie', paragraphs: [
        'Wigolink volgt uw locatie niet voortdurend. De locatie wordt alleen gelezen na uw actie in een gesprek en na toestemming van uw browser. U kunt uw huidige locatie of een ontmoetingsplaats kiezen.',
        'Het delen is eenmalig, vervalt na 30 minuten of 2 uur en blijft bij benadering vóór bevestiging van een operatie. Daarna kan de ontvanger de locatie niet meer openen. Het berichtspoor kan gedurende de toepasselijke bewaartermijn aan het gesprek gekoppeld blijven.',
      ] },
      { id: 'recipients', title: '5. Ontvangers en verwerkers', list: [
        'Uw transactiepartner: alleen informatie die nodig is voor de coördinatie en wat u in de app deelt.',
        'Wigolink-team: beperkte toegang tot dossiers, verificatieverzoeken, meldingen en geschillen wanneer tussenkomst nodig is.',
        'Supabase: databank, technische authenticatie en realtimefuncties.',
        'Vercel: hosting van de applicatie en serverfuncties.',
        'Resend: transactionele e-mails, waaronder e-mailverificatie.',
        'Google: alleen als en wanneer Google OAuth werkelijk is geactiveerd.',
        'Een betalings- of KYC-provider wordt pas toegevoegd na activering en actualisering van dit beleid.',
        'Overheidsinstanties: uitsluitend bij een wettelijke verplichting of geldig verzoek.',
      ] },
      { id: 'retention', title: '6. Bewaring en verwijdering', list: [
        'Account en profiel: tijdens de looptijd van het account en daarna volgens {retention}.',
        'Berichten, foto’s en locatiegegevens: {retention}. De zichtbaarheid van een locatie kan eerder vervallen dan de technische verwijdering.',
        'Identiteitsstukken en verificatieselfie: {retention}, met strikt beperkte toegang. KYC-afbeeldingen zijn uitgesloten van de standaardexport.',
        'Beveiligings- en moderatielogboek: {retention}.',
        'Bij verwijdering van het account anonimiseert Wigolink profielgegevens waar dit technisch en juridisch mogelijk is. Elementen die nodig zijn voor een wettelijke verplichting of lopend geschil kunnen worden bewaard.',
      ] },
      { id: 'rights', title: '7. Uw rechten', paragraphs: [
        'U kunt toegang, verbetering, verwijdering, beperking, bezwaar en overdraagbaarheid van uw gegevens vragen. De app biedt al export en accountverwijdering in de instellingen, onder bepaalde beveiligingsvoorwaarden en zolang geen operatie dit verhindert.',
        'Stuur specifieke verzoeken naar {contact}. U ontvangt antwoord binnen de toepasselijke wettelijke termijn, in beginsel één maand. U kunt ook een klacht indienen bij de bevoegde gegevensbeschermingsautoriteit.',
      ] },
      { id: 'security', title: '8. Beveiliging, lokale opslag en cookies', paragraphs: [
        'Wachtwoorden worden gehasht opgeslagen. Wigolink gebruikt sessies, bescherming tegen misbruik van aanmeldpogingen en beveiligingscontroles voor berichten en accounts.',
        'De app gebruikt lokale browseropslag voor onder meer de sessie, taal, het thema en concepten. Momenteel worden geen advertentiecookies van derden gebruikt. Dit moet worden herzien als analysetools, advertenties of pixels worden toegevoegd.',
      ] },
      { id: 'transfers', title: '9. Internationale doorgiften en wijzigingen', paragraphs: [
        'Werkelijke verwerkingslocaties en doorgiftemechanismen van verwerkers moeten vóór de commerciële lancering in hun contracten worden bevestigd. Indien doorgifte buiten de EER nodig is, past Wigolink het juiste wettelijke mechanisme toe en werkt het dit beleid bij.',
        'Dit beleid kan wijzigen door juridische, technische of functionele ontwikkelingen. Belangrijke wijzigingen worden vóór hun inwerkingtreding in de app aangekondigd.',
      ] },
    ],
  },
  ar: {
    title: 'سياسة الخصوصية',
    lastUpdate: '18 يوليو 2026',
    updated: 'آخر تحديث: {date}',
    warning: 'نص قبل النشر: أكمل الحقول بين القوسين ومدد الاحتفاظ وبيانات الشركة قبل الإطلاق التجاري.',
    question: 'هل لديك سؤال حول بياناتك؟',
    contact: '[يُستكمل - جهة اتصال الخصوصية والعنوان البريدي]',
    retention: '[يُستكمل - مدة معتمدة مع مستشارك القانوني]',
    sections: [
      { id: 'controller', title: '1. المسؤول عن معالجة البيانات', paragraphs: [
        'المسؤول عن المعالجة هو [يُستكمل - الاسم القانوني لـ Wigolink]، ومقره [يُستكمل - عنوان المقر].',
        'لأي سؤال أو طلب يتعلق ببياناتك: {contact}. لا تعيّن شخصا كمسؤول حماية بيانات إلا بعد تعيينه رسميا.',
      ] },
      { id: 'data', title: '2. البيانات المعالجة', table: privacyTable.ar },
      { id: 'purposes', title: '3. الأغراض والأسس القانونية', list: [
        'تنفيذ العقد: إنشاء الحساب، عرض الرحلات، تنسيق العمليات وتوفير الرسائل.',
        'المصلحة المشروعة: حماية الخدمة، منع الاحتيال، الإشراف على إساءة الاستخدام، تسجيل الإجراءات وتحسين الموثوقية.',
        'الموافقة: استخدام موقع الجهاز، تلقي اتصالات اختيارية أو تفعيل مزود اختياري.',
        'الالتزام القانوني: الاستجابة لطلب صحيح من سلطة، احترام الالتزامات المطبقة على الخدمة والاحتفاظ بالعناصر المطلوبة.',
      ] },
      { id: 'location', title: '4. الموقع', paragraphs: [
        'لا يتتبع Wigolink موقعك باستمرار. لا يُقرأ الموقع إلا بعد قيامك بإجراء داخل محادثة ومنح إذن المتصفح. يمكنك اختيار موقعك الحالي أو مكان للقاء.',
        'المشاركة مؤقتة، وتنتهي بعد 30 دقيقة أو ساعتين، وتبقى تقريبية قبل تأكيد العملية. بعد انتهائها لا يستطيع المستلم فتحها في الواجهة، لكن أثر الرسالة قد يبقى مرتبطا بالمحادثة طوال مدة الاحتفاظ المطبقة.',
      ] },
      { id: 'recipients', title: '5. المستلمون ومعالجو البيانات', list: [
        'شريك المعاملة: فقط المعلومات الضرورية للتنسيق وما تشاركه داخل التطبيق.',
        'فريق Wigolink: وصول محدود إلى الملفات وطلبات التحقق والبلاغات والنزاعات عند الحاجة إلى التدخل.',
        'Supabase: قاعدة البيانات والمصادقة التقنية والوقت الفعلي.',
        'Vercel: استضافة التطبيق ووظائف الخادم.',
        'Resend: إرسال رسائل المعاملات، ومنها التحقق من البريد الإلكتروني.',
        'Google: فقط إذا وعندما يتم تفعيل تسجيل Google OAuth فعليا.',
        'لن يُضاف مزود دفع أو تحقق من الهوية إلا بعد تفعيله وتحديث هذه السياسة.',
        'السلطات العامة: فقط عند وجود التزام قانوني أو طلب صحيح.',
      ] },
      { id: 'retention', title: '6. الاحتفاظ والحذف', list: [
        'الحساب والملف: طوال مدة الحساب ثم وفقا لـ {retention}.',
        'الرسائل والصور وبيانات الموقع: {retention}. قد تنتهي رؤية الموقع قبل الحذف التقني للبيانات.',
        'وثائق الهوية وصورة التحقق: {retention}، مع وصول محدود جدا. صور KYC مستثناة من التصدير العادي.',
        'سجل الأمان والإشراف: {retention}.',
        'عند حذف الحساب، يجهّل Wigolink بيانات الملف حيثما كان ذلك ممكنا تقنيا وقانونيا. ويمكن الاحتفاظ بالعناصر اللازمة لالتزام قانوني أو نزاع جارٍ.',
      ] },
      { id: 'rights', title: '7. حقوقك', paragraphs: [
        'يمكنك طلب الوصول والتصحيح والحذف والتقييد والاعتراض ونقل بياناتك. يوفر التطبيق التصدير وحذف الحساب من الإعدادات، مع مراعاة شروط الأمان والعمليات الجارية.',
        'أرسل الطلبات المحددة إلى {contact}. يُقدّم الرد ضمن المهلة القانونية المطبقة، ومبدئيا خلال شهر. ويمكنك تقديم شكوى إلى سلطة حماية البيانات المختصة.',
      ] },
      { id: 'security', title: '8. الأمان والتخزين المحلي وملفات الارتباط', paragraphs: [
        'تُخزّن كلمات المرور بصيغة مشفرة. يستخدم Wigolink الجلسات والحماية من محاولات الدخول المسيئة وضوابط أمان للرسائل والحسابات.',
        'يستخدم التطبيق التخزين المحلي للمتصفح لحفظ الجلسة واللغة والمظهر وبعض المسودات. لا تُستخدم حاليا ملفات ارتباط إعلانية لطرف ثالث. يجب مراجعة ذلك إذا أضيفت أدوات قياس أو إعلانات أو وحدات تتبع.',
      ] },
      { id: 'transfers', title: '9. النقل الدولي والتعديلات', paragraphs: [
        'يجب تأكيد مواقع المعالجة الفعلية وآليات نقل بيانات المتعهدين في وثائقهم التعاقدية قبل الإطلاق التجاري. إذا لزم نقل خارج المنطقة الاقتصادية الأوروبية، سيطبق Wigolink الآلية القانونية المناسبة ويحدث هذه السياسة.',
        'قد تتغير هذه السياسة بسبب تطور قانوني أو تقني أو وظيفي. ستُعلن التغييرات المهمة داخل التطبيق قبل سريانها.',
      ] },
    ],
  },
};

const terms = {
  fr: {
    title: "Conditions générales d'utilisation",
    lastUpdate: '18 juillet 2026',
    updated: 'Dernière mise à jour : {date}',
    warning: 'Texte pré-publication : les champs entre crochets et les conditions de paiement doivent être finalisés et validés par un avocat avant tout lancement commercial.',
    question: 'Question concernant ces conditions ?',
    legal: {
      entity: '[À COMPLÉTER - raison sociale]',
      address: '[À COMPLÉTER - adresse du siège social]',
      registration: '[À COMPLÉTER - numéro BCE / TVA]',
      email: '[À COMPLÉTER - email légal]',
      law: '[À COMPLÉTER - droit applicable et tribunaux compétents]',
    },
    sections: [
      { id: 'editor', title: "1. Éditeur et champ d'application", paragraphs: [
        '{entity}, {address}, {registration}, exploite la plateforme Wigolink. Contact légal : {email}.',
        "Les présentes conditions encadrent l'utilisation du site, de l'application et des services Wigolink. Elles s'appliquent aux expéditeurs, voyageurs, destinataires et visiteurs. L'utilisation de Wigolink implique leur acceptation.",
        'Les informations entre crochets doivent être remplacées par les informations de la société avant toute ouverture commerciale.',
      ] },
      { id: 'role', title: '2. Rôle de Wigolink', paragraphs: [
        'Wigolink fournit un outil de mise en relation, de coordination, de messagerie, de vérification manuelle et de suivi des opérations. Wigolink ne transporte pas les colis, ne contrôle pas physiquement leur contenu et ne remplace ni un transporteur, ni un transitaire, ni un mandataire en douane.',
        'Chaque expéditeur, voyageur et destinataire reste responsable de ses choix, déclarations, obligations fiscales, règles de bagage, obligations douanières et formalités applicables.',
      ] },
      { id: 'account', title: '3. Compte, sécurité et vérification', list: [
        'Vous devez fournir des informations exactes, garder votre mot de passe confidentiel et nous signaler rapidement tout accès non autorisé.',
        'Un compte est personnel. Les comptes multiples, fausses identités et tentatives de contournement des contrôles sont interdits.',
        "L'email doit être vérifié avant l'accès à l'application. Une connexion Google ne peut être proposée que lorsqu'un véritable flux OAuth est activé.",
        "La publication de trajets et certaines actions peuvent exiger une vérification d'identité. La vérification est actuellement instruite par Wigolink ; un prestataire externe ne sera cité qu'après sa mise en service effective.",
        "Vous devez avoir au moins 18 ans ou utiliser le service avec l'autorisation et sous la responsabilité du titulaire légalement habilité.",
      ] },
      { id: 'products', title: '4. Produits, déclarations et douane', paragraphs: [
        'Seuls les produits autorisés par le catalogue et les règles affichées dans l’application peuvent être proposés. Sont notamment interdits les marchandises illicites, dangereuses, contrefaites ou non déclarées, les espèces, documents officiels, médicaments, alcool, tabac, armes et tout objet interdit par les lois ou règles de transport applicables.',
        "L'expéditeur garantit que la description, les photos, la valeur, la quantité et le contenu déclarés sont exacts. Le voyageur doit pouvoir inspecter le colis avant sa prise en charge et peut le refuser sans le transporter.",
        "Un colis accepté dans Wigolink n'est pas automatiquement admis en douane. L'utilisateur doit vérifier les règles du pays de départ, de transit et d'arrivée.",
      ] },
      { id: 'operation', title: '5. Demandes, remise et preuve', ordered: [
        'Un expéditeur envoie une demande pour un trajet et le voyageur peut accepter, refuser ou discuter des conditions dans Wigolink.',
        'Avant la remise, les parties vérifient le contenu, la quantité, les conditions de transport et le lieu de rendez-vous.',
        "Les confirmations, messages, photos ou documents volontairement transmis et l'historique des événements conservés dans Wigolink peuvent être utilisés pour traiter un litige.",
        "Une remise ou une livraison ne doit être confirmée que lorsqu'elle a effectivement eu lieu.",
      ] },
      { id: 'payment', title: '6. Paiement et frais', paragraphs: [
        "État actuel du service : le module de paiement et de séquestre est simulé. Aucun paiement réel, encaissement, cantonnement ou versement n'est exécuté par Wigolink tant qu'un prestataire de paiement agréé et les conditions définitives ne sont pas actifs.",
        "Avant l'activation de paiements réels, Wigolink publiera le nom du prestataire, les frais, les conditions de remboursement, les délais de versement et les informations légalement requises. Les utilisateurs ne doivent jamais payer un autre utilisateur en dehors des moyens officiellement proposés par Wigolink.",
      ] },
      { id: 'chat', title: '7. Messagerie, photos et localisation', list: [
        'La coordination doit rester dans la messagerie Wigolink. Les numéros, emails, liens, réseaux sociaux et moyens de paiement externes peuvent être bloqués ou modérés pour protéger les utilisateurs.',
        'Les photos et messages envoyés doivent être licites, pertinents et ne pas porter atteinte aux droits de tiers.',
        "Le partage de localisation est volontaire et ponctuel. Il expire après 30 minutes ou 2 heures. Avant confirmation d'une opération, la position partagée est volontairement approximative.",
        "Il est interdit d'utiliser la localisation pour suivre, harceler ou mettre en danger une autre personne.",
      ] },
      { id: 'conduct', title: '8. Comportements interdits et modération', list: [
        "Fraude, fausse déclaration, contournement des contrôles, usurpation d'identité ou publication de contenu illicite.",
        "Harcèlement, menace, discrimination, pression pour communiquer hors application ou pour payer en dehors de Wigolink.",
        "Utilisation de la plateforme à des fins commerciales non autorisées, collecte de données d'autres membres ou atteinte à la sécurité du service.",
        "Wigolink peut retirer un contenu, limiter une fonctionnalité, suspendre un compte ou transmettre les éléments nécessaires aux autorités lorsque la loi l'exige. Une demande de réexamen peut être adressée à {email}.",
      ] },
      { id: 'disputes', title: '9. Litiges et réclamations', paragraphs: [
        "Un litige doit être ouvert depuis l'opération concernée dès que possible, avec les éléments utiles : messages, photos ou documents volontairement transmis et explication factuelle. Wigolink peut demander des informations complémentaires et appliquer les mesures temporaires nécessaires à la sécurité du dossier.",
        "Une décision interne de modération ou d'assistance ne prive jamais un utilisateur de ses droits légaux ni de sa possibilité de saisir les autorités ou juridictions compétentes.",
      ] },
      { id: 'liability', title: '10. Responsabilité', paragraphs: [
        "Dans les limites autorisées par la loi, Wigolink n'est pas responsable des déclarations des utilisateurs, de la qualité d'un produit, d'un retard de voyage, d'une décision douanière, d'un accord conclu hors application ou d'un dommage causé par un utilisateur.",
        "Rien dans les présentes conditions ne limite les droits impératifs des consommateurs ni une responsabilité qui ne peut être exclue par la loi applicable.",
      ] },
      { id: 'end', title: '11. Durée, fermeture et évolution des conditions', paragraphs: [
        "Vous pouvez cesser d'utiliser Wigolink et demander la suppression de votre compte depuis les réglages, sous réserve des obligations légales et des opérations en cours. Wigolink peut modifier ces conditions pour des raisons légales, de sécurité ou d'évolution du service ; les changements importants seront annoncés avant leur prise d'effet.",
        'Droit applicable et règlement des litiges : {law}.',
      ] },
    ],
  },
  nl: {
    title: 'Algemene gebruiksvoorwaarden',
    lastUpdate: '18 juli 2026',
    updated: 'Laatst bijgewerkt: {date}',
    warning: 'Tekst vóór publicatie: de velden tussen haakjes en de betalingsvoorwaarden moeten vóór de commerciële lancering worden voltooid en door een advocaat worden gevalideerd.',
    question: 'Een vraag over deze voorwaarden?',
    legal: {
      entity: '[AAN TE VULLEN - wettelijke naam]',
      address: '[AAN TE VULLEN - adres maatschappelijke zetel]',
      registration: '[AAN TE VULLEN - KBO-/btw-nummer]',
      email: '[AAN TE VULLEN - juridisch e-mailadres]',
      law: '[AAN TE VULLEN - toepasselijk recht en bevoegde rechtbanken]',
    },
    sections: [
      { id: 'editor', title: '1. Uitgever en toepassingsgebied', paragraphs: [
        '{entity}, {address}, {registration}, beheert het Wigolink-platform. Juridisch contact: {email}.',
        'Deze voorwaarden regelen het gebruik van de website, applicatie en diensten van Wigolink. Ze gelden voor verzenders, reizigers, ontvangers en bezoekers. Gebruik van Wigolink houdt aanvaarding ervan in.',
        'De informatie tussen haakjes moet vóór elke commerciële opening worden vervangen door de bedrijfsgegevens.',
      ] },
      { id: 'role', title: '2. Rol van Wigolink', paragraphs: [
        'Wigolink biedt hulpmiddelen voor matching, coördinatie, berichten, handmatige verificatie en opvolging van operaties. Wigolink vervoert geen pakketten, controleert de inhoud niet fysiek en vervangt geen vervoerder, expediteur of douanevertegenwoordiger.',
        'Elke verzender, reiziger en ontvanger blijft verantwoordelijk voor keuzes, verklaringen, fiscale verplichtingen, bagageregels, douaneverplichtingen en toepasselijke formaliteiten.',
      ] },
      { id: 'account', title: '3. Account, beveiliging en verificatie', list: [
        'U moet correcte informatie verstrekken, uw wachtwoord vertrouwelijk houden en ongeoorloofde toegang snel melden.',
        'Een account is persoonlijk. Meerdere accounts, valse identiteiten en pogingen om controles te omzeilen zijn verboden.',
        'Het e-mailadres moet vóór toegang tot de app worden geverifieerd. Google-aanmelding mag alleen worden aangeboden als een echte OAuth-stroom actief is.',
        'Voor het publiceren van reizen en bepaalde acties kan identiteitsverificatie nodig zijn. Wigolink behandelt die momenteel zelf; een externe provider wordt pas na effectieve ingebruikname vermeld.',
        'U moet minstens 18 jaar zijn of de dienst gebruiken met toestemming en onder verantwoordelijkheid van een wettelijk bevoegde persoon.',
      ] },
      { id: 'products', title: '4. Producten, verklaringen en douane', paragraphs: [
        'Alleen producten die volgens de catalogus en appregels zijn toegestaan, mogen worden aangeboden. Onder meer illegale, gevaarlijke, nagemaakte of niet-aangegeven goederen, contant geld, officiële documenten, geneesmiddelen, alcohol, tabak, wapens en wettelijk verboden voorwerpen zijn uitgesloten.',
        'De verzender garandeert dat beschrijving, foto’s, waarde, hoeveelheid en inhoud correct zijn. De reiziger moet het pakket vóór overname kunnen inspecteren en mag het weigeren.',
        'Een in Wigolink aanvaard pakket is niet automatisch toegelaten door de douane. De gebruiker moet de regels van vertrek-, transit- en aankomstland controleren.',
      ] },
      { id: 'operation', title: '5. Aanvragen, overdracht en bewijs', ordered: [
        'Een verzender stuurt een aanvraag voor een reis; de reiziger kan aanvaarden, weigeren of de voorwaarden in Wigolink bespreken.',
        'Vóór overdracht controleren partijen inhoud, hoeveelheid, vervoersvoorwaarden en ontmoetingsplaats.',
        'Bevestigingen, berichten, vrijwillig ingediende foto’s of documenten en de gebeurtenisgeschiedenis in Wigolink kunnen voor een geschil worden gebruikt.',
        'Een overdracht of levering mag alleen worden bevestigd wanneer die werkelijk heeft plaatsgevonden.',
      ] },
      { id: 'payment', title: '6. Betaling en kosten', paragraphs: [
        'Huidige toestand: de betalings- en bewaringsmodule is een simulatie. Wigolink voert geen echte betaling, inning, bewaring of uitbetaling uit zolang geen erkende betalingsprovider en definitieve voorwaarden actief zijn.',
        'Vóór echte betalingen publiceert Wigolink de provider, kosten, terugbetalingsvoorwaarden, uitbetalingstermijnen en wettelijk vereiste informatie. Gebruikers mogen elkaar nooit buiten de officieel aangeboden Wigolink-middelen betalen.',
      ] },
      { id: 'chat', title: '7. Berichten, foto’s en locatie', list: [
        'Coördinatie moet in Wigolink-berichten blijven. Telefoonnummers, e-mails, links, sociale netwerken en externe betaalmiddelen kunnen ter bescherming worden geblokkeerd of gemodereerd.',
        'Verstuurde foto’s en berichten moeten rechtmatig en relevant zijn en mogen geen rechten van derden schenden.',
        'Locatie delen is vrijwillig en eenmalig. Het vervalt na 30 minuten of 2 uur. Vóór bevestiging van een operatie blijft de locatie bewust bij benadering.',
        'Locatie mag niet worden gebruikt om iemand te volgen, lastig te vallen of in gevaar te brengen.',
      ] },
      { id: 'conduct', title: '8. Verboden gedrag en moderatie', list: [
        'Fraude, valse verklaringen, omzeiling van controles, identiteitsmisbruik of illegale inhoud.',
        'Intimidatie, bedreiging, discriminatie of druk om buiten de app te communiceren of betalen.',
        'Ongeoorloofd commercieel gebruik, verzamelen van gegevens van andere leden of aantasting van de beveiliging.',
        'Wigolink kan inhoud verwijderen, functies beperken, accounts schorsen of vereiste elementen aan autoriteiten bezorgen wanneer de wet dit vereist. Herbeoordeling kan via {email} worden gevraagd.',
      ] },
      { id: 'disputes', title: '9. Geschillen en klachten', paragraphs: [
        'Open een geschil zo snel mogelijk vanuit de betrokken operatie met nuttige elementen: berichten, vrijwillig ingediende foto’s of documenten en feitelijke uitleg. Wigolink kan extra informatie vragen en tijdelijke beveiligingsmaatregelen nemen.',
        'Een interne moderatie- of ondersteuningsbeslissing ontneemt een gebruiker nooit wettelijke rechten of toegang tot bevoegde autoriteiten en rechtbanken.',
      ] },
      { id: 'liability', title: '10. Aansprakelijkheid', paragraphs: [
        'Binnen de wettelijke grenzen is Wigolink niet aansprakelijk voor verklaringen van gebruikers, productkwaliteit, reisvertraging, douanebeslissingen, afspraken buiten de app of schade door een gebruiker.',
        'Niets in deze voorwaarden beperkt dwingende consumentenrechten of aansprakelijkheid die wettelijk niet kan worden uitgesloten.',
      ] },
      { id: 'end', title: '11. Duur, sluiting en wijziging', paragraphs: [
        'U kunt Wigolink niet meer gebruiken en accountverwijdering aanvragen via de instellingen, rekening houdend met wettelijke verplichtingen en lopende operaties. Wigolink kan deze voorwaarden om juridische, beveiligings- of dienstredenen wijzigen; belangrijke wijzigingen worden vooraf aangekondigd.',
        'Toepasselijk recht en geschillenbeslechting: {law}.',
      ] },
    ],
  },
  ar: {
    title: 'الشروط العامة للاستخدام',
    lastUpdate: '18 يوليو 2026',
    updated: 'آخر تحديث: {date}',
    warning: 'نص قبل النشر: يجب إكمال الحقول بين القوسين وشروط الدفع واعتمادها من محام قبل أي إطلاق تجاري.',
    question: 'هل لديك سؤال حول هذه الشروط؟',
    legal: {
      entity: '[يُستكمل - الاسم القانوني]',
      address: '[يُستكمل - عنوان المقر]',
      registration: '[يُستكمل - رقم التسجيل / الضريبة]',
      email: '[يُستكمل - البريد القانوني]',
      law: '[يُستكمل - القانون المطبق والمحاكم المختصة]',
    },
    sections: [
      { id: 'editor', title: '1. الناشر ونطاق التطبيق', paragraphs: [
        'تدير {entity}، ومقرها {address}، والمسجلة تحت {registration}، منصة Wigolink. الاتصال القانوني: {email}.',
        'تنظم هذه الشروط استخدام الموقع والتطبيق وخدمات Wigolink. وتنطبق على المرسلين والمسافرين والمستلمين والزوار. استخدام Wigolink يعني قبولها.',
        'يجب استبدال المعلومات بين القوسين ببيانات الشركة قبل أي افتتاح تجاري.',
      ] },
      { id: 'role', title: '2. دور Wigolink', paragraphs: [
        'يوفر Wigolink أداة للربط والتنسيق والرسائل والتحقق اليدوي ومتابعة العمليات. لا ينقل Wigolink الطرود ولا يفحص محتواها فعليا ولا يحل محل ناقل أو وكيل شحن أو ممثل جمركي.',
        'يبقى كل مرسل ومسافر ومستلم مسؤولا عن اختياراته وتصريحاته والتزاماته الضريبية وقواعد الأمتعة والجمارك والإجراءات المطبقة.',
      ] },
      { id: 'account', title: '3. الحساب والأمان والتحقق', list: [
        'يجب تقديم معلومات صحيحة والحفاظ على سرية كلمة المرور والإبلاغ بسرعة عن أي دخول غير مصرح به.',
        'الحساب شخصي. تُمنع الحسابات المتعددة والهويات المزيفة ومحاولات تجاوز الضوابط.',
        'يجب التحقق من البريد قبل دخول التطبيق. لا يجوز عرض تسجيل Google إلا عند تفعيل تدفق OAuth حقيقي.',
        'قد يتطلب نشر الرحلات وبعض الإجراءات التحقق من الهوية. يعالجه Wigolink حاليا، ولن يُذكر مزود خارجي إلا بعد تشغيله فعليا.',
        'يجب أن يكون عمرك 18 سنة على الأقل، أو أن تستخدم الخدمة بإذن وتحت مسؤولية شخص مخول قانونيا.',
      ] },
      { id: 'products', title: '4. المنتجات والتصريحات والجمارك', paragraphs: [
        'لا يجوز عرض إلا المنتجات المسموح بها وفق الكتالوج وقواعد التطبيق. تُمنع خصوصا السلع غير القانونية أو الخطرة أو المقلدة أو غير المصرح بها، والنقود والوثائق الرسمية والأدوية والكحول والتبغ والأسلحة وكل ما تمنعه القوانين أو قواعد النقل.',
        'يضمن المرسل صحة الوصف والصور والقيمة والكمية والمحتوى. يجب أن يتمكن المسافر من فحص الطرد قبل استلامه ويمكنه رفضه.',
        'قبول طرد داخل Wigolink لا يعني قبوله تلقائيا في الجمارك. يجب التحقق من قواعد بلد المغادرة والعبور والوصول.',
      ] },
      { id: 'operation', title: '5. الطلبات والتسليم والأدلة', ordered: [
        'يرسل المرسل طلبا لرحلة ويمكن للمسافر القبول أو الرفض أو مناقشة الشروط داخل Wigolink.',
        'قبل التسليم، يتحقق الطرفان من المحتوى والكمية وشروط النقل ومكان اللقاء.',
        'يمكن استخدام التأكيدات والرسائل والصور أو المستندات المقدمة طوعاً وسجل الأحداث المحفوظ في Wigolink لمعالجة النزاع.',
        'لا يجوز تأكيد التسليم أو الوصول إلا بعد حدوثه فعليا.',
      ] },
      { id: 'payment', title: '6. الدفع والرسوم', paragraphs: [
        'الحالة الحالية: وحدة الدفع والضمان محاكاة. لا ينفذ Wigolink أي دفع أو تحصيل أو حجز أو تحويل حقيقي قبل تفعيل مزود دفع معتمد والشروط النهائية.',
        'قبل تفعيل الدفع الحقيقي، سينشر Wigolink اسم المزود والرسوم وشروط الاسترداد ومهل التحويل والمعلومات القانونية المطلوبة. لا يجوز للمستخدمين الدفع لبعضهم خارج الوسائل الرسمية التي يوفرها Wigolink.',
      ] },
      { id: 'chat', title: '7. الرسائل والصور والموقع', list: [
        'يجب أن يبقى التنسيق داخل رسائل Wigolink. قد تُحظر أو تُراقب أرقام الهاتف والبريد والروابط والشبكات الاجتماعية ووسائل الدفع الخارجية لحماية المستخدمين.',
        'يجب أن تكون الصور والرسائل قانونية وذات صلة وألا تنتهك حقوق الغير.',
        'مشاركة الموقع طوعية ومؤقتة، وتنتهي بعد 30 دقيقة أو ساعتين. قبل تأكيد العملية يبقى الموقع تقريبيا عمدا.',
        'يُمنع استخدام الموقع لتتبع شخص أو مضايقته أو تعريضه للخطر.',
      ] },
      { id: 'conduct', title: '8. السلوك المحظور والإشراف', list: [
        'الاحتيال والتصريح الكاذب وتجاوز الضوابط وانتحال الهوية ونشر محتوى غير قانوني.',
        'المضايقة والتهديد والتمييز والضغط للتواصل أو الدفع خارج التطبيق.',
        'الاستخدام التجاري غير المصرح به أو جمع بيانات أعضاء آخرين أو الإضرار بأمان الخدمة.',
        'يجوز لـ Wigolink حذف محتوى أو تقييد ميزة أو إيقاف حساب أو إرسال العناصر اللازمة للسلطات عندما يفرض القانون ذلك. يمكن طلب المراجعة عبر {email}.',
      ] },
      { id: 'disputes', title: '9. النزاعات والشكاوى', paragraphs: [
        'يجب فتح النزاع من العملية المعنية في أقرب وقت مع العناصر المفيدة: الرسائل والصور أو المستندات المقدمة طوعاً وشرح واقعي. قد يطلب Wigolink معلومات إضافية ويتخذ تدابير مؤقتة لحماية الملف.',
        'لا يحرم قرار داخلي للإشراف أو الدعم المستخدم من حقوقه القانونية أو من اللجوء إلى السلطات أو المحاكم المختصة.',
      ] },
      { id: 'liability', title: '10. المسؤولية', paragraphs: [
        'في الحدود التي يسمح بها القانون، لا يتحمل Wigolink مسؤولية تصريحات المستخدمين أو جودة المنتج أو تأخر السفر أو قرار جمركي أو اتفاق خارج التطبيق أو ضرر سببه مستخدم.',
        'لا يحد أي شيء في هذه الشروط من حقوق المستهلك الإلزامية أو مسؤولية لا يسمح القانون باستبعادها.',
      ] },
      { id: 'end', title: '11. المدة والإغلاق وتعديل الشروط', paragraphs: [
        'يمكنك التوقف عن استخدام Wigolink وطلب حذف حسابك من الإعدادات، مع مراعاة الالتزامات القانونية والعمليات الجارية. يجوز لـ Wigolink تعديل الشروط لأسباب قانونية أو أمنية أو لتطوير الخدمة، وستُعلن التغييرات المهمة قبل سريانها.',
        'القانون المطبق وتسوية النزاعات: {law}.',
      ] },
    ],
  },
};

privacy.en = legalEn.privacy;
privacy.es = legalEs.privacy;
terms.en = legalEn.terms;
terms.es = legalEs.terms;

export function getLegalCopy(type) {
  const lang = getLang();
  return (type === 'privacy' ? privacy : terms)[lang] || (type === 'privacy' ? privacy : terms).fr;
}

export function formatLegalText(text, copy) {
  const values = { contact: copy.contact, retention: copy.retention, ...(copy.legal || {}) };
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), text);
}

export const LEGAL_COPY = { privacy, terms };

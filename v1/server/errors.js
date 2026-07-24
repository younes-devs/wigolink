// Traduction des messages d'erreur de l'API (suite du chantier i18n U14).
// Principe : les messages restent écrits en français dans le code (lisibilité, grep),
// et un middleware traduit `body.error` à la SORTIE selon l'en-tête Accept-Language
// envoyé par le client (fr/ar/nl). Aucun site d'appel à modifier ; tout message absent
// de la table part tel quel (français) — jamais d'erreur cassée.

// Messages exacts → traductions. La clé est le texte français du code.
const ERRORS = {
  // Auth & session
  'Nom trop court': { ar: 'الاسم قصير جداً', nl: 'Naam te kort' },
  'Adresse email invalide': { ar: 'عنوان بريد إلكتروني غير صالح', nl: 'Ongeldig e-mailadres' },
  'Mot de passe : 8 caractères minimum': { ar: 'كلمة المرور: 8 أحرف على الأقل', nl: 'Wachtwoord: minimaal 8 tekens' },
  'Un compte existe déjà avec cet email': { ar: 'يوجد حساب بهذا البريد الإلكتروني', nl: 'Er bestaat al een account met dit e-mailadres' },
  "Vous devez accepter les Conditions Générales d'Utilisation": { ar: 'يجب أن توافق على شروط الاستخدام العامة', nl: 'U moet de Algemene Gebruiksvoorwaarden aanvaarden' },
  'Email ou mot de passe incorrect': { ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة', nl: 'E-mail of wachtwoord onjuist' },
  'Email Google invalide': { ar: 'بريد Google غير صالح', nl: 'Ongeldig Google-e-mailadres' },
  'Code incorrect': { ar: 'رمز غير صحيح', nl: 'Onjuiste code' },
  'Code expiré — demandez un nouvel envoi': { ar: 'انتهت صلاحية الرمز — اطلب إرسالاً جديداً', nl: 'Code verlopen — vraag een nieuwe aan' },
  'Code expiré — refaites une demande': { ar: 'انتهت صلاحية الرمز — أعد الطلب', nl: 'Code verlopen — dien opnieuw in' },
  'Compte introuvable': { ar: 'الحساب غير موجود', nl: 'Account niet gevonden' },
  'Compte inconnu': { ar: 'حساب غير معروف', nl: 'Onbekend account' },
  'Trop de tentatives — demandez un nouveau code': { ar: 'محاولات كثيرة — اطلب رمزاً جديداً', nl: 'Te veel pogingen — vraag een nieuwe code aan' },
  'Trop de tentatives — réessayez dans 10 minutes': { ar: 'محاولات كثيرة — أعد المحاولة بعد 10 دقائق', nl: 'Te veel pogingen — probeer over 10 minuten opnieuw' },
  'Trop de tentatives — refaites une demande': { ar: 'محاولات كثيرة — أعد الطلب', nl: 'Te veel pogingen — dien opnieuw in' },
  'Trop de demandes — réessayez plus tard': { ar: 'طلبات كثيرة — أعد المحاولة لاحقاً', nl: 'Te veel aanvragen — probeer later opnieuw' },
  'Non authentifié': { ar: 'غير مسجّل الدخول', nl: 'Niet aangemeld' },
  'Non autorisé': { ar: 'غير مصرّح', nl: 'Niet toegestaan' },
  'Utilisateur inconnu': { ar: 'مستخدم غير معروف', nl: 'Onbekende gebruiker' },
  'Utilisateur introuvable': { ar: 'المستخدم غير موجود', nl: 'Gebruiker niet gevonden' },
  'Réservé aux admins': { ar: 'مخصص للمشرفين فقط', nl: 'Enkel voor admins' },
  'Introuvable': { ar: 'غير موجود', nl: 'Niet gevonden' },
  'Champs obligatoires manquants': { ar: 'حقول إلزامية ناقصة', nl: 'Verplichte velden ontbreken' },

  // Annonces & trajets
  'Annonce indisponible': { ar: 'الإعلان غير متاح', nl: 'Zoekertje niet beschikbaar' },
  'Annonce introuvable': { ar: 'الإعلان غير موجود', nl: 'Zoekertje niet gevonden' },
  'Catégorie introuvable': { ar: 'الفئة غير موجودة', nl: 'Categorie niet gevonden' },
  'Cette annonce ne peut plus être modifiée (déjà acceptée)': { ar: 'لا يمكن تعديل هذا الإعلان (تم قبوله)', nl: 'Dit zoekertje kan niet meer bewerkt worden (al aanvaard)' },
  'Cette annonce ne peut plus être retirée (déjà acceptée)': { ar: 'لا يمكن سحب هذا الإعلان (تم قبوله)', nl: 'Dit zoekertje kan niet meer ingetrokken worden (al aanvaard)' },
  'Vous ne pouvez pas transporter votre propre annonce': { ar: 'لا يمكنك نقل إعلانك الخاص', nl: 'U kunt uw eigen zoekertje niet vervoeren' },
  'Au moins une photo du produit est obligatoire': { ar: 'صورة واحدة على الأقل للمنتج إلزامية', nl: 'Minstens één productfoto is verplicht' },
  'Au moins une photo est obligatoire': { ar: 'صورة واحدة على الأقل إلزامية', nl: 'Minstens één foto is verplicht' },
  'Photos invalides (JPEG/PNG/WebP, 3 max, 500 Ko chacune)': { ar: 'صور غير صالحة (JPEG/PNG/WebP، 3 كحد أقصى، 500 ك.ب لكل صورة)', nl: "Ongeldige foto's (JPEG/PNG/WebP, max 3, elk 500 KB)" },
  'Poids invalide': { ar: 'وزن غير صالح', nl: 'Ongeldig gewicht' },
  'Valeur déclarée invalide': { ar: 'قيمة مصرّح بها غير صالحة', nl: 'Ongeldige aangegeven waarde' },
  'Rémunération voyageur invalide': { ar: 'أجر المسافر غير صالح', nl: 'Ongeldige vergoeding voor de reiziger' },
  'Acceptation explicite des règles douanières requise': { ar: 'الموافقة الصريحة على القواعد الجمركية مطلوبة', nl: 'Uitdrukkelijke aanvaarding van de douaneregels vereist' },
  'Trajet introuvable': { ar: 'الرحلة غير موجودة', nl: 'Reis niet gevonden' },
  'Trajet, sens et date requis': { ar: 'الرحلة والاتجاه والتاريخ مطلوبة', nl: 'Reis, richting en datum vereist' },
  'Départ et arrivée identiques': { ar: 'نقطتا الانطلاق والوصول متطابقتان', nl: 'Vertrek en aankomst zijn identiek' },
  'La date est déjà passée': { ar: 'التاريخ قد مضى', nl: 'De datum is al voorbij' },

  // Transactions
  'Transaction introuvable': { ar: 'المعاملة غير موجودة', nl: 'Transactie niet gevonden' },
  'Réservé aux parties de la transaction': { ar: 'مخصص لأطراف المعاملة فقط', nl: 'Enkel voor de partijen van de transactie' },
  'Étape invalide': { ar: 'خطوة غير صالحة', nl: 'Ongeldige stap' },
  "Seul l'expéditeur filme le scellage": { ar: 'المرسل وحده يصوّر الختم', nl: 'Enkel de verzender filmt de verzegeling' },
  'Seul le voyageur valide la prise en charge': { ar: 'المسافر وحده يؤكد الاستلام', nl: 'Enkel de reiziger bevestigt de overname' },
  'Seul le destinataire valide la livraison': { ar: 'المستلم وحده يؤكد التسليم', nl: 'Enkel de ontvanger bevestigt de levering' },
  'Réservé au voyageur': { ar: 'مخصص للمسافر فقط', nl: 'Enkel voor de reiziger' },
  "Code invalide — scannez le QR de l'expéditeur": { ar: 'رمز غير صالح — امسح رمز QR الخاص بالمرسل', nl: 'Ongeldige code — scan de QR van de verzender' },
  'Code invalide — scannez le QR du voyageur': { ar: 'رمز غير صالح — امسح رمز QR الخاص بالمسافر', nl: 'Ongeldige code — scan de QR van de reiziger' },
  'Le code de securite n est pas encore disponible.': { ar: 'رمز الأمان غير متاح بعد.', nl: 'De beveiligingscode is nog niet beschikbaar.' },
  'Ce code est verrouille apres trop de tentatives. Signalez un probleme pour continuer.': { ar: 'تم قفل هذا الرمز بعد محاولات كثيرة. أبلغ عن مشكلة للمتابعة.', nl: 'Deze code is vergrendeld na te veel pogingen. Meld een probleem om verder te gaan.' },
  'Ce code a expire. Son titulaire doit en generer un nouveau.': { ar: 'انتهت صلاحية هذا الرمز. يجب على صاحبه إنشاء رمز جديد.', nl: 'Deze code is verlopen. De houder moet een nieuwe maken.' },
  'Ce code est reserve au voyageur': { ar: 'هذا الرمز مخصص للمسافر', nl: 'Deze code is voorbehouden aan de reiziger' },
  'Le code de remise est disponible apres le paiement.': { ar: 'رمز التسليم متاح بعد الدفع.', nl: 'De overdrachtscode is beschikbaar na de betaling.' },
  'Ce code est reserve a l expediteur': { ar: 'هذا الرمز مخصص للمرسل', nl: 'Deze code is voorbehouden aan de verzender' },
  'Le code de livraison est disponible apres la prise en charge.': { ar: 'رمز الاستلام متاح بعد تسلم الطرد.', nl: 'De leveringscode is beschikbaar na de overname.' },
  'La remise doit etre confirmee par l expediteur': { ar: 'يجب أن يؤكد المرسل التسليم', nl: 'De overdracht moet door de verzender worden bevestigd' },
  'La remise ne peut pas etre confirmee a cette etape.': { ar: 'لا يمكن تأكيد التسليم في هذه المرحلة.', nl: 'De overdracht kan in deze fase niet worden bevestigd.' },
  'La livraison doit etre confirmee par le voyageur': { ar: 'يجب أن يؤكد المسافر الاستلام', nl: 'De levering moet door de reiziger worden bevestigd' },
  'La livraison ne peut pas etre confirmee a cette etape.': { ar: 'لا يمكن تأكيد الاستلام في هذه المرحلة.', nl: 'De levering kan in deze fase niet worden bevestigd.' },
  'Formation voyageur requise': { ar: 'تدريب المسافر مطلوب', nl: 'Reizigersopleiding vereist' },
  'Certaines réponses sont incorrectes — relisez les règles.': { ar: 'بعض الإجابات غير صحيحة — أعد قراءة القواعد.', nl: 'Sommige antwoorden zijn onjuist — herlees de regels.' },
  'Notation après livraison uniquement': { ar: 'التقييم بعد التسليم فقط', nl: 'Beoordelen kan enkel na levering' },
  'Note invalide (1 à 5)': { ar: 'تقييم غير صالح (من 1 إلى 5)', nl: 'Ongeldige score (1 tot 5)' },
  'Déjà noté': { ar: 'تم التقييم مسبقاً', nl: 'Al beoordeeld' },
  'Cible invalide': { ar: 'هدف غير صالح', nl: 'Ongeldig doelwit' },
  "L'avis ne peut pas contenir de coordonnées de contact (téléphone, email, WhatsApp…)": { ar: 'لا يمكن أن يحتوي التقييم على بيانات اتصال (هاتف، بريد، واتساب…)', nl: 'De beoordeling mag geen contactgegevens bevatten (telefoon, e-mail, WhatsApp…)' },

  // Litiges
  'Litige impossible à ce stade': { ar: 'لا يمكن فتح نزاع في هذه المرحلة', nl: 'Geschil onmogelijk in dit stadium' },
  'Litige clos ou introuvable': { ar: 'النزاع مغلق أو غير موجود', nl: 'Geschil gesloten of niet gevonden' },
  'Aucun litige pour cette transaction': { ar: 'لا نزاع لهذه المعاملة', nl: 'Geen geschil voor deze transactie' },
  'Réservé aux parties du litige': { ar: 'مخصص لأطراف النزاع فقط', nl: 'Enkel voor de partijen van het geschil' },
  'Merci de détailler le motif (10 caractères minimum)': { ar: 'يرجى تفصيل السبب (10 أحرف على الأقل)', nl: 'Gelieve de reden toe te lichten (minimaal 10 tekens)' },
  'Ajoutez un commentaire ou une photo': { ar: 'أضف تعليقاً أو صورة', nl: 'Voeg een opmerking of foto toe' },
  'Photo invalide (JPEG/PNG/WebP, 500 Ko max)': { ar: 'صورة غير صالحة (JPEG/PNG/WebP، 500 ك.ب كحد أقصى)', nl: 'Ongeldige foto (JPEG/PNG/WebP, max 500 KB)' },
  'Décision invalide': { ar: 'قرار غير صالح', nl: 'Ongeldige beslissing' },

  // Profil & RGPD
  "Format d'image invalide (JPEG, PNG ou WebP)": { ar: 'صيغة صورة غير صالحة (JPEG أو PNG أو WebP)', nl: 'Ongeldig afbeeldingsformaat (JPEG, PNG of WebP)' },
  'Image trop lourde (500 Ko max après compression)': { ar: 'الصورة ثقيلة جداً (500 ك.ب كحد أقصى بعد الضغط)', nl: 'Afbeelding te groot (max 500 KB na compressie)' },

  // KYC
  "Vérification d'identité requise": { ar: 'التحقق من الهوية مطلوب', nl: 'Identiteitsverificatie vereist' },
  'Votre identité est déjà vérifiée': { ar: 'هويتك موثّقة بالفعل', nl: 'Uw identiteit is al geverifieerd' },
  'Une demande est déjà en cours de vérification': { ar: 'يوجد طلب قيد التحقق بالفعل', nl: 'Er loopt al een verificatieaanvraag' },
  'Vérification définitivement refusée — contactez le support': { ar: 'رُفض التحقق نهائياً — تواصل مع الدعم', nl: 'Verificatie definitief geweigerd — contacteer de support' },
  'Nombre maximum de tentatives atteint — contactez le support': { ar: 'بلغت الحد الأقصى للمحاولات — تواصل مع الدعم', nl: 'Maximum aantal pogingen bereikt — contacteer de support' },
  'Nom légal complet requis': { ar: 'الاسم القانوني الكامل مطلوب', nl: 'Volledige wettelijke naam vereist' },
  'Date de naissance invalide': { ar: 'تاريخ ميلاد غير صالح', nl: 'Ongeldige geboortedatum' },
  'Vous devez avoir 18 ans ou plus': { ar: 'يجب أن يكون عمرك 18 عاماً أو أكثر', nl: 'U moet 18 jaar of ouder zijn' },
  'Type de document invalide': { ar: 'نوع وثيقة غير صالح', nl: 'Ongeldig documenttype' },
  'Selfie invalide (JPEG/PNG/WebP, 500 Ko max)': { ar: 'سيلفي غير صالح (JPEG/PNG/WebP، 500 ك.ب كحد أقصى)', nl: 'Ongeldige selfie (JPEG/PNG/WebP, max 500 KB)' },
  'Photo du recto invalide': { ar: 'صورة الوجه الأمامي غير صالحة', nl: 'Ongeldige foto van de voorkant' },
  "Photo du verso invalide (obligatoire pour une carte d'identité)": { ar: 'صورة الوجه الخلفي غير صالحة (إلزامية لبطاقة الهوية)', nl: 'Ongeldige foto van de achterkant (verplicht voor een identiteitskaart)' },
  'Demande introuvable': { ar: 'الطلب غير موجود', nl: 'Aanvraag niet gevonden' },
  'Cette demande a déjà été traitée': { ar: 'عولج هذا الطلب بالفعل', nl: 'Deze aanvraag is al behandeld' },
  'Motif obligatoire (5 caractères minimum)': { ar: 'السبب إلزامي (5 أحرف على الأقل)', nl: 'Reden verplicht (minimaal 5 tekens)' },

  // Disponibilité des services
  'Base de donnees indisponible. Reessayez plus tard.': { ar: 'قاعدة البيانات غير متاحة. حاول لاحقا.', nl: 'Databank niet beschikbaar. Probeer later opnieuw.' },
  'Base de donnees temporairement indisponible.': { ar: 'قاعدة البيانات غير متاحة مؤقتا.', nl: 'Databank tijdelijk niet beschikbaar.' },
  'Sauvegarde temporairement indisponible. Reessayez.': { ar: 'الحفظ غير متاح مؤقتا. حاول مجددا.', nl: 'Opslaan tijdelijk niet beschikbaar. Probeer opnieuw.' },
  'Le temps reel SSE est remplace par la synchronisation automatique.': { ar: 'استُبدل الاتصال الفوري SSE بالمزامنة التلقائية.', nl: 'SSE-realtime is vervangen door automatische synchronisatie.' },
  'Service de session temporairement indisponible.': { ar: 'خدمة الجلسة غير متاحة مؤقتا.', nl: 'Sessiedienst tijdelijk niet beschikbaar.' },
  'Recherche temporairement indisponible. Reessayez.': { ar: 'البحث غير متاح مؤقتا. حاول مجددا.', nl: 'Zoeken tijdelijk niet beschikbaar. Probeer opnieuw.' },
  'Mes trajets sont temporairement indisponibles. Reessayez.': { ar: 'رحلاتي غير متاحة مؤقتا. حاول مجددا.', nl: 'Mijn reizen zijn tijdelijk niet beschikbaar. Probeer opnieuw.' },
  'Les trajets sont temporairement indisponibles. Reessayez.': { ar: 'الرحلات غير متاحة مؤقتا. حاول مجددا.', nl: 'Reizen zijn tijdelijk niet beschikbaar. Probeer opnieuw.' },
  'Messagerie temporairement indisponible. Reessayez.': { ar: 'الرسائل غير متاحة مؤقتا. حاول مجددا.', nl: 'Berichten tijdelijk niet beschikbaar. Probeer opnieuw.' },
  'Conversation temporairement indisponible. Reessayez.': { ar: 'المحادثة غير متاحة مؤقتا. حاول مجددا.', nl: 'Gesprek tijdelijk niet beschikbaar. Probeer opnieuw.' },
  'Messages temporairement indisponibles. Reessayez.': { ar: 'الرسائل غير متاحة مؤقتا. حاول مجددا.', nl: 'Berichten tijdelijk niet beschikbaar. Probeer opnieuw.' },

  // Variantes auth, compte et email
  'Verifiez votre adresse email avant d acceder a l application.': { ar: 'تحقق من بريدك الإلكتروني قبل دخول التطبيق.', nl: 'Verifieer uw e-mailadres voordat u de app opent.' },
  'Votre compte est temporairement suspendu. Vous pouvez contester cette decision depuis votre profil.': { ar: 'حسابك موقوف مؤقتا. يمكنك الاعتراض على القرار من ملفك.', nl: 'Uw account is tijdelijk geschorst. U kunt de beslissing via uw profiel betwisten.' },
  'Votre compte est temporairement suspendu. Vous pouvez envoyer un recours.': { ar: 'حسابك موقوف مؤقتا. يمكنك إرسال اعتراض.', nl: 'Uw account is tijdelijk geschorst. U kunt beroep indienen.' },
  'Non authentifie': { ar: 'غير مسجّل الدخول', nl: 'Niet aangemeld' },
  'Compte temporairement suspendu.': { ar: 'الحساب موقوف مؤقتا.', nl: 'Account tijdelijk geschorst.' },
  'Utilisateur inconnu ou session expiree': { ar: 'المستخدم غير معروف أو انتهت الجلسة', nl: 'Onbekende gebruiker of verlopen sessie' },
  'Connexion Google indisponible': { ar: 'تسجيل الدخول عبر Google غير متاح', nl: 'Aanmelden met Google niet beschikbaar' },
  'Mot de passe actuel incorrect': { ar: 'كلمة المرور الحالية غير صحيحة', nl: 'Huidig wachtwoord onjuist' },
  'Mot de passe : 8 caracteres minimum': { ar: 'كلمة المرور: 8 أحرف على الأقل', nl: 'Wachtwoord: minimaal 8 tekens' },
  'Utilisez une adresse email differente': { ar: 'استخدم عنوان بريد إلكتروني مختلفا', nl: 'Gebruik een ander e-mailadres' },
  'Un compte utilise deja cette adresse email': { ar: 'يستخدم حساب آخر هذا البريد الإلكتروني', nl: 'Een account gebruikt dit e-mailadres al' },
  'Trop de demandes. Reessayez plus tard.': { ar: 'طلبات كثيرة. حاول لاحقا.', nl: 'Te veel aanvragen. Probeer later opnieuw.' },
  'Code expire. Recommencez la demande.': { ar: 'انتهت صلاحية الرمز. أعد الطلب.', nl: 'Code verlopen. Start de aanvraag opnieuw.' },
  'Cette adresse email est deja utilisee': { ar: 'هذا البريد الإلكتروني مستخدم بالفعل', nl: 'Dit e-mailadres is al in gebruik' },
  'Code de confirmation expire. Demandez-en un nouveau.': { ar: 'انتهت صلاحية رمز التأكيد. اطلب رمزا جديدا.', nl: 'Bevestigingscode verlopen. Vraag een nieuwe aan.' },
  'Code de confirmation incorrect': { ar: 'رمز التأكيد غير صحيح', nl: 'Onjuiste bevestigingscode' },

  // Trajets et demandes de transport
  'Prix invalide': { ar: 'سعر غير صالح', nl: 'Ongeldige prijs' },
  'Trajet indisponible': { ar: 'الرحلة غير متاحة', nl: 'Reis niet beschikbaar' },
  'Impossible de modifier un trajet avec operation en cours': { ar: 'لا يمكن تعديل رحلة مرتبطة بعملية جارية', nl: 'Een reis met een lopende operatie kan niet worden bewerkt' },
  'Depart et arrivee identiques': { ar: 'نقطتا الانطلاق والوصول متطابقتان', nl: 'Vertrek en aankomst zijn identiek' },
  'La date est deja passee': { ar: 'التاريخ قد مضى', nl: 'De datum is al voorbij' },
  'Impossible de retirer un trajet avec operation en cours': { ar: 'لا يمكن حذف رحلة مرتبطة بعملية جارية', nl: 'Een reis met een lopende operatie kan niet worden verwijderd' },
  'Trajet expiré ou indisponible': { ar: 'الرحلة منتهية أو غير متاحة', nl: 'Reis verlopen of niet beschikbaar' },
  'Vous ne pouvez pas accepter votre propre trajet': { ar: 'لا يمكنك قبول رحلتك الخاصة', nl: 'U kunt uw eigen reis niet aanvaarden' },
  'Indiquez entre 1 et 20 documents.': { ar: 'حدد عددا بين وثيقة واحدة و20 وثيقة.', nl: 'Geef tussen 1 en 20 documenten op.' },

  // Opérations
  'Operation introuvable': { ar: 'العملية غير موجودة', nl: 'Operatie niet gevonden' },
  'Paiement réservé à l expéditeur': { ar: 'الدفع مخصص للمرسل', nl: 'Betaling is voorbehouden aan de verzender' },
  'Le paiement attend la confirmation du voyageur': { ar: 'الدفع ينتظر تأكيد المسافر', nl: 'De betaling wacht op bevestiging van de reiziger' },
  'Aucune confirmation disponible a cette etape': { ar: 'لا يوجد تأكيد متاح في هذه المرحلة', nl: 'Geen bevestiging beschikbaar in deze stap' },
  'Confirmation reservee au voyageur': { ar: 'التأكيد مخصص للمسافر', nl: 'Bevestiging is voorbehouden aan de reiziger' },
  'Refus reserve au voyageur': { ar: 'الرفض مخصص للمسافر', nl: 'Weigering is voorbehouden aan de reiziger' },
  'Cette operation ne peut plus etre refusee': { ar: 'لم يعد من الممكن رفض هذه العملية', nl: 'Deze operatie kan niet meer worden geweigerd' },
  'Annulation reservee a l expediteur': { ar: 'الإلغاء مخصص للمرسل', nl: 'Annulering is voorbehouden aan de verzender' },
  'Cette operation ne peut plus etre annulee': { ar: 'لم يعد من الممكن إلغاء هذه العملية', nl: 'Deze operatie kan niet meer worden geannuleerd' },
  'Operation deja terminee': { ar: 'العملية منتهية بالفعل', nl: 'Operatie is al voltooid' },
  'Aucun litige ouvert sur cette operation': { ar: 'لا يوجد نزاع مفتوح على هذه العملية', nl: 'Geen open geschil voor deze operatie' },
  'Photo invalide': { ar: 'صورة غير صالحة', nl: 'Ongeldige foto' },
  'Destinataire invalide': { ar: 'مستلم غير صالح', nl: 'Ongeldige ontvanger' },
  'Conversation invalide': { ar: 'محادثة غير صالحة', nl: 'Ongeldig gesprek' },

  // Messagerie
  'Conversation introuvable': { ar: 'المحادثة غير موجودة', nl: 'Gesprek niet gevonden' },
  'Motif requis': { ar: 'السبب مطلوب', nl: 'Reden vereist' },
  'Participant introuvable': { ar: 'المشارك غير موجود', nl: 'Deelnemer niet gevonden' },
  'Compte bloque introuvable': { ar: 'الحساب المحظور غير موجود', nl: 'Geblokkeerd account niet gevonden' },
  'Cette conversation est bloquee. Aucun nouveau message ne peut etre envoye.': { ar: 'هذه المحادثة محظورة ولا يمكن إرسال رسالة جديدة.', nl: 'Dit gesprek is geblokkeerd. Er kunnen geen nieuwe berichten worden verstuurd.' },
  'Localisation invalide': { ar: 'موقع غير صالح', nl: 'Ongeldige locatie' },
  'Message vide': { ar: 'الرسالة فارغة', nl: 'Leeg bericht' },
  'Piece jointe invalide': { ar: 'مرفق غير صالح', nl: 'Ongeldige bijlage' },
  'Message introuvable': { ar: 'الرسالة غير موجودة', nl: 'Bericht niet gevonden' },
  'Vous pouvez supprimer uniquement vos messages': { ar: 'يمكنك حذف رسائلك فقط', nl: 'U kunt alleen uw eigen berichten verwijderen' },

  // Propositions
  'Cette annonce ne peut plus recevoir de proposition': { ar: 'لم يعد هذا الإعلان يقبل عروضا', nl: 'Dit zoekertje kan geen aanbiedingen meer ontvangen' },
  'Trajet incompatible': { ar: 'الرحلة غير متوافقة', nl: 'Onverenigbare reis' },
  'Ce trajet ne correspond pas aux contraintes de l annonce': { ar: 'هذه الرحلة لا تطابق شروط الإعلان', nl: 'Deze reis voldoet niet aan de voorwaarden van het zoekertje' },
  'Montant proposé invalide': { ar: 'المبلغ المقترح غير صالح', nl: 'Ongeldig voorgesteld bedrag' },
  'Voyageur introuvable': { ar: 'المسافر غير موجود', nl: 'Reiziger niet gevonden' },
  'Proposition introuvable': { ar: 'العرض غير موجود', nl: 'Aanbieding niet gevonden' },
  'Cette proposition n est plus active': { ar: 'هذا العرض لم يعد نشطا', nl: 'Deze aanbieding is niet meer actief' },
  'En attente de la réponse du voyageur': { ar: 'في انتظار رد المسافر', nl: 'Wacht op antwoord van de reiziger' },
  'En attente de la réponse de l expéditeur': { ar: 'في انتظار رد المرسل', nl: 'Wacht op antwoord van de verzender' },
  'Video de scellage requise': { ar: 'فيديو الختم مطلوب', nl: 'Verzegelvideo vereist' },

  // Administration et recours
  'Membre introuvable': { ar: 'العضو غير موجود', nl: 'Lid niet gevonden' },
  'Role invalide': { ar: 'دور غير صالح', nl: 'Ongeldige rol' },
  'Vous ne pouvez pas retirer votre propre acces administrateur.': { ar: 'لا يمكنك إزالة صلاحيات الإدارة عن حسابك.', nl: 'U kunt uw eigen beheerderstoegang niet verwijderen.' },
  'Au moins un administrateur doit rester actif.': { ar: 'يجب أن يبقى مشرف واحد على الأقل نشطا.', nl: 'Minstens één beheerder moet actief blijven.' },
  'Un administrateur ne peut pas etre sanctionne depuis cet ecran.': { ar: 'لا يمكن معاقبة مشرف من هذه الشاشة.', nl: 'Een beheerder kan niet via dit scherm worden gesanctioneerd.' },
  'Action invalide': { ar: 'إجراء غير صالح', nl: 'Ongeldige actie' },
  'Motif obligatoire (5 caracteres minimum)': { ar: 'السبب إلزامي (5 أحرف على الأقل)', nl: 'Reden verplicht (minimaal 5 tekens)' },
  'Expliquez votre recours en au moins 10 caracteres.': { ar: 'اشرح اعتراضك في 10 أحرف على الأقل.', nl: 'Licht uw beroep toe in minstens 10 tekens.' },
  'Un recours est deja en cours de traitement.': { ar: 'يوجد اعتراض قيد المعالجة بالفعل.', nl: 'Er wordt al een beroep behandeld.' },
  'Recours introuvable': { ar: 'الاعتراض غير موجود', nl: 'Beroep niet gevonden' },
  'Decision invalide': { ar: 'قرار غير صالح', nl: 'Ongeldige beslissing' },

  // Email et messages de confirmation
  'Service email indisponible': { ar: 'خدمة البريد الإلكتروني غير متاحة', nl: 'E-maildienst niet beschikbaar' },
  'Impossible d envoyer l email de verification': { ar: 'تعذر إرسال رسالة التحقق', nl: 'De verificatie-e-mail kon niet worden verzonden' },
  'La verification par email n est pas encore configuree.': { ar: 'التحقق عبر البريد الإلكتروني غير مهيأ بعد.', nl: 'E-mailverificatie is nog niet geconfigureerd.' },
  'Un code de verification vient d etre envoye.': { ar: 'تم إرسال رمز تحقق للتو.', nl: 'Er is zojuist een verificatiecode verzonden.' },
  'Un nouveau code vient d etre envoye.': { ar: 'تم إرسال رمز جديد للتو.', nl: 'Er is zojuist een nieuwe code verzonden.' },
  'Mot de passe mis a jour. Verifiez maintenant votre adresse email pour acceder a l application.': {
    ar: 'تم تحديث كلمة المرور. تحقق الآن من بريدك الإلكتروني للدخول إلى التطبيق.',
    nl: 'Wachtwoord bijgewerkt. Verifieer nu uw e-mailadres om de app te openen.',
  },
  'Si un compte correspond a cette adresse, un email vient d etre envoye.': {
    ar: 'إذا كان هناك حساب مرتبط بهذا العنوان، فقد تم إرسال رسالة بريد إلكتروني.',
    nl: 'Als er een account bij dit adres hoort, is er een e-mail verzonden.',
  },
};

// Messages dynamiques (template literals côté code) : motifs avec groupes capturés,
// réinjectés dans la traduction via $1.
const PATTERNS = [
  {
    re: /^Impossible : (\d+) transaction\(s\) encore en cours\. Terminez-les d'abord\.$/,
    ar: 'غير ممكن: $1 معاملة لا تزال جارية. أنهِها أولاً.',
    nl: 'Onmogelijk: $1 transactie(s) nog lopend. Rond ze eerst af.',
  },
  {
    re: /^Plafond dépassé : votre compte est limité à (\d+(?:\.\d+)?) € par envoi$/,
    ar: 'تجاوزت السقف: حسابك محدود بـ $1 € لكل شحنة',
    nl: 'Plafond overschreden: uw account is beperkt tot $1 € per zending',
  },
  {
    re: /^Catégorie refusée : (.+)$/,
    ar: 'فئة مرفوضة: $1',
    nl: 'Categorie geweigerd: $1',
  },
  {
    re: /^Plafond atteint : (\d+) transaction\(s\) active\(s\) max$/,
    ar: 'بلغت السقف: $1 معاملة نشطة كحد أقصى',
    nl: 'Plafond bereikt: max $1 actieve transactie(s)',
  },
  {
    re: /^Le colis doit peser entre 0 et (\d+(?:\.\d+)?) kg\.$/,
    ar: 'يجب أن يتراوح وزن الطرد بين 0 و$1 كغ.',
    nl: 'Het pakket moet tussen 0 en $1 kg wegen.',
  },
];

function translateError(lang, msg) {
  if (!msg || lang === 'fr' || typeof msg !== 'string') return msg;
  const exact = ERRORS[msg];
  if (exact && exact[lang]) return exact[lang];
  for (const p of PATTERNS) {
    const m = msg.match(p.re);
    if (m && p[lang]) return msg.replace(p.re, p[lang]);
  }
  return msg; // repli : français
}

// Middleware : pose req.lang depuis Accept-Language (fr/ar/nl, défaut fr) et wrappe
// res.json pour traduire les textes d'interface renvoyés par l'API à la volée.
const SUPPORTED = new Set(['fr', 'ar', 'nl']);

export function langMiddleware(req, res, next) {
  const raw = String(req.headers['accept-language'] || '').split(',')[0].trim().slice(0, 2).toLowerCase();
  req.lang = SUPPORTED.has(raw) ? raw : 'fr';
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object') {
      const translated = { ...body };
      if (typeof body.error === 'string') translated.error = translateError(req.lang, body.error);
      if (typeof body.message === 'string') translated.message = translateError(req.lang, body.message);
      body = translated;
    }
    return originalJson(body);
  };
  next();
}

export { translateError, ERRORS, PATTERNS };

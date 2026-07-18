import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icons.jsx';
import { useIndexable } from '../useIndexable.js';

const LAST_UPDATE = '18 juillet 2026';
const LEGAL = {
  entity: '[A COMPLETER - raison sociale]',
  address: '[A COMPLETER - adresse du siege social]',
  registration: '[A COMPLETER - numero BCE / TVA]',
  email: '[A COMPLETER - email legal]',
  law: '[A COMPLETER - droit applicable et tribunaux competents]',
};

const SECTIONS = [
  {
    id: 'editor', title: '1. Editeur et champ d application', body: <>
      <p><b>{LEGAL.entity}</b>, {LEGAL.address}, {LEGAL.registration}, exploite la plateforme Wigofly. Contact legal : {LEGAL.email}.</p>
      <p>Les presentes conditions encadrent l utilisation du site, de l application et des services Wigofly. Elles s appliquent aux expediteurs, voyageurs, destinataires et visiteurs. L utilisation de Wigofly implique leur acceptation.</p>
      <p className="policy-note"><Icon name="info" size={14} /> Les informations entre crochets doivent etre remplacees par les informations de la societe avant toute ouverture commerciale.</p>
    </>,
  },
  {
    id: 'role', title: '2. Role de Wigofly', body: <>
      <p>Wigofly fournit un outil de mise en relation, de coordination, de messagerie, de verification manuelle et de suivi d operations. Wigofly ne transporte pas les colis, ne controle pas physiquement leur contenu et ne remplace ni un transporteur, ni un transitaire, ni un mandataire en douane.</p>
      <p>Chaque expediteur, voyageur et destinataire reste responsable de ses choix, declarations, obligations fiscales, regles de bagage, obligations douanieres et formalites applicables.</p>
    </>,
  },
  {
    id: 'account', title: '3. Compte, securite et verification', body: <ul className="checklist">
      <li>Vous devez fournir des informations exactes, garder votre mot de passe confidentiel et nous signaler rapidement tout acces non autorise.</li>
      <li>Un compte est personnel. Les comptes multiples, fausses identites et tentatives de contournement des controles sont interdits.</li>
      <li>L email doit etre verifie avant l acces a l application. Une connexion Google ne peut etre proposee que lorsqu un veritable flux OAuth est active.</li>
      <li>La publication de trajets et certaines actions peuvent exiger une verification d identite. La verification est actuellement instruite par Wigofly ; un prestataire externe ne sera cite qu apres sa mise en service effective.</li>
      <li>Vous devez avoir au moins 18 ans ou utiliser le service avec l autorisation et sous la responsabilite du titulaire legalement habilite.</li>
    </ul>,
  },
  {
    id: 'products', title: '4. Produits, declarations et douane', body: <>
      <p>Seuls les produits autorises par le catalogue et les regles affichees dans l application peuvent etre proposes. Sont notamment interdits les marchandises illicites, dangereuses, contrefaites, non declarees, les especes, documents officiels, medicaments, alcool, tabac, armes et tout objet interdit par les lois ou regles de transport applicables.</p>
      <p>L expediteur garantit que la description, les photos, la valeur, la quantite et le contenu declares sont exacts. Le voyageur doit pouvoir inspecter le colis avant sa prise en charge et peut le refuser sans le transporter.</p>
      <p className="policy-note"><Icon name="alert" size={14} /> Un colis accepte dans Wigofly n est pas automatiquement admis en douane. L utilisateur doit verifier les regles du pays de depart, de transit et d arrivee.</p>
    </>,
  },
  {
    id: 'operation', title: '5. Demandes, remise et preuve', body: <ol className="policy-ol">
      <li>Un expediteur envoie une demande pour un trajet et le voyageur peut accepter, refuser ou discuter des conditions dans Wigofly.</li>
      <li>Avant la remise, les parties verifient le contenu, la quantite, les conditions de transport et le lieu de rendez-vous.</li>
      <li>Les confirmations, photos, videos de preuve et messages conserves dans Wigofly peuvent etre utilises pour traiter un litige.</li>
      <li>Une remise ou une livraison ne doit etre confirmee que lorsqu elle a effectivement eu lieu.</li>
    </ol>,
  },
  {
    id: 'payment', title: '6. Paiement et frais', body: <>
      <p><b>Etat actuel du service :</b> le module de paiement et d escrow est simule. Aucun paiement reel, encaissement, cantonnement ou versement n est execute par Wigofly tant qu un prestataire de paiement agree et les conditions de paiement definitives ne sont pas actives.</p>
      <p>Avant l activation de paiements reels, Wigofly publiera le nom du prestataire, les frais applicables, les conditions de remboursement, les delais de versement et les informations legalement requises. Les utilisateurs ne doivent jamais payer un autre utilisateur en dehors des moyens officiellement proposes par Wigofly.</p>
    </>,
  },
  {
    id: 'chat', title: '7. Messagerie, photos et localisation', body: <ul className="checklist">
      <li>La coordination doit rester dans la messagerie Wigofly. Les numeros, emails, liens, reseaux sociaux et moyens de paiement externes peuvent etre bloques ou moderes pour proteger les utilisateurs.</li>
      <li>Les photos et messages envoyes doivent etre licites, pertinents et ne pas porter atteinte aux droits de tiers.</li>
      <li>Le partage de localisation est volontaire et ponctuel. Il expire apres 30 minutes ou 2 heures selon le choix de l utilisateur. Avant confirmation d une operation, la position partagee est volontairement approximative.</li>
      <li>Il est interdit d utiliser la localisation pour suivre, harceler ou mettre en danger une autre personne.</li>
    </ul>,
  },
  {
    id: 'conduct', title: '8. Comportements interdits et moderation', body: <ul className="checklist">
      <li>Fraude, fausse declaration, tentative de contournement des controles, usurpation d identite ou publication de contenu illicite.</li>
      <li>Harclement, menace, discrimination, pression pour communiquer hors application ou pour payer en dehors de Wigofly.</li>
      <li>Utilisation de la plateforme a des fins commerciales non autorisees, collecte de donnees d autres membres ou atteinte a la securite du service.</li>
      <li>Wigofly peut retirer un contenu, limiter une fonctionnalite, suspendre un compte ou transmettre les elements necessaires aux autorites lorsque la loi l exige. Une demande de reexamen peut etre adressee a {LEGAL.email}.</li>
    </ul>,
  },
  {
    id: 'disputes', title: '9. Litiges et reclamations', body: <>
      <p>Un litige doit etre ouvert depuis l operation concernee des que possible, avec les elements utiles : photos, video de preuve, messages et explication factuelle. Wigofly peut demander des informations complementaires et appliquer les mesures temporaires necessaires a la securite du dossier.</p>
      <p>Une decision interne de moderation ou d assistance ne prive jamais un utilisateur de ses droits legaux, de sa possibilite de saisir les autorites competentes ou les juridictions competentes.</p>
    </>,
  },
  {
    id: 'liability', title: '10. Responsabilite', body: <>
      <p>Dans les limites autorisees par la loi, Wigofly n est pas responsable des declarations des utilisateurs, de la qualite d un produit, d un retard de voyage, d une decision douaniere, d un accord conclu hors application ou d un dommage cause par un utilisateur.</p>
      <p>Rien dans les presentes conditions ne limite les droits imperatifs des consommateurs ni la responsabilite qui ne peut etre exclue par la loi applicable.</p>
    </>,
  },
  {
    id: 'end', title: '11. Duree, fermeture et evolution des conditions', body: <>
      <p>Vous pouvez cesser d utiliser Wigofly et demander la suppression de votre compte depuis les reglages, sous reserve des obligations legales et des operations en cours. Wigofly peut modifier ces conditions pour des raisons legales, de securite ou d evolution du service ; les changements importants seront annonces avant leur prise d effet.</p>
      <p>Droit applicable et reglement des litiges : {LEGAL.law}.</p>
    </>,
  },
];

export default function Terms() {
  const nav = useNavigate();
  useIndexable();
  return <div>
    <button className="link-btn mb" onClick={() => nav(-1)}><Icon name="arrowLeft" size={14} />Retour</button>
    <h1 className="page-title">Conditions generales d utilisation</h1>
    <p className="page-sub">Derniere mise a jour : {LAST_UPDATE}</p>
    <div className="alert alert-warn"><Icon name="alert" size={17} /><span>Texte pre-publication : les champs entre crochets et les conditions de paiement doivent etre finalises et valides par un avocat avant tout lancement commercial.</span></div>
    {SECTIONS.map((section) => <div id={section.id} className="card policy-section" key={section.id}><h2 className="policy-h2">{section.title}</h2><div className="policy-body">{section.body}</div></div>)}
    <div className="card center" style={{ padding: '20px 18px' }}><Icon name="mail" size={22} /><p className="muted mt" style={{ fontSize: 13 }}>Question concernant ces conditions ?</p><b style={{ color: 'var(--accent)' }}>{LEGAL.email}</b></div>
  </div>;
}

import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icons.jsx';
import { useIndexable } from '../useIndexable.js';

const LAST_UPDATE = '18 juillet 2026';
const CONTACT = '[A COMPLETER - contact confidentialite et adresse postale]';
const RETENTION = '[A COMPLETER - duree validee avec votre conseil juridique]';

const SECTIONS = [
  {
    id: 'controller', title: '1. Responsable du traitement', body: <>
      <p>Le responsable du traitement est <b>[A COMPLETER - raison sociale de Wigofly]</b>, etabli a <b>[A COMPLETER - adresse du siege]</b>.</p>
      <p>Pour toute question ou demande concernant vos donnees : <b>{CONTACT}</b>. Ne designez une personne comme DPO que lorsqu elle a ete officiellement nommee.</p>
    </>,
  },
  {
    id: 'data', title: '2. Donnees traitees', body: <table className="policy-table"><thead><tr><th>Categorie</th><th>Exemples</th><th>Origine</th></tr></thead><tbody>
      <tr><td>Compte</td><td>Nom, email, ville, photo, langue, preferences</td><td>Vous</td></tr>
      <tr><td>Connexion et securite</td><td>Mot de passe hache, sessions, tentatives de connexion, journaux de securite</td><td>Application</td></tr>
      <tr><td>Verification d identite</td><td>Nom legal, date de naissance, piece, selfie, decisions de verification</td><td>Vous</td></tr>
      <tr><td>Trajets et operations</td><td>Itineraires, dates, capacite, annonces, prix proposes, preuves</td><td>Vous et votre partenaire</td></tr>
      <tr><td>Messagerie</td><td>Messages, photos jointes, signalements et actions de moderation</td><td>Vous</td></tr>
      <tr><td>Localisation ponctuelle</td><td>Lieu choisi ou position actuelle, precision, expiration</td><td>Vous, apres autorisation du navigateur</td></tr>
      <tr><td>Paiement</td><td>Statut et montants d une operation lorsque le paiement reel sera active</td><td>Prestataire de paiement</td></tr>
    </tbody></table>,
  },
  {
    id: 'purposes', title: '3. Finalites et bases legales', body: <ul className="checklist">
      <li><b>Execution du contrat :</b> creer le compte, proposer des trajets, coordonner les operations et fournir la messagerie.</li>
      <li><b>Interet legitime :</b> proteger le service, prevenir la fraude, moderer les abus, conserver une trace des actions et ameliorer la fiabilite.</li>
      <li><b>Consentement :</b> utiliser la localisation de l appareil, recevoir des communications optionnelles ou activer un fournisseur optionnel.</li>
      <li><b>Obligation legale :</b> repondre a une demande valable d une autorite, respecter les obligations qui s appliqueront au service et conserver les elements requis.</li>
    </ul>,
  },
  {
    id: 'location', title: '4. Localisation', body: <>
      <p>Wigofly ne suit pas votre position en continu. La localisation n est lue qu apres votre action dans une conversation et l autorisation de votre navigateur. Vous pouvez choisir votre position actuelle ou un lieu de rendez-vous.</p>
      <p>Le partage est ponctuel, expire au bout de 30 minutes ou 2 heures, et est approximatif avant confirmation d une operation. Une fois expire, le destinataire ne peut plus ouvrir le partage dans l interface. La trace du message peut toutefois rester liee a la conversation pendant la duree de conservation applicable.</p>
    </>,
  },
  {
    id: 'recipients', title: '5. Destinataires et sous-traitants', body: <ul className="checklist">
      <li>Votre partenaire de transaction : uniquement les informations necessaires a la coordination et celles que vous partagez dans l application.</li>
      <li>Equipe Wigofly : acces limite aux dossiers, demandes de verification, signalements et litiges selon le besoin d intervention.</li>
      <li><b>Supabase</b> : base de donnees, authentification technique et temps reel.</li>
      <li><b>Vercel</b> : hebergement de l application et fonctions serveur.</li>
      <li><b>Resend</b> : envoi des emails transactionnels, notamment la verification d email.</li>
      <li><b>Google</b> : seulement si et lorsque la connexion Google OAuth est effectivement activee.</li>
      <li>Un prestataire de paiement ou de KYC ne sera ajoute a cette liste qu apres son activation et la mise a jour de cette politique.</li>
      <li>Autorites publiques : uniquement en cas d obligation legale ou de demande valable.</li>
    </ul>,
  },
  {
    id: 'retention', title: '6. Conservation et suppression', body: <ul className="checklist">
      <li>Compte et profil : pendant la duree du compte, puis selon {RETENTION}.</li>
      <li>Messages, photos et donnees de localisation : {RETENTION}. La visibilite d une localisation peut expirer avant la suppression technique des donnees.</li>
      <li>Pieces et selfie de verification : {RETENTION}, avec acces strictement limite. Les images KYC sont exclues de l export standard.</li>
      <li>Journal de securite et de moderation : {RETENTION}.</li>
      <li>En cas de suppression du compte, Wigofly anonymise les donnees de profil lorsque cela est techniquement et legalement possible ; les elements necessaires a une obligation legale ou un litige en cours peuvent etre conserves.</li>
    </ul>,
  },
  {
    id: 'rights', title: '7. Vos droits', body: <>
      <p>Vous pouvez demander l acces, la rectification, l effacement, la limitation, l opposition et la portabilite de vos donnees. L application propose deja l export et la suppression de compte dans les reglages, sous certaines conditions de securite et d operations en cours.</p>
      <p>Adressez les demandes specifiques a {CONTACT}. Une reponse est fournie dans le delai legal applicable, en principe un mois. Vous pouvez egalement introduire une reclamation aupres de l autorite de protection des donnees competente.</p>
    </>,
  },
  {
    id: 'security', title: '8. Securite, stockage local et cookies', body: <>
      <p>Les mots de passe sont stockes sous forme hachee. Wigofly utilise des sessions, des protections contre les tentatives de connexion abusives et des controles de securite pour la messagerie et les comptes.</p>
      <p>L application utilise le stockage local du navigateur pour conserver notamment la session, la langue, le theme et certains brouillons. Aucun cookie publicitaire tiers n est utilise par l application a ce jour. Cette affirmation doit etre revue si des outils de mesure d audience, publicite ou pixels sont ajoutes.</p>
    </>,
  },
  {
    id: 'transfers', title: '9. Transferts internationaux et modifications', body: <>
      <p>Les emplacements reels de traitement et les mecanismes de transfert des sous-traitants doivent etre confirmes dans leurs documents contractuels avant le lancement commercial. Si un transfert hors EEE est necessaire, Wigofly mettra en place le mecanisme legal approprie et mettra a jour cette politique.</p>
      <p>Cette politique peut evoluer en cas de changement legal, technique ou fonctionnel. Les changements importants seront annonces dans l application avant leur prise d effet.</p>
    </>,
  },
];

export default function PrivacyPolicy() {
  const nav = useNavigate();
  useIndexable();
  return <div>
    <button className="link-btn mb" onClick={() => nav(-1)}><Icon name="arrowLeft" size={14} />Retour</button>
    <h1 className="page-title">Politique de confidentialite</h1>
    <p className="page-sub">Derniere mise a jour : {LAST_UPDATE}</p>
    <div className="alert alert-warn"><Icon name="alert" size={17} /><span>Texte pre-publication : completez les champs entre crochets, les durees de conservation et les informations de societe avant le lancement commercial.</span></div>
    {SECTIONS.map((section) => <div id={section.id} className="card policy-section" key={section.id}><h2 className="policy-h2">{section.title}</h2><div className="policy-body">{section.body}</div></div>)}
    <div className="card center" style={{ padding: '20px 18px' }}><Icon name="mail" size={22} /><p className="muted mt" style={{ fontSize: 13 }}>Question concernant vos donnees ?</p><b style={{ color: 'var(--accent)' }}>{CONTACT}</b></div>
  </div>;
}

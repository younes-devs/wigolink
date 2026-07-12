import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icons.jsx';

const LAST_UPDATE = '11 juillet 2026';

const SECTIONS = [
  {
    id: 'responsable',
    title: '1. Responsable du traitement',
    body: (
      <>
        <p>
          CloudKilo (ci-après « <b>nous</b> », « <b>la Plateforme</b> ») est responsable du traitement des données
          personnelles collectées via l'application, au sens de l'article 4.7 du Règlement Général sur la
          Protection des Données (RGPD — UE 2016/679).
        </p>
        <p>
          Pour toute question relative à vos données, vous pouvez contacter notre Délégué à la Protection des
          Données : <a href="mailto:dpo@cloudkilo.app">dpo@cloudkilo.app</a>.
        </p>
      </>
    ),
  },
  {
    id: 'donnees',
    title: '2. Données que nous collectons',
    body: (
      <>
        <table className="policy-table">
          <thead><tr><th>Catégorie</th><th>Exemples</th><th>Source</th></tr></thead>
          <tbody>
            <tr><td>Identité</td><td>Nom, email, téléphone, ville, photo de profil</td><td>Vous, à l'inscription</td></tr>
            <tr><td>Vérification d'identité (KYC)</td><td>Pièce d'identité (recto/verso), selfie, nom légal, date de naissance</td><td>Vous, lors de la vérification</td></tr>
            <tr><td>Transaction</td><td>Annonces, photos de produits, valeur déclarée, trajets</td><td>Vous</td></tr>
            <tr><td>Preuve & traçabilité</td><td>Vidéo de scellage, horodatage, géolocalisation au scellage</td><td>Application, avec votre action</td></tr>
            <tr><td>Paiement</td><td>Statut d'escrow, montants — jamais les coordonnées bancaires complètes</td><td>Prestataire de paiement agréé</td></tr>
            <tr><td>Communication</td><td>Messages échangés dans la messagerie in-app</td><td>Vous</td></tr>
            <tr><td>Réputation</td><td>Notes, avis, badges, taux d'annulation</td><td>Vous et vos partenaires de transaction</td></tr>
            <tr><td>Technique</td><td>Journal des événements de transaction, adresse IP, appareil</td><td>Application</td></tr>
          </tbody>
        </table>
        <p className="policy-note">
          <Icon name="lock" size={14} /> Vos documents d'identité (pièce, selfie) sont conservés de façon
          sécurisée et ne sont accessibles qu'à notre équipe de vérification habilitée, jamais visibles par
          les autres membres. Ils ne sont pas inclus dans l'export standard de vos données.
        </p>
      </>
    ),
  },
  {
    id: 'finalites',
    title: '3. Pourquoi nous les utilisons',
    body: (
      <ul className="checklist">
        <li>Créer et sécuriser votre compte, vérifier votre identité avant toute transaction.</li>
        <li>Mettre en relation expéditeurs et voyageurs sur un trajet compatible.</li>
        <li>Séquestrer et libérer les paiements via notre prestataire agréé.</li>
        <li>Produire une preuve du contenu transporté (vidéo, horodatage) en cas de litige ou de contrôle douanier.</li>
        <li>Détecter les tentatives de fraude, de désintermédiation ou de comptes liés.</li>
        <li>Calculer votre score de fiabilité et vos plafonds progressifs.</li>
        <li>Résoudre les litiges selon notre grille d'arbitrage.</li>
        <li>Respecter nos obligations légales (lutte contre la fraude, conservation à des fins douanières).</li>
      </ul>
    ),
  },
  {
    id: 'base-legale',
    title: '4. Base légale du traitement',
    body: (
      <ul className="checklist">
        <li><b>Exécution du contrat</b> — gestion de compte, matching, escrow, messagerie.</li>
        <li><b>Obligation légale</b> — vérification d'identité (KYC), lutte anti-blanchiment, conservation à des fins fiscales/douanières.</li>
        <li><b>Intérêt légitime</b> — prévention de la fraude, sécurité de la plateforme, amélioration du service.</li>
        <li><b>Consentement</b> — notifications optionnelles, cookies non essentiels (voir §8).</li>
      </ul>
    ),
  },
  {
    id: 'destinataires',
    title: '5. Qui a accès à vos données',
    body: (
      <>
        <p>Vos données ne sont jamais vendues. Elles peuvent être partagées avec :</p>
        <ul className="checklist">
          <li><b>Prestataire de vérification d'identité</b> (KYC) — pour valider votre pièce d'identité.</li>
          <li><b>Prestataire de paiement agréé</b> (escrow) — pour séquestrer et verser les fonds. CloudKilo ne détient jamais vos fonds ni vos coordonnées bancaires complètes.</li>
          <li><b>Votre partenaire de transaction</b> — nom, photo, score de fiabilité, badges (jamais votre téléphone avant l'accord).</li>
          <li><b>Autorités compétentes</b> — sur réquisition légale (douanes, justice).</li>
          <li><b>Notre équipe support/arbitrage</b> — pour instruire un litige, avec accès restreint et journalisé.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'conservation',
    title: '6. Durée de conservation',
    body: (
      <ul className="checklist">
        <li><b>Compte actif</b> — pendant toute la durée d'utilisation du service.</li>
        <li><b>Vidéos de scellage</b> — durée de la transaction + durée légale de contestation, puis suppression.</li>
        <li><b>Historique de transactions</b> — conservé après clôture du compte à des fins de traçabilité douanière et de gestion des litiges, données personnelles anonymisées.</li>
        <li><b>Documents KYC</b> — selon la politique de rétention du prestataire, conforme aux obligations anti-blanchiment.</li>
        <li><b>Compte supprimé</b> — anonymisation immédiate du nom, email, téléphone et photo (voir « Supprimer mon compte » dans les réglages).</li>
      </ul>
    ),
  },
  {
    id: 'droits',
    title: '7. Vos droits',
    body: (
      <>
        <p>Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants :</p>
        <ul className="checklist">
          <li><b>Droit d'accès</b> — obtenir une copie de vos données (bouton « Exporter mes données »).</li>
          <li><b>Droit de rectification</b> — corriger vos informations depuis votre profil.</li>
          <li><b>Droit à l'effacement</b> — supprimer votre compte (anonymisation immédiate, sous réserve d'aucune transaction active).</li>
          <li><b>Droit à la portabilité</b> — récupérer vos données dans un format structuré (JSON).</li>
          <li><b>Droit d'opposition et de limitation</b> — nous contacter pour toute demande spécifique.</li>
          <li><b>Droit de réclamation</b> — auprès de l'Autorité de protection des données belge (APD) ou de la CNIL française.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'securite',
    title: '8. Sécurité et cookies',
    body: (
      <>
        <p>
          Mots de passe hachés (jamais stockés en clair), sessions révocables, détection anti-fraude et
          anti-brute-force sur les connexions. Nous utilisons uniquement des cookies techniques nécessaires au
          fonctionnement du service (session, préférence de thème) — aucun cookie publicitaire tiers.
        </p>
      </>
    ),
  },
  {
    id: 'transferts',
    title: '9. Transferts internationaux',
    body: (
      <p>
        Le corridor Belgique/France ↔ Maroc implique des transferts de données vers le Maroc (identité du
        destinataire, coordination logistique). Ces transferts sont encadrés par des clauses contractuelles types
        conformes à l'article 46 du RGPD avec nos prestataires.
      </p>
    ),
  },
  {
    id: 'modifications',
    title: '10. Modifications de cette politique',
    body: (
      <p>
        Cette politique peut être mise à jour pour refléter des évolutions légales ou fonctionnelles. Toute
        modification substantielle vous sera notifiée dans l'application avant son entrée en vigueur.
      </p>
    ),
  },
];

export default function PrivacyPolicy() {
  const nav = useNavigate();
  return (
    <div>
      <button className="link-btn mb" onClick={() => nav(-1)}>
        <Icon name="arrowLeft" size={14} />Retour
      </button>
      <h1 className="page-title">Politique de confidentialité</h1>
      <p className="page-sub">Dernière mise à jour : {LAST_UPDATE}</p>

      <div className="alert alert-teal">
        <Icon name="shieldCheck" size={17} />
        <span>
          Document de référence complet. Pour agir sur vos données (export, suppression), rendez-vous dans
          Profil → Confidentialité et données.
        </span>
      </div>

      {SECTIONS.map((s) => (
        <div className="card policy-section" key={s.id}>
          <h2 className="policy-h2">{s.title}</h2>
          <div className="policy-body">{s.body}</div>
        </div>
      ))}

      <div className="card center" style={{ padding: '20px 18px' }}>
        <Icon name="mail" size={22} />
        <p className="muted mt" style={{ fontSize: 13 }}>
          Une question sur vos données ? Écrivez à notre DPO :
        </p>
        <a href="mailto:dpo@cloudkilo.app" style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
          dpo@cloudkilo.app
        </a>
      </div>
    </div>
  );
}

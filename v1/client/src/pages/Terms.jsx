import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icons.jsx';

const LAST_UPDATE = '12 juillet 2026';

const SECTIONS = [
  {
    id: 'objet',
    title: '1. Objet et statut de la plateforme',
    body: (
      <>
        <p>
          CloudKilo est une plateforme de mise en relation entre expéditeurs et voyageurs pour le transport
          collaboratif de produits du terroir sur le corridor Bruxelles ↔ Casablanca.
        </p>
        <p className="policy-note">
          <Icon name="shieldCheck" size={14} /> CloudKilo agit exclusivement en tant qu'<b>intermédiaire technique</b>.
          Nous ne sommes ni transporteur, ni transitaire, ni mandataire douanier. Nous ne manipulons jamais la
          marchandise. Les fonds sont détenus par un prestataire de paiement agréé, jamais par CloudKilo.
        </p>
      </>
    ),
  },
  {
    id: 'compte',
    title: '2. Création de compte et vérification d\'identité',
    body: (
      <ul className="checklist">
        <li>L'inscription requiert un email valide, un mot de passe (ou une connexion Google) et un numéro de téléphone.</li>
        <li>Aucune transaction n'est possible avant vérification d'identité (KYC) via notre prestataire agréé.</li>
        <li>Les nouveaux comptes sont soumis à des plafonds progressifs (valeur par envoi, nombre de transactions actives), relevés automatiquement avec l'historique de transactions réussies.</li>
        <li>Un compte est strictement personnel. La création de comptes multiples pour contourner les plafonds ou les scores de fiabilité est interdite et entraîne une suspension.</li>
      </ul>
    ),
  },
  {
    id: 'catalogue',
    title: '3. Produits autorisés et interdits',
    body: (
      <>
        <p>
          Seuls les produits figurant sur la liste blanche (produits de terroir scellés d'origine : huile d'argan,
          miel, épices, safran, amlou, huiles essentielles, dattes, cosmétiques naturels) peuvent être proposés,
          dans les quantités « usage personnel » affichées par catégorie.
        </p>
        <p>
          Sont strictement interdits : compléments alimentaires, médicaments, produits frais non scellés, liquides
          non scellés d'origine, tabac, alcool, électronique, argent ou objets de valeur, documents officiels, et
          tout produit non identifiable. Toute catégorie non reconnue est soumise à revue humaine avant publication.
        </p>
        <p className="policy-note">
          <Icon name="alert" size={14} /> Vous êtes seul responsable de l'exactitude de votre déclaration
          (contenu, valeur, quantité). Une fausse déclaration peut engager votre responsabilité pénale et douanière
          personnelle.
        </p>
      </>
    ),
  },
  {
    id: 'transaction',
    title: '4. Déroulement d\'une transaction et transfert de responsabilité',
    body: (
      <>
        <p>Chaque transaction suit une séquence obligatoire, à double validation :</p>
        <ol className="policy-ol">
          <li><b>Accord</b> — l'acceptation d'une annonce par un voyageur séquestre immédiatement le paiement chez notre prestataire.</li>
          <li><b>Remise</b> — l'expéditeur filme le scellage du colis (caméra in-app exclusivement). Le voyageur inspecte physiquement le contenu avant de le prendre en charge.</li>
          <li><b>Bascule de responsabilité</b> — la validation croisée par code/QR à la remise transfère la responsabilité du colis de l'expéditeur au voyageur.</li>
          <li><b>Livraison</b> — une seconde validation croisée à la remise au destinataire libère automatiquement le paiement au voyageur.</li>
        </ol>
        <p className="policy-note">
          <Icon name="shieldCheck" size={14} /> <b>Règle d'or du voyageur :</b> ne transportez jamais un colis que
          vous n'avez pas vu ouvert. Vous pouvez refuser un transport sans pénalité à tout moment avant la
          validation de prise en charge.
        </p>
      </>
    ),
  },
  {
    id: 'paiement',
    title: '5. Paiement, commission et remboursements',
    body: (
      <ul className="checklist">
        <li>Le paiement est séquestré (escrow) dès l'accord et libéré automatiquement à la double validation de livraison — jamais avant.</li>
        <li>CloudKilo prélève une commission de 15 à 20 % sur la rémunération du voyageur, affichée en toute transparence avant l'accord.</li>
        <li>En cas de refus du voyageur avant prise en charge, ou d'absence de l'expéditeur au rendez-vous, l'escrow est intégralement remboursé sans frais pour la partie non fautive.</li>
        <li>Les gains des voyageurs peuvent être soumis à déclaration fiscale selon votre pays de résidence — il vous appartient de vous renseigner auprès de l'administration compétente.</li>
      </ul>
    ),
  },
  {
    id: 'douane',
    title: '6. Douane et conformité réglementaire',
    body: (
      <p>
        Les franchises douanières applicables par corridor sont affichées à la création de chaque annonce et
        doivent être explicitement acceptées avant publication. <b>Le risque douanier (saisie, amende) d'un
        produit conforme à sa déclaration est porté par l'expéditeur.</b> Le voyageur reste libre de refuser un
        transport dont le contenu ne correspond pas à ce qui a été filmé et déclaré, à tout moment avant la prise
        en charge.
      </p>
    ),
  },
  {
    id: 'litiges',
    title: '7. Litiges et arbitrage',
    body: (
      <>
        <p>
          Tout désaccord sur une livraison peut être signalé via l'application dans les 72 heures suivant la date
          de livraison prévue. L'escrow est alors gelé le temps de l'instruction.
        </p>
        <ul className="checklist">
          <li>Un état à la livraison différent de la vidéo de scellage engage la responsabilité du voyageur (remboursement de l'expéditeur).</li>
          <li>Un état conforme à la vidéo mais différent de l'annonce initiale engage la responsabilité de l'expéditeur (paiement maintenu au voyageur).</li>
          <li>Notre équipe s'engage à un premier retour sous 24 heures et une résolution sous 7 jours.</li>
          <li>La décision d'arbitrage de CloudKilo, rendue selon cette grille, est définitive dans le cadre de l'usage de la plateforme.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'interdits',
    title: '8. Comportements interdits',
    body: (
      <ul className="checklist">
        <li>Contourner la plateforme pour finaliser une transaction hors application (paiement direct, échange de coordonnées avant accord) — non couvert par l'escrow ni l'assistance.</li>
        <li>Fournir de fausses informations d'identité, de produit ou de valeur déclarée.</li>
        <li>Créer de faux avis, fausses notes ou fausses contestations de litige.</li>
        <li>Utiliser la plateforme pour tout produit ou usage illégal.</li>
      </ul>
    ),
  },
  {
    id: 'responsabilite',
    title: '9. Limitation de responsabilité',
    body: (
      <p>
        CloudKilo met à disposition les outils de mise en relation, de vérification, de séquestre et d'arbitrage
        décrits ci-dessus, avec les moyens raisonnables pour sécuriser les échanges. CloudKilo ne saurait être
        tenu responsable des conséquences d'une fausse déclaration, d'un contournement de la plateforme, ou d'un
        cas de force majeure (retard de vol, incident douanier imprévisible, etc.). Notre responsabilité, quand
        elle est engagée, est limitée au montant de la transaction concernée.
      </p>
    ),
  },
  {
    id: 'suspension',
    title: '10. Suspension et résiliation',
    body: (
      <p>
        CloudKilo peut suspendre ou clôturer un compte en cas de violation des présentes conditions, de fraude
        avérée ou suspectée, ou de comportement mettant en danger la sécurité d'autres membres. Vous pouvez
        supprimer votre compte à tout moment depuis Profil → Confidentialité et données, sous réserve de n'avoir
        aucune transaction en cours.
      </p>
    ),
  },
  {
    id: 'droit',
    title: '11. Droit applicable',
    body: (
      <p>
        Les présentes CGU sont soumises au droit belge. Tout litige relatif à leur interprétation ou leur
        exécution relève, à défaut de résolution amiable, des tribunaux compétents de Bruxelles.
      </p>
    ),
  },
];

export default function Terms() {
  const nav = useNavigate();
  return (
    <div>
      <button className="link-btn mb" onClick={() => nav(-1)}>
        <Icon name="arrowLeft" size={14} />Retour
      </button>
      <h1 className="page-title">Conditions générales d'utilisation</h1>
      <p className="page-sub">Dernière mise à jour : {LAST_UPDATE}</p>

      <div className="alert alert-warn">
        <Icon name="alert" size={17} />
        <span>
          Document de travail. À faire valider par un avocat en droit belge et marocain avant toute exploitation
          commerciale — conformément au plan de lancement.
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
        <p className="muted mt" style={{ fontSize: 13 }}>Une question sur ces conditions ?</p>
        <a href="mailto:legal@cloudkilo.app" style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
          legal@cloudkilo.app
        </a>
      </div>
    </div>
  );
}

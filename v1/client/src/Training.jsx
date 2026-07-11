import { useState } from 'react';
import { api } from './api';
import { Icon } from './Icons.jsx';

// Formation courte obligatoire avant le premier transport (PRD §5.4).
// Le voyageur est la dernière ligne de défense : on le responsabilise.
const SLIDES = [
  {
    icon: 'eye',
    title: 'Voyez tout, toujours',
    body: "Ne transportez jamais ce que vous n'avez pas vu ouvert. Au rendez-vous, ouvrez le colis, inspectez chaque produit, comparez avec l'annonce et la vidéo de scellage. C'est VOUS qui passez la douane.",
  },
  {
    icon: 'shield',
    title: 'Vous pouvez toujours refuser',
    body: "Un doute ? Un produit qui ne correspond pas ? Refusez, sans pénalité, tant que vous n'avez pas scanné le QR de prise en charge. Après le scan, la responsabilité du colis vous incombe.",
  },
  {
    icon: 'lock',
    title: "Tout se passe dans l'app",
    body: "Paiement séquestré, preuve vidéo, litiges arbitrés : vos protections n'existent que dans l'app. Un arrangement par téléphone ou WhatsApp = zéro protection, zéro paiement garanti.",
  },
];

const QUIZ = [
  {
    id: 'q1',
    q: "On vous tend un colis déjà fermé « pour gagner du temps ». Que faites-vous ?",
    options: {
      a: "J'accepte, la vidéo de scellage suffit",
      b: "Je demande à l'ouvrir et je vérifie le contenu moi-même",
      c: "Je le pèse et je le prends si le poids correspond",
    },
  },
  {
    id: 'q2',
    q: 'Quand pouvez-vous refuser un transport sans pénalité ?',
    options: {
      a: 'Jamais après avoir accepté l\'annonce',
      b: 'Uniquement en cas de produit interdit',
      c: "À tout moment jusqu'au scan QR de prise en charge",
    },
  },
  {
    id: 'q3',
    q: "L'expéditeur propose de vous payer en liquide, hors app, « pour éviter la commission ». ",
    options: {
      a: 'Je refuse : hors app, aucune protection ni paiement garanti',
      b: "J'accepte si le montant est plus élevé",
      c: "J'accepte pour un petit colis seulement",
    },
  },
];

export default function Training({ onDone, onClose }) {
  const [step, setStep] = useState(0); // 0..2 slides, 3 = quiz
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/training/complete', { method: 'POST', body: { answers } });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal training-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="shieldCheck" size={20} />
          <b>Formation voyageur</b>
          <span className="pill pill-saffron" style={{ marginLeft: 'auto' }}>obligatoire · 2 min</span>
        </div>

        <div className="step-dots" style={{ margin: '4px 0 14px' }}>
          {[0, 1, 2, 3].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}
        </div>

        {step < 3 && (
          <div className="training-slide">
            <div className="training-icon"><Icon name={SLIDES[step].icon} size={30} /></div>
            <h3>{SLIDES[step].title}</h3>
            <p>{SLIDES[step].body}</p>
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              {step < 2 ? 'Continuer' : 'Passer au quiz'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="training-quiz">
            {QUIZ.map((item) => (
              <div key={item.id} className="quiz-item">
                <p className="quiz-q">{item.q}</p>
                {Object.entries(item.options).map(([key, label]) => (
                  <label key={key} className={`quiz-option ${answers[item.id] === key ? 'selected' : ''}`}>
                    <input type="radio" name={item.id} checked={answers[item.id] === key}
                      onChange={() => setAnswers({ ...answers, [item.id]: key })} />
                    {label}
                  </label>
                ))}
              </div>
            ))}
            {error && <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>}
            <button className="btn btn-teal" onClick={submit}
              disabled={busy || Object.keys(answers).length < QUIZ.length}>
              <Icon name="check" size={18} />Valider ma formation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

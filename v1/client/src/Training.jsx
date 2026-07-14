import { useState } from 'react';
import { api } from './api';
import { Icon } from './Icons.jsx';
import { t, useLang } from './i18n.js';

// Formation courte obligatoire avant le premier transport (PRD §5.4).
// Le voyageur est la dernière ligne de défense : on le responsabilise.
const SLIDES = [
  { icon: 'eye', k: 's1' },
  { icon: 'shield', k: 's2' },
  { icon: 'lock', k: 's3' },
];
const QUIZ = ['q1', 'q2', 'q3'];

export default function Training({ onDone, onClose }) {
  useLang();
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
          <b>{t('train.title')}</b>
          <span className="pill pill-saffron" style={{ marginInlineStart: 'auto' }}>{t('train.badge')}</span>
        </div>

        <div className="step-dots" style={{ margin: '4px 0 14px' }}>
          {[0, 1, 2, 3].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}
        </div>

        {step < 3 && (
          <div className="training-slide">
            <div className="training-icon"><Icon name={SLIDES[step].icon} size={30} /></div>
            <h3>{t(`train.${SLIDES[step].k}.t`)}</h3>
            <p>{t(`train.${SLIDES[step].k}.b`)}</p>
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              {step < 2 ? t('common.continue') : t('train.toquiz')}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="training-quiz">
            {QUIZ.map((qid) => (
              <div key={qid} className="quiz-item">
                <p className="quiz-q">{t(`train.${qid}`)}</p>
                {['a', 'b', 'c'].map((key) => (
                  <label key={key} className={`quiz-option ${answers[qid] === key ? 'selected' : ''}`}>
                    <input type="radio" name={qid} checked={answers[qid] === key}
                      onChange={() => setAnswers({ ...answers, [qid]: key })} />
                    {t(`train.${qid}.${key}`)}
                  </label>
                ))}
              </div>
            ))}
            {error && <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>}
            <button className="btn btn-teal" onClick={submit}
              disabled={busy || Object.keys(answers).length < QUIZ.length}>
              <Icon name="check" size={18} />{t('train.submit')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

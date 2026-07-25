import { Router } from 'express';
import { invalidTrainingAnswers } from '../validators/training.js';

export function createTrainingRouter({
  auth,
  save,
  validateAnswers = invalidTrainingAnswers,
}) {
  const router = Router();

  router.post('/complete', auth, (req, res) => {
    const answers = req.body.answers || {};
    const wrong = validateAnswers(answers);
    if (wrong.length > 0) {
      return res.status(400).json({
        error: 'Certaines réponses sont incorrectes — relisez les règles.',
        wrong,
      });
    }
    req.user.trainingDone = true;
    save();
    return res.json({ ok: true });
  });

  return router;
}

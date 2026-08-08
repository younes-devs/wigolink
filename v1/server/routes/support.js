import { Router } from 'express';

const SUBJECT_MIN_LENGTH = 4;
const SUBJECT_MAX_LENGTH = 120;
const MESSAGE_MIN_LENGTH = 20;
const MESSAGE_MAX_LENGTH = 5000;

function cleanSubject(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanMessage(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim();
}

export function createSupportRouter({ auth, rateLimit, sendEmail, audit, newId }) {
  const router = Router();

  router.post('/support', auth, async (req, res) => {
    const subject = cleanSubject(req.body?.subject);
    const message = cleanMessage(req.body?.message);
    if (subject.length < SUBJECT_MIN_LENGTH || subject.length > SUBJECT_MAX_LENGTH) {
      return res.status(400).json({ code: 'invalid_subject', error: 'Le sujet doit contenir entre 4 et 120 caracteres.' });
    }
    if (message.length < MESSAGE_MIN_LENGTH || message.length > MESSAGE_MAX_LENGTH) {
      return res.status(400).json({ code: 'invalid_message', error: 'Le message doit contenir entre 20 et 5000 caracteres.' });
    }
    if (await rateLimit(`support:${req.user.id}`)) {
      return res.status(429).json({ code: 'rate_limited', error: 'Trop de demandes. Reessayez dans quelques minutes.' });
    }

    const ticketId = newId('sup');
    try {
      await sendEmail({
        ticketId,
        user: req.user,
        subject,
        message,
        lang: req.lang || 'fr',
      });
      await audit(req.user.id, 'support.request.create', 'support_request', ticketId, {
        subject,
        subjectUserId: req.user.id,
      });
      return res.status(201).json({ ok: true, ticketId });
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'support_email_failed',
        ticketId,
        userId: req.user.id,
        message: error?.message || 'unknown',
      }));
      return res.status(502).json({ code: 'support_unavailable', error: 'Le support est temporairement indisponible. Reessayez plus tard.' });
    }
  });

  return router;
}

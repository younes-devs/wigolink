import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document = { documentElement: { lang: 'fr' } };

const utilsPromise = import('../../client/src/features/admin/components/adminPanelUtils.js');
const i18nPromise = import('../../client/src/i18n.js');

test('admin UI traduit les actions administratives connues et masque les inconnues', async () => {
  const [{ auditAction }, { loadAdminTranslations }] = await Promise.all([
    utilsPromise,
    i18nPromise,
  ]);
  await loadAdminTranslations();
  assert.equal(auditAction('manual_payout_queue_viewed'), 'File de versements consultée');
  assert.equal(auditAction('admin.member_case.view'), 'Dossier membre consulté');
  assert.equal(auditAction('action.inconnue'), 'Événement administratif');
});

test('admin UI interprete les timestamps numeriques en texte comme des millisecondes', async () => {
  const { formatAdminDate } = await utilsPromise;
  const formatted = formatAdminDate('1786613280000');
  assert.doesNotMatch(formatted, /58509/);
  assert.match(formatted, /2026/);
});

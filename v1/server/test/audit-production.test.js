import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAuditReport, parseAuditReport } from '../../scripts/audit-production.mjs';

const RSC_ADVISORY = {
  severity: 'high',
  title: 'React Router RSC CSRF',
  url: 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
};

test('audit production accepte uniquement l avis RSC hors mode serveur', () => {
  const result = classifyAuditReport({
    vulnerabilities: {
      'react-router': { via: [RSC_ADVISORY] },
      'react-router-dom': { via: ['react-router'] },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.accepted.length, 1);
});

test('audit production bloque une nouvelle alerte et l avis RSC si le mode serveur apparait', () => {
  const report = {
    vulnerabilities: {
      'react-router': { via: [RSC_ADVISORY, {
        severity: 'high',
        title: 'Nouvelle faille',
        url: 'https://github.com/advisories/GHSA-new',
      }] },
    },
  };
  assert.equal(classifyAuditReport(report).blocked.length, 1);
  assert.equal(classifyAuditReport(report, { rscModeUsed: true }).blocked.length, 2);
});

test('audit production refuse un rapport absent ou tronque', () => {
  assert.throws(() => parseAuditReport(''), /rapport JSON valide/i);
  assert.throws(
    () => parseAuditReport(JSON.stringify({ vulnerabilities: {} })),
    /rapport npm audit incomplet/i
  );
});

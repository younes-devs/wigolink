import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ACCEPTED_ADVISORIES = new Set([
  'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
]);

export function classifyAuditReport(report, { rscModeUsed = false } = {}) {
  const blocked = [];
  const accepted = [];
  const vulnerabilities = report?.vulnerabilities || {};

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    const advisories = (vulnerability.via || []).filter((item) => typeof item === 'object');
    if (!advisories.length && name === 'react-router-dom' && vulnerabilities['react-router']) {
      continue;
    }
    for (const advisory of advisories) {
      const item = {
        package: name,
        severity: advisory.severity || vulnerability.severity,
        title: advisory.title,
        url: advisory.url,
      };
      if (!rscModeUsed && ACCEPTED_ADVISORIES.has(advisory.url)) accepted.push(item);
      else blocked.push(item);
    }
  }

  return { ok: blocked.length === 0, blocked, accepted };
}

export function parseAuditReport(output) {
  let report;
  try {
    report = JSON.parse(String(output || ''));
  } catch {
    throw new Error('npm audit n a pas renvoye un rapport JSON valide.');
  }
  if (!report || typeof report.vulnerabilities !== 'object' || !report.metadata) {
    throw new Error('Rapport npm audit incomplet.');
  }
  return report;
}

function usesReactRouterServerMode(root) {
  const serverRoot = path.join(root, 'server');
  const needles = [
    'createRequestHandler',
    'ServerRouter',
    'react-router/framework',
    'react-router/dev',
    'react-server-dom',
  ];
  return walk(serverRoot).some((file) => {
    if (!/\.(js|jsx|mjs|cjs)$/.test(file)) return false;
    const source = fs.readFileSync(file, 'utf8');
    return needles.some((needle) => source.includes(needle));
  });
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : target;
  });
}

function main() {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = isWindows
    ? ['/d', '/s', '/c', 'npm audit --omit=dev --json']
    : ['audit', '--omit=dev', '--json'];
  const audit = spawnSync(command, args, {
    cwd: path.resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (audit.error) {
    console.error(JSON.stringify({ ok: false, error: audit.error.message }));
    process.exitCode = 1;
    return;
  }
  let report;
  try {
    report = parseAuditReport(audit.stdout);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
    return;
  }
  const result = classifyAuditReport(report, {
    rscModeUsed: usesReactRouterServerMode(path.resolve(import.meta.dirname, '..')),
  });
  console.log(JSON.stringify({
    ok: result.ok,
    blocked: result.blocked,
    accepted: result.accepted.map((item) => ({
      ...item,
      reason: 'Wigolink utilise BrowserRouter en SPA et aucune action serveur/RSC React Router.',
    })),
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();

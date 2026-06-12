// Soundcheck — The Stage: cast + scripted live content.
// Players are placed left→right in the concert-hall arc. The Bandleader sits
// centre, highest (the concertmaster). Streams and findings are realistic, not lorem.

window.SET = {
  id: 'set 04',
  repo: 'acme/ledger-core',
  files: 1284,
  frameworks: ['SOC 2', 'PCI DSS'],
  domain: 'fintech · payments',
};

// arc order (index 0 left → 5 right). Bandleader at index 2 = highest seat.
window.PLAYERS = [
  {
    id: 'scout', name: 'Scout', handle: '@acme/scout', inst: 'scout',
    role: 'reconnaissance', model: 'claude · sonnet',
    stream: [
      ['read', 'package.json + lockfiles'],
      ['note', 'stack: node 20 · typescript · postgres'],
      ['note', 'domain → fintech (payments)'],
      ['note', 'data sensitivity: elevated · PII + PAN'],
      ['emit', 'frameworks: SOC 2, PCI DSS'],
      ['handoff', 'context → Bandleader'],
    ],
  },
  {
    id: 'scanner', name: 'Code Scanner', handle: '@acme/code-scanner', inst: 'scanner',
    role: 'static analysis', model: 'claude · sonnet',
    stream: [
      ['grep', '"AWS_SECRET|api_key" — 3 hits'],
      ['read', 'auth/session.ts:120–160'],
      ['ast', 'hard-coded credential at :142'],
      ['audit', 'npm audit — 7 advisories'],
      ['note', 'lodash@4.17.19 · prototype pollution'],
      ['note', 'tls.ts:31 · weak cipher permitted'],
    ],
  },
  {
    id: 'bandleader', name: 'Bandleader', handle: '@acme/bandleader', inst: 'bandleader',
    role: 'orchestrator', model: 'claude · opus',
    stream: [
      ['set', 'ledger-core · 1,284 files'],
      ['plan', 'lanes: auth · secrets · deps'],
      ['assign', 'Code Scanner → auth/*'],
      ['assign', 'Compliance Mapper → CC6.x'],
      ['note', 'Fixer on standby · safe repairs only'],
    ],
  },
  {
    id: 'mapper', name: 'Compliance Mapper', handle: '@acme/compliance-mapper', inst: 'mapper',
    role: 'control mapping', model: 'claude · sonnet',
    stream: [
      ['map', 'secret → SOC 2 CC6.1'],
      ['map', 'lodash CVE → CC7.1'],
      ['map', 'weak TLS → PCI DSS 4.1'],
      ['check', 'evidence chain intact'],
      ['emit', 'fix-confidence: low risk'],
    ],
  },
  {
    id: 'fixer', name: 'Fixer', handle: '@acme/fixer', inst: 'fixer',
    role: 'remediation', model: 'claude · opus',
    stream: [
      ['patch', 'move secret → env + vault ref'],
      ['rotate', 'exposed key ········ (redacted)'],
      ['bump', 'lodash → 4.17.21'],
      ['test', '142 passing · 0 failing'],
      ['handoff', 'diff → Reviewer'],
    ],
  },
  {
    id: 'reviewer', name: 'Reviewer', handle: '@acme/reviewer', inst: 'reviewer',
    role: 'verification', model: 'claude · opus',
    stream: [
      ['review', 'patch auth/session.ts'],
      ['diff', 'no behavior change detected'],
      ['verify', 'secret absent from source'],
      ['verdict', 'safe to ship'],
      ['route', '→ Conductor for approval'],
    ],
  },
];

// Findings land on the Score over the course of the set.
window.FINDINGS = [
  { id: 'f1', sev: 'critical', title: 'Hard-coded AWS secret in source',
    evidence: 'auth/session.ts:142', control: 'SOC 2 CC6.1', by: 'code-scanner',
    confidence: 0.94, redacted: true },
  { id: 'f2', sev: 'attention', title: 'Vulnerable dependency: lodash',
    evidence: 'package.json · lodash@4.17.19', control: 'SOC 2 CC7.1', by: 'code-scanner',
    confidence: 0.88 },
  { id: 'f3', sev: 'critical', title: 'Weak TLS cipher suite permitted',
    evidence: 'server/tls.ts:31', control: 'PCI DSS 4.1', by: 'code-scanner',
    confidence: 0.77 },
  { id: 'f4', sev: 'attention', title: 'Verbose errors leak stack traces',
    evidence: 'api/errors.ts:58', control: 'SOC 2 CC6.7', by: 'compliance-mapper',
    confidence: 0.82 },
  { id: 'f5', sev: 'info', title: 'No rate limit on /login',
    evidence: 'routes/auth.ts:12', control: 'SOC 2 CC6.6', by: 'code-scanner',
    confidence: 0.71 },
  { id: 'f6', sev: 'attention', title: 'Secrets in CI logs (debug mode)',
    evidence: '.github/workflows/ci.yml:44', control: 'SOC 2 CC7.2', by: 'compliance-mapper',
    confidence: 0.79 },
];

// Logical handoff threads (source player → target player), cycled during the set.
window.HANDOFFS = [
  ['scout', 'bandleader'],
  ['bandleader', 'scanner'],
  ['scanner', 'mapper'],
  ['mapper', 'fixer'],
  ['fixer', 'reviewer'],
];

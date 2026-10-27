// Everyday prompts must not be flagged, and real leaks still must be.
// Runs against BOTH detectors: detectors.js (the website) and extension/detectors.js (the extension).
// Run from the repo root:  node --test tests/false-flags.test.js
// Secret-looking values are built from pieces (see AGENTS.md).
const test = require('node:test');
const assert = require('node:assert');

const ENGINES = { website: require('../detectors.js'), extension: require('../extension/detectors.js') };
const FAKE_KEY = 'AKIA' + 'IOSFODNN7EXAMPLE';

// Harmless prompts. Each one was flagged by an older version of a rule.
const HARMLESS = [
  ['a password that is not working', 'My password is not working on the school portal, what should I try?'],
  ['a lowercase "confidential" in a sentence', 'The meeting is confidential so please keep the notes short.'],
  ['the words restricted and proprietary in sentences', 'The lecture notes are restricted to students. Please proofread: The proprietary algorithm is elegant.'],
  ['one line of code in a question', 'Why does my React component re-render? useEffect(() => { setCount(count + 1); }, [count]);'],
  ['"billing about" is not an invoice number', 'I got an email from billing about my account, is it a scam?'],
  ['Monday agenda and liability', 'Our Monday agenda covers liability insurance and the onboarding plan.'],
  ['a plain question', 'Can you explain how AWS IAM roles work?'],
  ['a study plan', 'Give me a study plan for my finance midterm on Monday.'],
  ['a hash and a file path', 'Explain this commit hash 9fceb02d0ae598e95dc970b74767f19372d61af6 and where C:\\Users\\sam\\notes_final_version_3.docx went.']
];

// Real leaks. These must still be caught.
const REAL = [
  ['an AWS key', 'deploy with ' + FAKE_KEY, 'aws-access-key'],
  ['a real invoice number', 'Invoice #INV-20481 is overdue', 'invoice-reference'],
  ['an invoice number with a colon', 'invoice number: 88231', 'invoice-reference'],
  ['a password in plain words', 'my password is hunter2', 'credential-named'],
  ['a block of code', 'const a = 1;\nconst b = 2;\nfunction f() {\n  if (a) { console.log(b); }\n}\nexport default f;', 'proprietary-source'],
  ['contract language', 'This NDA is governed by the governing law of Delaware and includes indemnification.', 'contract-language']
];

for (const [engineName, D] of Object.entries(ENGINES)) {
  const ids = (text) => D.scan(text).findings.map((f) => f.ruleId);

  for (const [name, text] of HARMLESS) {
    test(`${engineName}: no flag for ${name}`, () => assert.deepStrictEqual(ids(text), []));
  }
  for (const [name, text, rule] of REAL) {
    test(`${engineName}: still catches ${name}`, () => assert.ok(ids(text).includes(rule), `${rule} not in [${ids(text)}]`));
  }
}

// The extension also watches for confidentiality labels. These must still be caught there,
// while the bare word is left alone (tested above).
test('extension: confidentiality labels are still flagged', () => {
  const D = ENGINES.extension;
  for (const text of ['CONFIDENTIAL: Q3 board deck, do not forward.', 'Confidential - internal use only. Draft pricing below.', 'Summarise this. Internal use only: salary bands.']) {
    assert.ok(D.scan(text).findings.some((f) => f.ruleId === 'sensitive-context'), text);
  }
});

test('extension: financial figures are tentative, so a policy can never block them', () => {
  const finding = ENGINES.extension.scan('Our revenue was $4.2M last year.').findings.find((f) => f.ruleId === 'financial-figures');
  assert.ok(finding && finding.tentative);
});

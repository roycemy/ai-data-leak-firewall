/* Dato — Authorized Synthetic Assessment
 * A guided, defensive demo: it generates obviously fake sensitive data for a
 * fictional company and measures what Dato catches before it would reach an
 * AI tool. No real company, person, credential, or network is involved.
 */
(function () {
  'use strict';

  var FAKE = {
    company: 'Northstar Robotics (fictional)',
    awsKey: 'AKIAIOSFODNN7EXAMPLE',               // AWS's own documented example key
    ghToken: 'ghp_EXAMPLE7xKq9mZwR2vT5nB8cL4dF6gH1jK3s',
    card: '4111 1111 1111 1111',                  // industry-standard test card
    ssn: '078-05-1120',                           // historical example SSN used in documentation
    iban: 'GB29 NWBK 6016 1331 9268 19'           // documented example IBAN
  };

  var scenarios = [
    {
      id: 'support',
      title: 'Customer support reply',
      actor: 'Support agent',
      task: 'Drafts a reply using the CRM export',
      prompt:
        'Write a friendly refund reply for this customer:\n\n' +
        'Name: Dana Whitfield\nEmail: dana.whitfield@example.com\nPhone: (415) 555-0132\n' +
        'Address: 4250 Mission Street, San Francisco\nSSN (verification): ' + FAKE.ssn + '\n' +
        'Card on file: ' + FAKE.card + '\nOrder total: $1,240.00',
      lesson: 'PII and payment data in a single paste. An unprotected AI tool would receive a full customer identity record.'
    },
    {
      id: 'engineer',
      title: 'Debugging a deploy script',
      actor: 'Software engineer',
      task: 'Asks an AI to debug a failing deploy',
      prompt:
        'Why does this deploy script fail on the last line?\n\n' +
        '#!/bin/bash\nexport AWS_ACCESS_KEY_ID=' + FAKE.awsKey + '\n' +
        'export GITHUB_TOKEN=' + FAKE.ghToken + '\n' +
        'DB_URL="postgres://deploy:Sup3rSecretPass@db.northstar.internal:5432/prod"\n' +
        'aws s3 sync ./dist s3://northstar-prod && curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/northstar/deployments',
      lesson: 'Live-looking credentials inside code are the most damaging leak: one paste hands over production access.'
    },
    {
      id: 'legal',
      title: 'Summarizing a vendor contract',
      actor: 'Legal counsel',
      task: 'Asks an AI to summarize contract terms',
      prompt:
        'Summarize the liability terms in this agreement:\n\n' +
        'This Non-Disclosure Agreement is entered into by and between the party of the first part, Northstar Robotics, and the party of the second part. ' +
        'The Receiving Party shall indemnify and hold harmless the Disclosing Party. Confidentiality obligations survive termination. ' +
        'This agreement shall be governed by the governing law of the State of Delaware, with binding arbitration in Wilmington. ' +
        'In witness whereof, the parties have executed this agreement.',
      lesson: 'Contract language shared with an AI provider may leave your counsel\'s control and create confidentiality obligations of its own.'
    },
    {
      id: 'finance',
      title: 'Forecast from the payroll sheet',
      actor: 'Finance analyst',
      task: 'Asks an AI to model next quarter',
      prompt:
        'Build a Q3 forecast from these numbers:\n\n' +
        'Revenue: $4,250,000 ARR\nGross margin target: $2,975,000\nPayroll: $310,000 monthly\n' +
        'Burn rate: $410,000\nRunway: 14 months\nOperating account IBAN: ' + FAKE.iban + '\n' +
        'Routing number: 021000021, account 883420155',
      lesson: 'Financials plus banking details are a ready-made fraud kit and a disclosure risk before any fundraise or audit.'
    }
  ];

  var state = { step: -1, results: [] };

  function el(id) { return document.getElementById(id); }

  function renderIntro() {
    el('assessment-stage').innerHTML =
      '<div class="assess-card">' +
      '<div class="assess-kicker">Authorized demo · synthetic data only</div>' +
      '<h3>AI data-leak assessment</h3>' +
      '<p>This simulation shows what happens when employees at <b>' + FAKE.company + '</b> paste everyday work into an AI assistant, ' +
      'first without protection and then behind Dato. Every secret, person, and number is fabricated for this demo. Nothing is sent anywhere — every scan runs locally in this browser.</p>' +
      '<ul class="assess-list">' +
      '<li>4 realistic workplace scenarios</li>' +
      '<li>Clearly fake credentials and identities</li>' +
      '<li>A risk report you can export for a security review</li>' +
      '</ul>' +
      '<button class="btn btn-primary" id="assess-start">Start the assessment</button>' +
      '</div>';
    el('assess-start').addEventListener('click', function () { state.step = 0; state.results = []; renderScenario(); });
    setProgress(0);
  }

  function renderScenario() {
    var s = scenarios[state.step];
    var res = window.DatoApp.scanText(s.prompt);
    state.results.push({ id: s.id, title: s.title, findings: res.findings.length, action: res.action, byCategory: countByCat(res.findings) });
    window.DatoApp.logEvent('assessment:' + s.id, res.findings, res.action);

    var unprotected = res.findings.length;
    var html = '<div class="assess-card">' +
      '<div class="assess-kicker">Scenario ' + (state.step + 1) + ' of ' + scenarios.length + ' · ' + s.actor + '</div>' +
      '<h3>' + s.title + '</h3>' +
      '<p class="assess-task">' + s.task + '</p>' +
      '<div class="compare">' +
      '  <div class="compare-col compare-danger"><div class="compare-head">Without Dato</div>' +
      '    <div class="compare-big">' + unprotected + '</div><div class="compare-sub">confidential item' + (unprotected === 1 ? '' : 's') + ' would reach the AI provider</div></div>' +
      '  <div class="compare-col compare-safe"><div class="compare-head">With Dato</div>' +
      '    <div class="compare-big">0</div><div class="compare-sub">leave the device — action: <b>' + res.action.toUpperCase() + '</b></div></div>' +
      '</div>' +
      '<div class="prompt-preview"><div class="prompt-preview-head">The prompt the employee tried to send (synthetic)</div><pre>' + escapeHTML(s.prompt) + '</pre></div>' +
      '<div class="findings">' + renderFindings(res.findings) + '</div>' +
      '<p class="assess-lesson">💡 ' + s.lesson + '</p>' +
      '<div class="assess-actions"><button class="btn btn-primary" id="assess-next">' +
      (state.step + 1 < scenarios.length ? 'Next scenario' : 'See the risk report') + '</button></div>' +
      '</div>';
    el('assessment-stage').innerHTML = html;
    el('assess-next').addEventListener('click', function () {
      state.step++;
      if (state.step < scenarios.length) { renderScenario(); setProgress(state.step / scenarios.length * 100); }
      else { renderReport(); setProgress(100); }
    });
    setProgress(state.step / scenarios.length * 100);
  }

  function renderReport() {
    var totals = {};
    Object.keys(window.DatoDetect.CATEGORIES).forEach(function (c) { totals[c] = 0; });
    var totalFindings = 0;
    state.results.forEach(function (r) {
      totalFindings += r.findings;
      Object.keys(totals).forEach(function (c) { totals[c] += r.byCategory[c] || 0; });
    });
    var rows = state.results.map(function (r) {
      return '<tr><td>' + r.title + '</td><td>' + r.findings + '</td><td><span class="action-tag action-' + r.action + '">' + r.action.toUpperCase() + '</span></td></tr>';
    }).join('');
    var catLine = Object.keys(totals).filter(function (c) { return totals[c] > 0; }).map(function (c) {
      return '<span class="chip">' + window.DatoDetect.CATEGORIES[c].label + ': <b>' + totals[c] + '</b></span>';
    }).join(' ');
    el('assessment-stage').innerHTML =
      '<div class="assess-card">' +
      '<div class="assess-kicker">Assessment report · ' + FAKE.company + '</div>' +
      '<h3>' + totalFindings + ' confidential items stopped before reaching an AI tool</h3>' +
      '<p>Across ' + scenarios.length + ' everyday tasks, an unprotected workflow would have exposed <b>' + totalFindings +
      '</b> pieces of synthetic confidential data. Dato caught every one locally, before anything left the browser.</p>' +
      '<div class="chips">' + catLine + '</div>' +
      '<table class="log-table"><thead><tr><th>Scenario</th><th>Items caught</th><th>Policy action</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="recommendations"><div class="rec-head">Recommended rollout</div>' +
      '<ol>' +
      '<li>Turn on <b>Block</b> for secrets and payment data — these have no business case for reaching an AI provider.</li>' +
      '<li>Use <b>Redact</b> for PII and financial data so employees keep their AI workflows.</li>' +
      '<li>Review the audit log weekly and tighten policies where warnings repeat.</li>' +
      '<li>Run this assessment with 3–5 design-partner teams using their own synthetic data.</li>' +
      '</ol></div>' +
      '<div class="assess-actions">' +
      '<button class="btn btn-secondary" id="assess-export">Export report (JSON)</button>' +
      '<button class="btn btn-primary" id="assess-restart">Run again</button>' +
      '</div></div>';
    el('assess-export').addEventListener('click', function () {
      var report = {
        product: 'Dato — AI data-leak firewall',
        type: 'Authorized synthetic assessment',
        company: FAKE.company,
        generatedAt: new Date().toISOString(),
        totalFindingsStopped: totalFindings,
        byCategory: totals,
        scenarios: state.results,
        note: 'All data in this report is synthetic and was generated locally. No real person, company, credential, or network was involved.'
      };
      var blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dato-assessment-report.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    el('assess-restart').addEventListener('click', function () { state.step = -1; state.results = []; renderIntro(); });
  }

  function countByCat(findings) {
    var out = {};
    findings.forEach(function (f) { out[f.category] = (out[f.category] || 0) + 1; });
    return out;
  }

  function renderFindings(findings) {
    if (!findings.length) return '<div class="empty-state">No findings.</div>';
    var html = '';
    findings.forEach(function (f) {
      html += '<div class="finding sev-' + f.severity + '"><span class="sev">' + f.severity.toUpperCase() + '</span>' +
        '<span class="finding-label">' + f.label + '</span><code class="masked">' + escapeHTML(f.masked) + '</code></div>';
    });
    return html;
  }

  function setProgress(pct) {
    el('assess-progress-fill').style.width = pct + '%';
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.getElementById('nav-assessment').addEventListener('click', function () {
    if (state.step === -1) renderIntro();
  });
  renderIntro();
})();

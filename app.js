/* AI Firewall (formerly Dato) — console app
 * Everything runs locally. No prompt, file, or event ever leaves the browser.
 * The one exception is the optional breach check (breach-check.js), which sends
 * only the first 5 characters of a detected password's SHA-1 hash.
 */
(function () {
  'use strict';
  var D = window.DatoDetect;
  var B = window.DatoBreach;

  // ---------- State ----------
  var POLICY_KEY = 'dato.policies.v1';
  var EVENT_KEY = 'dato.events.v1';
  var DEFAULT_POLICIES = {
    secrets: 'block',
    pii: 'warn',
    financial: 'warn',
    source: 'warn',
    contract: 'warn'
  };
  var ACTION_LABEL = { allow: 'Allow', warn: 'Warn', redact: 'Redact', block: 'Block' };

  function loadJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  var policies = Object.assign({}, DEFAULT_POLICIES, loadJSON(POLICY_KEY, {}));
  var events = loadJSON(EVENT_KEY, []);

  function savePolicies() { localStorage.setItem(POLICY_KEY, JSON.stringify(policies)); }
  function saveEvents() {
    if (events.length > 250) events = events.slice(events.length - 250);
    localStorage.setItem(EVENT_KEY, JSON.stringify(events));
  }

  // ---------- Navigation ----------
  var views = ['install', 'firewall', 'policies', 'activity', 'dashboard', 'assessment'];
  function showView(name) {
    views.forEach(function (v) {
      document.getElementById('view-' + v).classList.toggle('active', v === name);
      document.getElementById('nav-' + v).classList.toggle('active', v === name);
      if (v === name) document.getElementById('nav-' + v).setAttribute('aria-current', 'page');
      else document.getElementById('nav-' + v).removeAttribute('aria-current');
    });
    if (name === 'activity') renderActivity();
    if (name === 'dashboard') renderDashboard();
    location.hash = name;
  }
  views.forEach(function (v) {
    document.getElementById('nav-' + v).addEventListener('click', function (e) { e.preventDefault(); showView(v); });
  });

  document.getElementById('skip-link').addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('main').focus();
  });

  // ---------- File intake ----------
  var attachedFiles = []; // {name, text}
  var fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInput.files || []);
    files.forEach(function (f) {
      if (f.size > 2 * 1024 * 1024) { showFormError(f.name + ' is too large (2 MB max) and was not attached.'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        attachedFiles.push({ name: f.name, text: String(reader.result || '') });
        addAttachmentChip(f.name, attachedFiles.length - 1);
        showFormError('');
        markStaleIfChanged();
      };
      reader.onerror = function () { showFormError(f.name + ' could not be read as text. Try a text-based file.'); };
      reader.readAsText(f);
    });
    fileInput.value = '';
  });
  function addAttachmentChip(name, idx, note) {
    var chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = '📎 ' + name + (note ? ' — ' + note : '');
    if (idx != null) {
      var x = document.createElement('button');
      x.className = 'chip-x'; x.textContent = '×'; x.title = 'Remove file'; x.setAttribute('aria-label', 'Remove ' + name);
      x.addEventListener('click', function () { attachedFiles[idx] = null; chip.remove(); markStaleIfChanged(); });
      chip.appendChild(x);
    }
    document.getElementById('attachments').appendChild(chip);
  }

  // ---------- Small display helpers (severity badge, icons) ----------
  // Severity is always colour + icon + word (DESIGN.md).
  var SEVERITY = {
    critical: { icon: '◆', word: 'Critical' },
    high: { icon: '▲', word: 'High' },
    medium: { icon: '●', word: 'Medium' },
    low: { icon: '○', word: 'Low' }
  };
  function sevBadge(sev) {
    var s = SEVERITY[sev] || SEVERITY.low;
    return '<span class="badge badge-' + sev + '"><span aria-hidden="true">' + s.icon + '</span>' + s.word + '</span>';
  }
  // Line icons (24×24, stroke) used in the verdict banner and empty states.
  var ICON_PATHS = {
    block: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/>',
    redact: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>',
    allow: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z"/>',
    chart: '<path d="M4 19h16M7 16v-5M12 16V7M17 16v-8"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'
  };
  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_PATHS[name] + '</svg>';
  }
  // An empty state: icon, short heading, one sentence.
  function emptyState(iconName, title, text) {
    return '<div class="empty"><span class="empty-icon">' + icon(iconName) + '</span>' +
      '<p class="empty-title">' + title + '</p><p class="empty-text">' + text + '</p></div>';
  }

  // ---------- Form feedback ----------
  var EMPTY_RESULT = emptyState('shield', 'Nothing inspected yet', 'Paste a prompt or attach a file, then press Inspect. Results appear here.');
  function showFormError(msg) {
    var box = document.getElementById('form-error');
    box.textContent = msg;
    box.hidden = !msg;
    document.getElementById('prompt-input').classList.toggle('invalid', !!msg);
  }
  document.getElementById('prompt-input').addEventListener('input', function () { showFormError(''); markStaleIfChanged(); });

  // ---------- Send is tied to the inspected text ----------
  // inspectedText: the exact text the last Inspect ran on, or null if nothing
  // current has been inspected. Read by the Send button; set by scanNow, cleared
  // when the prompt or files change, and by Clear.
  var inspectedText = null;

  // breachRunId: which inspection the latest breach check belongs to. Each new
  // Inspect, an edit and Clear add 1, so a slow answer for old text is ignored.
  var breachRunId = 0;

  // Prompt box plus attached files, joined the same way every time.
  function currentText() {
    var parts = [];
    var promptText = document.getElementById('prompt-input').value;
    if (promptText.trim()) parts.push(promptText);
    attachedFiles.forEach(function (f) { if (f) parts.push(f.text); });
    return parts.join('\n\n');
  }

  // Send needs a fresh inspection: disable it and say why.
  function requireInspection() {
    inspectedText = null;
    breachRunId++; // any breach check still running is for old text: ignore its answer
    clearBreachNote();
    var sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Inspect first to send';
    document.getElementById('result-actions').hidden = true; // Send appears after an Inspect
  }

  // Called when the prompt or files change after an inspection.
  function markStaleIfChanged() {
    if (inspectedText === null || currentText() === inspectedText) return;
    requireInspection();
    document.getElementById('scan-result').innerHTML =
      emptyState('shield', 'The prompt changed', 'You edited it after it was inspected. Press Inspect to check the new text before sending.');
  }

  // ---------- Scanning ----------
  function severityRank(s) { return { critical: 4, high: 3, medium: 2, low: 1 }[s] || 0; }

  function evaluate(findings) {
    // Decide the governing action: block > redact > warn > allow
    var rank = { allow: 0, warn: 1, redact: 2, block: 3 };
    var action = 'allow';
    findings.forEach(function (f) {
      var p = policies[f.category] || 'warn';
      if (rank[p] > rank[action]) action = p;
    });
    return action;
  }

  function logEvent(source, findings, action) {
    var byCat = {};
    Object.keys(D.CATEGORIES).forEach(function (c) { byCat[c] = 0; });
    findings.forEach(function (f) { byCat[f.category]++; });
    events.push({
      ts: Date.now(),
      source: source,
      action: action,
      total: findings.length,
      byCategory: byCat,
      topSeverity: findings.reduce(function (m, f) { return severityRank(f.severity) > severityRank(m) ? f.severity : m; }, 'low')
    });
    saveEvents();
    return events[events.length - 1]; // the breach check adds its counts to this event
  }

  function scanNow(sourceOverride) {
    var promptText = document.getElementById('prompt-input').value;
    var parts = [];
    if (promptText.trim()) parts.push({ name: 'prompt', text: promptText });
    attachedFiles.forEach(function (f) { if (f) parts.push(f); });
    var resultBox = document.getElementById('scan-result');
    if (!parts.length) {
      resultBox.innerHTML = EMPTY_RESULT;
      showFormError('Nothing to inspect yet. Paste a prompt or attach a file first.');
      requireInspection();
      document.getElementById('prompt-input').focus();
      return null;
    }
    showFormError('');
    var combined = parts.map(function (p) { return p.text; }).join('\n\n');
    inspectedText = combined; // Send is allowed only while the text still equals this
    var scan = D.scan(combined);
    var findings = scan.findings;
    var action = evaluate(findings);
    var source = sourceOverride || parts.map(function (p) { return p.name; }).join(', ');
    var event = logEvent(source, findings, findings.length ? action : 'allowed-clean');
    renderScanResult(promptText, combined, findings, action);
    runBreachCheck(combined, findings, event); // async; only if the box is ticked
    return { findings: findings, action: action, combined: combined };
  }

  // Verdict copy for each governing action: title, one-line explanation, Send button text.
  var VERDICT = {
    block: { title: 'Blocked by policy', sub: 'Remove the flagged items, or ask an admin to change the policy.', send: 'Blocked by policy' },
    redact: { title: 'Redact before sending', sub: 'AI Firewall removed the flagged data. Send the redacted version below instead.', send: 'Send redacted version (simulated)' },
    warn: { title: 'Review before sending', sub: 'Make sure you mean to share the items below.', send: 'I understand, send anyway (simulated)' },
    allow: { title: 'Allowed by policy', sub: 'The findings below were logged for audit.', send: 'Send to AI (simulated)' },
    clean: { title: 'Clear to send', sub: 'No confidential data found. The check ran on this device.', send: 'Send to AI (simulated)' }
  };
  var VERDICT_ICON = { block: 'block', redact: 'redact', warn: 'warn', allow: 'allow', clean: 'allow' };

  function renderScanResult(promptText, combined, findings, action) {
    var resultBox = document.getElementById('scan-result');
    var sendBtn = document.getElementById('send-btn');
    var key = findings.length ? action : 'clean';
    var v = VERDICT[key];

    // 1. One verdict banner. For block, redact and warn it names the data
    //    classes whose policy decided it, e.g. "Secrets & Credentials: Block."
    var deciding = Object.keys(D.CATEGORIES).filter(function (c) {
      return policies[c] === action && findings.some(function (f) { return f.category === c; });
    }).map(function (c) { return D.CATEGORIES[c].label; });
    var because = (key === 'block' || key === 'redact' || key === 'warn') && deciding.length
      ? deciding.join(', ') + ': ' + ACTION_LABEL[action] + '. ' : '';
    var html = '<div class="verdict verdict-' + key + '">' + icon(VERDICT_ICON[key]) +
      '<div><p class="verdict-title">' + v.title + '</p><p class="verdict-sub">' + because + v.sub + '</p></div></div>';

    // 2. One row per finding, most severe first. Each row keeps its index in
    //    `findings` as id="finding-N" so the breach check can update that row.
    if (findings.length) {
      var order = findings.map(function (f, i) { return i; }).sort(function (a, b) {
        return severityRank(findings[b].severity) - severityRank(findings[a].severity);
      });
      html += '<p class="caption findings-caption">' + plural(findings.length, 'finding') + '</p><ul class="finding-list">';
      order.forEach(function (i) {
        var f = findings[i];
        html += '<li class="finding" id="finding-' + i + '">' + sevBadge(f.severity) +
          '<div class="finding-main"><p class="finding-label">' + f.label + '</p>' +
          '<p class="finding-meta">' + D.CATEGORIES[f.category].label + ' · <code class="masked">' + escapeHTML(f.masked) + '</code></p></div></li>';
      });
      html += '</ul>';
    }

    // 3. The redacted copy, only when the policy says Redact.
    if (key === 'redact') {
      html += '<div class="redacted-box"><div class="redacted-head"><span class="caption">Redacted version</span>' +
        '<button class="btn btn-quiet" id="copy-redacted">Copy</button></div>' +
        '<pre class="redacted-text">' + escapeHTML(D.redact(combined, findings)) + '</pre></div>';
    }
    resultBox.innerHTML = html;
    var copyBtn = document.getElementById('copy-redacted');
    if (copyBtn) {
      var redactedText = D.redact(combined, findings);
      copyBtn.addEventListener('click', function () {
        navigator.clipboard && navigator.clipboard.writeText(redactedText);
        copyBtn.textContent = 'Copied ✓';
      });
    }

    // 4. The Send button matches the verdict (Block keeps it disabled).
    document.getElementById('result-actions').hidden = false;
    sendBtn.textContent = v.send;
    sendBtn.disabled = key === 'block';
    sendBtn.dataset.mode = key === 'redact' ? 'redacted' : 'send';
    if (key === 'redact') sendBtn.dataset.payload = D.redact(combined, findings);
  }

  // ---------- Breach check (Mini Project 3) ----------
  var breachBox = document.getElementById('breach-check');
  // Unticking the box removes the breach lines and summary, including a
  // "Checking…" that would otherwise stay on screen (its answer is ignored).
  breachBox.addEventListener('change', function () {
    if (!breachBox.checked) clearBreachNote();
  });

  // The one-line summary under the findings. It is also what screen readers
  // announce (#breach-status is role="status"). kind: muted | loading | error | bad | good
  function showBreachNote(kind, html) {
    document.getElementById('breach-status').innerHTML =
      '<p id="breach-note" class="breach-note breach-' + kind + '"' +
      (kind === 'loading' ? ' aria-busy="true"' : '') + '>' + html + '</p>';
  }
  function clearBreachNote() {
    document.getElementById('breach-status').innerHTML = '';
    document.querySelectorAll('.finding-breach').forEach(function (line) { line.remove(); });
  }

  // Put the breach result inside one password's finding row, in place (no
  // redraw, so screen readers do not read the verdict again). kind: loading | bad | good | error
  function setRowBreach(findingIndex, kind, html) {
    var row = document.getElementById('finding-' + findingIndex);
    if (!row) return;
    var line = row.querySelector('.finding-breach');
    if (!line) {
      line = document.createElement('p');
      row.querySelector('.finding-main').appendChild(line);
    }
    line.className = 'finding-breach breach-' + kind;
    line.innerHTML = html;
    if (kind === 'bad') row.querySelector('.badge').outerHTML = sevBadge('critical'); // raised to Critical
  }

  // Every breach summary says what left the browser (the card's badge says "On this device").
  var SENT_NOTE = '<span class="muted"> Sent: a 5-character hash prefix only.</span>';

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  // Reads: breachBox, breachRunId. Changes: the findings' severity, the event's
  // counts (breachRan, breachChecked, breached, breachError) and the result card.
  async function runBreachCheck(combined, findings, event) {
    var myRun = ++breachRunId;
    clearBreachNote();                                    // drop the note from the last Inspect
    if (!breachBox.checked) return;                       // off by default: no network call

    var found = B.passwordsFrom(combined, findings);
    if (!found.length) {
      event.breachRan = true; event.breachChecked = 0; saveEvents(); // log: "no password", not "off"
      showBreachNote('muted', 'Breach check: no passwords found, so nothing was sent to Have I Been Pwned.');
      return;
    }
    found.forEach(function (p) { setRowBreach(p.findingIndex, 'loading', 'Checking known breaches…'); });
    showBreachNote('loading', 'Checking ' + plural(found.length, 'password') + ' against known breaches…');

    var outcome = await B.checkAll(found);                // every fetch is inside try/catch there
    // Ignore the answer if the text changed or the box was unticked while we waited.
    if (myRun !== breachRunId || !breachBox.checked) return;

    if (outcome.error) {
      event.breachError = true; saveEvents();
      found.forEach(function (p) { setRowBreach(p.findingIndex, 'error', '▲ Breach check unavailable'); });
      showBreachNote('error', '⚠ <b>Breach check unavailable:</b> ' + escapeHTML(outcome.error) +
        '. The local scan above still applies.' +
        '<span class="muted"> Sent at most: a 5-character hash prefix.</span>');
      return;
    }

    // Worked-out result: a password seen in breaches becomes a critical finding,
    // and its row on screen says how many times it was seen.
    outcome.results.forEach(function (r) {
      if (r.count > 0) {
        findings[r.findingIndex].severity = 'critical';
        setRowBreach(r.findingIndex, 'bad', '<span class="badge badge-solid-critical">Found in breaches</span>' +
          '<span>Seen <b class="num">' + r.count.toLocaleString() + '</b> times. Change this password everywhere it is used.</span>');
      } else {
        setRowBreach(r.findingIndex, 'good', '✓ Not found in known breaches');
      }
    });
    // Save counts only: never the password, the hash or the prefix.
    event.breachChecked = outcome.checked;
    event.breached = outcome.breached;
    if (outcome.breached) event.topSeverity = 'critical';
    saveEvents();

    if (outcome.breached) {
      showBreachNote('bad', '<b>' + outcome.breached + ' of ' + plural(outcome.checked, 'password') +
        ' found in known breaches.</b>' + SENT_NOTE);
    } else {
      showBreachNote('good', '✓ <b>Not found in known breaches</b> (' + plural(outcome.checked, 'password') +
        ' checked). That does not make it safe to paste into an AI tool.' + SENT_NOTE);
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.getElementById('scan-btn').addEventListener('click', function () { scanNow(); });
  document.getElementById('send-btn').addEventListener('click', function () {
    var btn = this;
    if (btn.disabled) return;
    // The button is disabled when the text is stale, but check the rule itself too.
    if (inspectedText === null || currentText() !== inspectedText) {
      requireInspection();
      showFormError('The prompt changed since it was inspected. Inspect it again before sending.');
      return;
    }
    btn.textContent = '✓ Sent (simulated). Nothing left this device';
    logEvent('simulated-send', [], 'sent-' + (btn.dataset.mode || 'send'));
    setTimeout(function () { scanNow(); }, 1600);
  });
  function clearConsole() {
    document.getElementById('prompt-input').value = '';
    attachedFiles = [];
    document.getElementById('attachments').innerHTML = '';
    document.getElementById('scan-result').innerHTML = EMPTY_RESULT;
    showFormError('');
    requireInspection();
    document.getElementById('send-btn').dataset.mode = 'send';
  }
  document.getElementById('clear-btn').addEventListener('click', clearConsole);
  // Keyboard: Ctrl/Cmd + Enter inspects, from anywhere in the prompt box
  document.getElementById('prompt-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); scanNow(); }
  });

  // ---------- Policies ----------
  function renderPolicies() {
    var wrap = document.getElementById('policy-list');
    wrap.innerHTML = '';
    Object.keys(D.CATEGORIES).forEach(function (cat) {
      var row = document.createElement('div');
      row.className = 'policy-row';
      row.innerHTML = '<div class="policy-info"><span class="cat-dot cat-' + cat + '"></span>' +
        '<div><div class="policy-name">' + D.CATEGORIES[cat].label + '</div>' +
        '<div class="policy-desc">' + policyDescription(cat) + '</div></div></div>';
      var seg = document.createElement('div');
      seg.className = 'segmented';
      ['allow', 'warn', 'redact', 'block'].forEach(function (a) {
        var b = document.createElement('button');
        b.className = 'seg-btn' + (policies[cat] === a ? ' active seg-' + a : '');
        b.textContent = ACTION_LABEL[a];
        b.setAttribute('aria-pressed', String(policies[cat] === a));
        b.addEventListener('click', function () {
          policies[cat] = a; savePolicies(); renderPolicies();
          logEvent('policy-change', [], 'policy:' + cat + '=' + a);
        });
        seg.appendChild(b);
      });
      row.appendChild(seg);
      wrap.appendChild(row);
    });
  }
  function policyDescription(cat) {
    return {
      secrets: 'API keys, tokens, private keys, passwords, connection strings',
      pii: 'SSNs, card numbers, emails, phones, addresses, IDs',
      financial: 'Bank details, revenue, payroll, invoices, IBANs',
      source: 'Proprietary code pasted into prompts',
      contract: 'Legal agreements, NDAs, contract clauses'
    }[cat];
  }

  // ---------- Activity log ----------
  function renderActivity() {
    var wrap = document.getElementById('activity-list');
    var filter = document.getElementById('activity-filter').value;
    var list = events.slice().reverse().filter(function (e) {
      if (filter === 'all') return true;
      if (filter === 'breached') return e.breached > 0;
      return e.action === filter;
    });
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state">' + (filter === 'all'
        ? 'No events yet. Scans, policy decisions, and simulated sends appear here for audit.'
        : 'No events match this filter.') + '</div>';
      return;
    }
    var html = '<div class="table-scroll"><table class="log-table"><thead><tr><th>Time</th><th>Source</th><th>Findings</th><th>Worst severity</th><th>Action</th><th>Breach check</th></tr></thead><tbody>';
    list.forEach(function (e) {
      var d = new Date(e.ts);
      html += '<tr><td class="mono">' + d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' }) + '</td><td>' + escapeHTML(e.source) + '</td>' +
        '<td>' + (e.total || '—') + '</td><td><span class="sev sev-' + e.topSeverity + '">' + (e.total ? e.topSeverity.toUpperCase() : '—') + '</span></td>' +
        '<td><span class="action-tag action-' + String(e.action).replace(/[^a-z-]/g, '') + '">' + escapeHTML(e.action) + '</span></td>' +
        '<td>' + breachCell(e) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }
  // What the log shows for the breach check: counts only, never the password.
  function breachCell(e) {
    if (e.breachError) return '<span class="muted">check failed</span>';
    if (e.breachRan && !e.breachChecked) return '<span class="muted">no password</span>';
    if (!e.breachChecked) return '—'; // the box was off
    if (e.breached) return '<span class="breach-tag">' + e.breached + ' of ' + e.breachChecked + ' found</span>';
    return '✓ 0 of ' + e.breachChecked;
  }
  document.getElementById('activity-filter').addEventListener('change', renderActivity);
  document.getElementById('export-log').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dato-audit-log.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  // Two-step button: first click arms it, second click within 4s runs it (no alert/confirm boxes)
  function armedButton(id, armedLabel, action) {
    var btn = document.getElementById(id), label = btn.textContent, timer = null;
    function disarm() { clearTimeout(timer); btn.textContent = label; btn.classList.remove('armed'); }
    btn.addEventListener('click', function () {
      if (btn.classList.contains('armed')) { disarm(); action(); return; }
      btn.textContent = armedLabel; btn.classList.add('armed');
      timer = setTimeout(disarm, 4000);
    });
  }
  armedButton('clear-log', 'Click again to confirm', function () {
    events = []; saveEvents(); renderActivity();
  });
  armedButton('reset-all', 'Click again to reset everything', function () {
    policies = Object.assign({}, DEFAULT_POLICIES); savePolicies();
    breachBox.checked = false; // the breach check is off by default
    events = []; saveEvents();
    clearConsole(); renderPolicies(); renderActivity(); renderDashboard();
    showView('firewall');
  });

  // ---------- Dashboard ----------
  // The numbers and charts come from dashboard.js (pure functions over `events`).
  var DB = window.DatoDashboard;

  // Reads: events, policies. Changes: the Dashboard view only.
  function renderDashboard() {
    var cats = Object.keys(D.CATEGORIES);
    var s = DB.summarize(events, cats);
    var empty = s.inspections === 0;

    // Stat cards: a number and one line of context each.
    setStat('stat-scans', s.inspections, empty ? 'Nothing inspected yet' : plural(s.findings, 'finding') + ' caught');
    setStat('stat-flagged', s.flagged, empty ? 'With confidential data' : Math.round(s.flagged / s.inspections * 100) + '% of inspections');
    setStat('stat-blocked', s.blocked, 'Stopped before sending');
    setStat('stat-breached', s.breachedInspections, 'Inspections with a breached password');
    document.getElementById('view-dashboard').classList.toggle('is-empty', empty);
    document.getElementById('dash-empty').hidden = !empty;
    document.getElementById('dash-content').hidden = empty;
    if (empty) return;

    // Activity over the last 14 days.
    document.getElementById('trend').innerHTML = DB.trendChart(DB.dailyTrend(events, 14, Date.now()));

    // Data types, most found first.
    var typeRows = cats.map(function (c) { return { label: D.CATEGORIES[c].label, value: s.byCategory[c] }; })
      .sort(function (a, b) { return b.value - a.value; });
    document.getElementById('cat-bars').innerHTML = s.findings
      ? DB.bars(typeRows, s.findings)
      : '<p class="card-caption">No confidential data found yet.</p>';

    // Severity (worst finding per flagged inspection) and policy outcomes.
    document.getElementById('sev-stack').innerHTML = DB.stacked(DB.SEVERITIES.map(function (v) {
      return { value: s.bySeverity[v], cls: 'seg-' + v };
    }));
    document.getElementById('sev-legend').innerHTML = DB.SEVERITIES.map(function (v) {
      return '<li>' + sevBadge(v) + '<span class="num">' + s.bySeverity[v] + '</span></li>';
    }).join('');
    var outcomes = [
      { word: 'Blocked', value: s.blocked, cls: 'seg-critical', badge: 'badge-critical' },
      { word: 'Warned', value: s.warned, cls: 'seg-high', badge: 'badge-high' },
      { word: 'Redacted', value: s.redacted, cls: 'seg-info', badge: 'badge-info' },
      { word: 'Clean', value: s.clean, cls: 'seg-ok', badge: 'badge-ok' }
    ];
    document.getElementById('outcome-stack').innerHTML = DB.stacked(outcomes);
    document.getElementById('outcome-legend').innerHTML = outcomes.map(function (o) {
      return '<li><span class="badge ' + o.badge + '"><span class="dot"></span>' + o.word + '</span><span class="num">' + o.value + '</span></li>';
    }).join('');

    // Recent activity: the last 6 events, newest first.
    var now = Date.now();
    document.getElementById('recent').innerHTML = events.slice(-6).reverse().map(function (e) {
      var d = DB.describe(e, D.CATEGORIES);
      var breach = DB.breachText(e);
      return '<li class="recent-row"><span class="badge ' + d.outcomeCls + '"><span class="dot"></span>' + d.outcome + '</span>' +
        '<div class="recent-main"><p class="recent-title">' + escapeHTML(d.title) + '</p>' +
        '<p class="recent-meta">' + d.source + (breach ? ' · ' + breach : '') + '</p></div>' +
        '<time class="recent-time" datetime="' + new Date(e.ts).toISOString() + '">' + DB.timeAgo(e.ts, now) + '</time></li>';
    }).join('');

    // Policies in effect.
    document.getElementById('posture-line').innerHTML = cats.map(function (c) {
      return '<li><span>' + D.CATEGORIES[c].label + '</span><span class="badge policy-' + policies[c] + '">' + ACTION_LABEL[policies[c]] + '</span></li>';
    }).join('');
  }
  // A stat card: the number and its one-line caption.
  function setStat(id, value, sub) {
    document.getElementById(id).textContent = value;
    document.getElementById(id + '-sub').textContent = sub;
  }

  var firewallLink = document.getElementById('goto-firewall');
  firewallLink.addEventListener('click', function (e) { e.preventDefault(); showView('firewall'); });

  document.getElementById('goto-install').addEventListener('click', function (e) { e.preventDefault(); showView('install'); });

  ['dash-goto-firewall', 'goto-activity'].forEach(function (id) {
    var link = document.getElementById(id);
    link.addEventListener('click', function (e) { e.preventDefault(); showView(link.getAttribute('href').slice(1)); });
  });

  var policiesLink = document.getElementById('goto-policies');
  policiesLink.addEventListener('click', function (e) { e.preventDefault(); showView('policies'); });

  // ---------- Boot ----------
  document.getElementById('scan-result').innerHTML = EMPTY_RESULT;
  renderPolicies();
  var initial = (location.hash || '#firewall').slice(1);
  showView(views.indexOf(initial) !== -1 ? initial : 'install');

  // Expose a small API for the assessment module
  window.DatoApp = {
    scanText: function (text) {
      var scan = D.scan(text);
      return { findings: scan.findings, action: evaluate(scan.findings), redacted: D.redact(text, scan.findings) };
    },
    logEvent: logEvent,
    getPolicies: function () { return Object.assign({}, policies); }
  };
})();

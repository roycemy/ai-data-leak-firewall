/* Dato flagged-activity dashboard. Reads chrome.storage.local (dato_events,
 * dato_settings). Deleting and pruning go through the service worker.
 *
 * State:
 *   live  - { events, retention } as stored
 *   demo  - generated events shown instead of live when demo mode is on; never stored
 *   range - days shown
 */
(function () {
  'use strict';
  var S = window.DatoStore;
  var SITE_NAME = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini' };
  var CAT_NAME = { secrets: 'Secrets & credentials', pii: 'Personal data', financial: 'Financial data', source: 'Source code', contract: 'Contracts & legal', sensitive: 'Sensitive context' };
  var OUTCOME_NAME = { allowed: 'Allowed by policy, sent', cancelled: 'Stopped, not sent', override: 'Sent through (Send anyway)', redacted: 'Redacted, then sent' };
  var ACTION_NAME = { allow: 'Allow', warn: 'Warn', redact: 'Redact', block: 'Block' };
  var SEV_NAME = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

  var live = { events: [], retention: 30 };
  var demo = null;
  var range = 30;
  var deleteArmed = false, deleteTimer = 0;

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtTime(t) { return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function fmtDay(t) { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function events() { return demo || live.events; }

  /* ---------- the five numbers ---------- */

  function renderKpis(m) {
    var box = $('kpis'); box.textContent = '';
    [
      ['Flagged prompts', m.flagged, 'Prompts Dato found something in'],
      ['High severity', m.high, 'Worst finding was critical or high'],
      ['Stopped, not sent', m.stopped, 'You went back, nothing was sent'],
      ['Sent through', m.sentThrough, 'Send anyway, or policy allowed it'],
      ['Redacted, then sent', m.redacted, 'Sent with the values replaced']
    ].forEach(function (t) {
      var tile = el('div', 'kpi');
      tile.append(el('small', '', t[0]), el('div', 'num', String(t[1])), el('span', 'muted', t[2]));
      box.appendChild(tile);
    });
    $('range-label').textContent = '· last ' + range + ' days';
  }

  /* ---------- flags per day ---------- */

  function renderTrend(m) {
    var box = $('trend'); box.textContent = '';
    var max = 0;
    m.perDay.forEach(function (d) { if (d.total > max) max = d.total; });
    if (!max) { box.appendChild(el('p', 'empty', 'No flags in this range.')); $('trend-table').textContent = ''; return; }
    var plot = el('div', 'plot');
    plot.setAttribute('role', 'img');
    plot.setAttribute('aria-label', 'Flagged prompts per day. Busiest day: ' + max + '.');
    m.perDay.forEach(function (d) {
      var col = el('div', 'col');
      var bar = el('div', 'barfill');
      bar.style.height = (d.total / max * 100) + '%';
      col.title = fmtDay(d.day) + ': ' + d.total + ' flagged, ' + d.high + ' high severity';
      col.appendChild(bar);
      plot.appendChild(col);
    });
    var axis = el('div', 'axis');
    axis.append(el('span', '', fmtDay(m.perDay[0].day)), el('span', '', 'busiest ' + max + ' / day'), el('span', '', fmtDay(m.perDay[m.perDay.length - 1].day)));
    box.append(plot, axis);

    var t = el('table');
    t.innerHTML = '<thead><tr><th>Day</th><th>Flagged</th><th>High severity</th></tr></thead>';
    var body = el('tbody');
    m.perDay.filter(function (d) { return d.total; }).forEach(function (d) {
      var tr = el('tr');
      [fmtDay(d.day), d.total, d.high].forEach(function (v) { tr.appendChild(el('td', '', String(v))); });
      body.appendChild(tr);
    });
    t.appendChild(body);
    $('trend-table').textContent = '';
    $('trend-table').appendChild(t);
  }

  /* ---------- findings by type ---------- */

  function renderCats(m) {
    var box = $('cats'); box.textContent = '';
    var max = 0;
    S.CATEGORIES.forEach(function (c) { if (m.byCategory[c] > max) max = m.byCategory[c]; });
    if (!max) { box.appendChild(el('p', 'empty', 'No findings in this range.')); return; }
    S.CATEGORIES.slice().sort(function (a, b) { return m.byCategory[b] - m.byCategory[a]; }).forEach(function (c) {
      var row = el('div', 'cat');
      var label = el('div', 'cat-label');
      label.append(el('span', '', CAT_NAME[c]), el('b', '', String(m.byCategory[c])));
      var track = el('div', 'track'), fill = el('div', 'fill');
      fill.style.width = (m.byCategory[c] / max * 100) + '%';
      track.appendChild(fill);
      row.append(label, track);
      box.appendChild(row);
    });
  }

  /* ---------- recent flags ---------- */

  function sevPill(sev) {
    var cls = sev === 'critical' ? 'pill-block' : sev === 'high' ? 'pill-warn' : '';
    return el('span', 'pill ' + cls, SEV_NAME[sev] || sev);
  }

  function renderLog(list) {
    var box = $('log'); box.textContent = '';
    var from = S.startOfDay(Date.now()) - (range - 1) * S.DAY;
    var rows = list.filter(function (e) { return e.t >= from; }).slice(-50).reverse();
    if (!rows.length) { box.appendChild(el('p', 'empty', demo ? 'No demo flags.' : 'Nothing flagged yet. When Dato holds a prompt on ChatGPT, Claude or Gemini, it shows up here.')); return; }
    var wrap = el('div', 'table-wrap');
    var t = el('table');
    t.innerHTML = '<thead><tr><th>When</th><th>Site</th><th>Severity</th><th>Policy</th><th>What happened</th><th>Data types</th></tr></thead>';
    var body = el('tbody');
    rows.forEach(function (e) {
      var tr = el('tr');
      tr.appendChild(el('td', 'mono', fmtTime(e.t)));
      tr.appendChild(el('td', '', SITE_NAME[e.site] || e.site));
      var sev = el('td'); sev.appendChild(sevPill(e.severity)); tr.appendChild(sev);
      var act = el('td'); act.appendChild(el('span', 'pill pill-' + e.action, ACTION_NAME[e.action])); tr.appendChild(act);
      tr.appendChild(el('td', '', OUTCOME_NAME[e.outcome] || e.outcome));
      tr.appendChild(el('td', '', Object.keys(e.categories || {}).map(function (c) { return CAT_NAME[c] + ' ×' + e.categories[c]; }).join(', ') || '—'));
      body.appendChild(tr);
    });
    t.appendChild(body); wrap.appendChild(t); box.appendChild(wrap);
  }

  /* ---------- render ---------- */

  function render() {
    var m = S.metrics(events(), range, Date.now());
    renderKpis(m); renderTrend(m); renderCats(m); renderLog(events());
    $('retention').value = String(live.retention);
    var inDemo = !!demo;
    $('demo-banner').hidden = !inDemo;
    document.body.classList.toggle('is-demo', inDemo);
    $('demo').setAttribute('aria-pressed', String(inDemo));
    $('demo').textContent = inDemo ? 'Hide demo data' : 'Show demo data';
    ['export', 'delete', 'retention'].forEach(function (id) { $(id).disabled = inDemo; });
  }

  // Reads storage; changes live.
  function load() {
    chrome.storage.local.get(['dato_events', 'dato_settings'], function (all) {
      live = { events: all.dato_events || [], retention: S.cleanRetention(all.dato_settings && all.dato_settings.retentionDays) };
      render();
    });
  }
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && (changes.dato_events || changes.dato_settings)) load();
  });

  /* ---------- demo mode ---------- */

  // Made-up flags with a fixed seed, so the demo looks the same every time. Held in memory only.
  function makeDemo() {
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var now = Date.now(), list = [];
    var typeWeights = [['secrets', 0.34], ['pii', 0.26], ['financial', 0.16], ['source', 0.14], ['contract', 0.07], ['sensitive', 0.03]];
    var rulesFor = { secrets: ['aws-access-key', 'github-token', 'private-key-block'], pii: ['email-address', 'ssn', 'credit-card'], financial: ['financial-figures', 'iban'], source: ['proprietary-source'], contract: ['contract-language'], sensitive: ['sensitive-context'] };
    for (var i = 0; i < 120; i++) {
      var r = rnd(), cat = 'secrets', acc = 0;
      for (var k = 0; k < typeWeights.length; k++) { acc += typeWeights[k][1]; if (r <= acc) { cat = typeWeights[k][0]; break; } }
      var o = rnd();
      var outcome = o < 0.45 ? 'cancelled' : o < 0.65 ? 'override' : o < 0.85 ? 'redacted' : 'allowed';
      var action = outcome === 'redacted' ? 'redact' : outcome === 'allowed' ? 'allow' : cat === 'secrets' ? 'block' : 'warn';
      var severity = cat === 'secrets' ? (rnd() < 0.7 ? 'critical' : 'high') : cat === 'pii' ? (rnd() < 0.4 ? 'critical' : 'medium') : cat === 'financial' ? 'high' : cat === 'source' ? 'high' : 'low';
      var categories = {}; categories[cat] = 1 + Math.floor(rnd() * 3);
      var rules = {}; rules[rulesFor[cat][Math.floor(rnd() * rulesFor[cat].length)]] = 1;
      list.push({ id: 'demo-' + i, t: now - Math.floor(rnd() * 28 * S.DAY) - Math.floor(rnd() * 20 * 3600e3), site: S.SITES[Math.floor(rnd() * 3)], action: action, outcome: outcome, trigger: 'click', severity: severity, categories: categories, rules: rules });
    }
    return list.sort(function (a, b) { return a.t - b.t; });
  }

  function setDemo(on) { demo = on ? makeDemo() : null; render(); }
  $('demo').addEventListener('click', function () { setDemo(!demo); });
  $('demo-exit').addEventListener('click', function () { setDemo(false); });
  $('range').addEventListener('change', function () { range = Number($('range').value); render(); });

  /* ---------- your data ---------- */

  function dataMsg(text) { $('data-msg').textContent = text; }

  $('retention').addEventListener('change', function () {
    var days = S.cleanRetention(Number($('retention').value));
    chrome.storage.local.set({ dato_settings: { retentionDays: days } }, function () {
      chrome.runtime.sendMessage({ type: 'dato:prune' }, function () { dataMsg('Keeping flags for ' + days + ' days. Older ones were removed.'); });
    });
  });

  $('export').addEventListener('click', function () {
    var payload = {
      exportedAt: new Date().toISOString(),
      source: 'Dato extension, this browser profile',
      note: 'Counts and labels only. No prompt text, file contents or matched values.',
      events: live.events
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dato-flags-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    dataMsg('Exported ' + live.events.length + ' flags.');
  });

  // Two clicks, no pop-up: the first arms the button for 5 seconds.
  $('delete').addEventListener('click', function () {
    var btn = $('delete');
    if (!deleteArmed) {
      deleteArmed = true; btn.textContent = 'Click again to delete everything';
      dataMsg('This removes every recorded flag from this browser.');
      deleteTimer = setTimeout(function () { deleteArmed = false; btn.textContent = 'Delete all activity'; dataMsg(''); }, 5000);
      return;
    }
    clearTimeout(deleteTimer); deleteArmed = false; btn.textContent = 'Delete all activity';
    chrome.runtime.sendMessage({ type: 'dato:delete' }, function (res) {
      dataMsg(res && res.ok ? 'All activity deleted.' : 'Could not delete activity. Try again.');
    });
  });

  load();
})();

/* Dato activity dashboard. Reads chrome.storage.local (dato_events,
 * dato_health, dato_settings). Writes go through the service worker
 * (prune, delete) or dato_settings (retention).
 *
 * State:
 *   live   - { events, health, settings } as stored
 *   demo   - generated events shown instead of live when demo mode is on; never stored
 *   range  - days shown
 */
(function () {
  'use strict';
  var S = window.DatoStore, P = window.DatoPolicy;
  var SITES = [['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['gemini', 'Gemini']];
  var SITE_NAME = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', fixture: 'Test fixture' };
  var CAT_NAME = { secrets: 'Secrets & credentials', pii: 'Personal data', financial: 'Financial data', source: 'Source code', contract: 'Contracts & legal', sensitive: 'Sensitive context' };
  var OUTCOME_NAME = { allowed: 'Allowed by policy', cancelled: 'Held, user went back', override: 'Sent anyway (override)', redacted: 'Redacted and sent', redaction_failed: 'Redaction failed, not sent', stale_review: 'Changed after review, not sent' };
  var ACTION_NAME = { allow: 'Allow', warn: 'Warn', redact: 'Redact', block: 'Block' };
  var STATE_NAME = { active: 'Active', degraded: 'Degraded', error: 'Error', checking: 'Checking' };

  var live = { events: [], health: {}, settings: P.cleanSettings() };
  var demo = null;
  var range = 30;
  var deleteArmed = false, deleteTimer = 0;

  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function fmtTime(t) { return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function fmtDay(t) { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

  function data() { return demo || live; }

  /* ---------- health ---------- */

  function renderHealth() {
    var box = $('health'); box.textContent = '';
    var map = data().health || {};
    SITES.forEach(function (s) {
      var h = map[s[0]];
      var card = el('div', 'health-card');
      card.dataset.state = h ? h.state : 'none';
      var head = el('div', 'health-head');
      head.append(el('span', 'dot'), el('b', '', s[1]), el('span', 'state', h ? STATE_NAME[h.state] : 'Not seen yet'));
      card.append(head, el('p', '', h ? h.detail : 'Open ' + s[1] + ' with Dato installed to check it.'));
      if (h) card.append(el('small', 'muted', 'Last checked ' + fmtTime(h.t)));
      box.appendChild(card);
    });
  }

  /* ---------- KPIs ---------- */

  function renderKpis(m) {
    var box = $('kpis'); box.textContent = '';
    var tiles = [
      ['Held for review', m.total - m.allowed, 'Prompts Dato stopped to show you'],
      ['Blocked', m.blocked, 'Blocked by policy and not sent'],
      ['Redacted', m.redacted, 'Sent with values replaced'],
      ['Overrides', m.overrides, 'Sent anyway after a warning or block'],
      ['Not sent', m.failed + m.stale, 'Redaction failed or prompt changed after review']
    ];
    tiles.forEach(function (t) {
      var tile = el('div', 'kpi');
      tile.append(el('small', '', t[0]), el('div', 'num', String(t[1])), el('span', 'muted', t[2]));
      box.appendChild(tile);
    });
    $('range-label').textContent = '· last ' + range + ' days';
  }

  /* ---------- trend ---------- */

  function renderTrend(m) {
    var box = $('trend'); box.textContent = '';
    var max = 0;
    m.perDay.forEach(function (d) { if (d.total > max) max = d.total; });
    if (!max) { box.appendChild(el('p', 'empty', 'No interventions in this range.')); $('trend-table').textContent = ''; return; }
    var plot = el('div', 'plot');
    plot.setAttribute('role', 'img');
    plot.setAttribute('aria-label', 'Interventions per day. Highest day: ' + max + '.');
    m.perDay.forEach(function (d) {
      var col = el('div', 'col');
      var bar = el('div', 'barfill');
      bar.style.height = (d.total / max * 100) + '%';
      col.title = fmtDay(d.day) + ': ' + d.total + ' (' + d.blocked + ' blocked, ' + d.redacted + ' redacted, ' + d.overrides + ' overrides)';
      col.appendChild(bar);
      plot.appendChild(col);
    });
    var axis = el('div', 'axis');
    axis.append(el('span', '', fmtDay(m.perDay[0].day)), el('span', '', 'max ' + max + ' / day'), el('span', '', fmtDay(m.perDay[m.perDay.length - 1].day)));
    box.append(plot, axis);
    renderTrendTable(m);
  }

  function renderTrendTable(m) {
    var t = el('table');
    t.innerHTML = '<thead><tr><th>Day</th><th>Total</th><th>Blocked</th><th>Redacted</th><th>Overrides</th></tr></thead>';
    var body = el('tbody');
    m.perDay.filter(function (d) { return d.total; }).forEach(function (d) {
      var tr = el('tr');
      [fmtDay(d.day), d.total, d.blocked, d.redacted, d.overrides].forEach(function (v) { tr.appendChild(el('td', '', String(v))); });
      body.appendChild(tr);
    });
    t.appendChild(body);
    $('trend-table').textContent = '';
    $('trend-table').appendChild(t);
  }

  /* ---------- categories ---------- */

  function renderCats(m) {
    var box = $('cats'); box.textContent = '';
    var max = 0;
    S.CATEGORIES.forEach(function (c) { if (m.byCategory[c] > max) max = m.byCategory[c]; });
    if (!max) { box.appendChild(el('p', 'empty', 'No findings in this range.')); return; }
    S.CATEGORIES.slice().sort(function (a, b) { return m.byCategory[b] - m.byCategory[a]; }).forEach(function (c) {
      var row = el('div', 'cat');
      var label = el('div', 'cat-label');
      label.append(el('span', '', CAT_NAME[c]), el('b', '', String(m.byCategory[c])));
      var track = el('div', 'track');
      var fill = el('div', 'fill');
      fill.style.width = (m.byCategory[c] / max * 100) + '%';
      track.appendChild(fill);
      row.append(label, track);
      box.appendChild(row);
    });
  }

  /* ---------- log ---------- */

  function renderLog(events) {
    var box = $('log'); box.textContent = '';
    var from = S.startOfDay(Date.now()) - (range - 1) * S.DAY;
    var rows = events.filter(function (e) { return e.t >= from; }).slice(-50).reverse();
    if (!rows.length) { box.appendChild(el('p', 'empty', demo ? 'No demo events.' : 'No activity recorded yet. When Dato holds a prompt on a supported site, it shows up here.')); return; }
    var wrap = el('div', 'table-wrap');
    var t = el('table');
    t.innerHTML = '<thead><tr><th>When</th><th>Site</th><th>Policy</th><th>Outcome</th><th>Data types</th></tr></thead>';
    var body = el('tbody');
    rows.forEach(function (e) {
      var tr = el('tr');
      tr.appendChild(el('td', 'mono', fmtTime(e.t)));
      tr.appendChild(el('td', '', SITE_NAME[e.adapter] || e.adapter));
      var act = el('td'); act.appendChild(el('span', 'pill pill-' + e.action, ACTION_NAME[e.action] + (e.strict ? ' · strict' : ''))); tr.appendChild(act);
      tr.appendChild(el('td', '', OUTCOME_NAME[e.outcome] || e.outcome));
      tr.appendChild(el('td', '', Object.keys(e.categories || {}).map(function (c) { return CAT_NAME[c] + ' ×' + e.categories[c]; }).join(', ') || '—'));
      body.appendChild(tr);
    });
    t.appendChild(body); wrap.appendChild(t); box.appendChild(wrap);
  }

  /* ---------- render ---------- */

  function render() {
    var d = data();
    var m = S.metrics(d.events, range, Date.now());
    renderHealth(); renderKpis(m); renderTrend(m); renderCats(m); renderLog(d.events);
    $('retention').value = String(live.settings.retentionDays);
    var inDemo = !!demo;
    $('demo-banner').hidden = !inDemo;
    document.body.classList.toggle('is-demo', inDemo);
    $('demo').setAttribute('aria-pressed', String(inDemo));
    $('demo').textContent = inDemo ? 'Hide demo data' : 'Show demo data';
    ['export', 'delete', 'retention'].forEach(function (id) { $(id).disabled = inDemo; });
  }

  // Reads storage; changes live.
  function load() {
    chrome.storage.local.get(['dato_events', 'dato_health', 'dato_settings'], function (all) {
      live = { events: all.dato_events || [], health: all.dato_health || {}, settings: P.cleanSettings(all.dato_settings) };
      render();
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && (changes.dato_events || changes.dato_health || changes.dato_settings)) load();
  });

  /* ---------- demo mode ---------- */

  // Deterministic generated events. Lives in memory only.
  function makeDemo() {
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var now = Date.now(), events = [];
    var outcomes = ['cancelled', 'cancelled', 'redacted', 'override', 'cancelled', 'allowed', 'stale_review'];
    for (var i = 0; i < 140; i++) {
      var cat = S.CATEGORIES[Math.floor(rnd() * rnd() * 6)];
      var cats = {}; cats[cat] = 1 + Math.floor(rnd() * 3);
      var outcome = outcomes[Math.floor(rnd() * outcomes.length)];
      var action = cat === 'secrets' ? 'block' : outcome === 'redacted' ? 'redact' : outcome === 'allowed' ? 'allow' : 'warn';
      events.push({ id: 'demo-' + i, t: now - Math.floor(rnd() * 29 * S.DAY), adapter: SITES[Math.floor(rnd() * 3)][0], action: action, outcome: outcome, trigger: 'click', strict: false, categories: cats, rules: {} });
    }
    events.sort(function (a, b) { return a.t - b.t; });
    var health = {
      chatgpt: { adapter: 'chatgpt', state: 'active', detail: 'Demo: checking prompts before they send.', t: now },
      claude: { adapter: 'claude', state: 'degraded', detail: 'Demo: send button not recognised. Enter and form submits are still checked.', t: now },
      gemini: { adapter: 'gemini', state: 'active', detail: 'Demo: checking prompts before they send.', t: now }
    };
    return { events: events, health: health };
  }

  function setDemo(on) { demo = on ? makeDemo() : null; render(); }
  $('demo').addEventListener('click', function () { setDemo(!demo); });
  $('demo-exit').addEventListener('click', function () { setDemo(false); });

  $('range').addEventListener('change', function () { range = Number($('range').value); render(); });

  /* ---------- data controls ---------- */

  function dataMsg(text) { $('data-msg').textContent = text; }

  $('retention').addEventListener('change', function () {
    var s = P.cleanSettings(live.settings);
    s.retentionDays = Number($('retention').value);
    s = P.cleanSettings(s);
    chrome.storage.local.set({ dato_settings: s }, function () {
      chrome.runtime.sendMessage({ type: 'dato:prune' }, function () { dataMsg('Keeping activity for ' + s.retentionDays + ' days. Older events were removed.'); });
    });
  });

  $('export').addEventListener('click', function () {
    var payload = {
      exportedAt: new Date().toISOString(),
      source: 'Dato extension, this browser profile',
      note: 'Metadata only. No prompt text, file contents or matched values.',
      settings: live.settings,
      health: live.health,
      events: live.events
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dato-activity-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    dataMsg('Exported ' + live.events.length + ' events.');
  });

  $('delete').addEventListener('click', function () {
    var btn = $('delete');
    if (!deleteArmed) {
      deleteArmed = true; btn.textContent = 'Click again to delete everything';
      dataMsg('This removes every event and health record from this browser.');
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

/* AI Firewall: dashboard and audit-log helpers (Mini Project 3)
 *
 * Pure functions that turn the local audit log (`events` in app.js) into the
 * numbers, words and charts the Dashboard and Audit log show. They read only
 * what they are given and change nothing, so they are easy to test in Node.
 * Everything comes from this browser's own log: there is no server and no
 * data from other employees' devices.
 */
(function (global) {
  'use strict';

  var DAY = 86400000;
  var SCAN_ACTIONS = ['allow', 'warn', 'redact', 'block', 'allowed-clean'];
  var SEVERITIES = ['critical', 'high', 'medium', 'low'];

  // An inspection (as opposed to a simulated send or a policy change).
  function isScan(e) { return SCAN_ACTIONS.indexOf(e.action) !== -1; }

  /* summarize(events, categoryKeys) -> the numbers behind the stat cards and charts */
  function summarize(events, categoryKeys) {
    var scans = events.filter(isScan);
    var byCategory = {};
    categoryKeys.forEach(function (c) { byCategory[c] = 0; });
    var bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    scans.forEach(function (e) {
      categoryKeys.forEach(function (c) { byCategory[c] += (e.byCategory && e.byCategory[c]) || 0; });
      if (e.total > 0 && bySeverity[e.topSeverity] !== undefined) bySeverity[e.topSeverity]++;
    });
    function countAction(a) { return scans.filter(function (e) { return e.action === a; }).length; }
    return {
      inspections: scans.length,
      flagged: scans.filter(function (e) { return e.total > 0; }).length,
      findings: scans.reduce(function (s, e) { return s + (e.total || 0); }, 0),
      blocked: countAction('block'),
      warned: countAction('warn'),
      redacted: countAction('redact'),
      clean: countAction('allowed-clean') + countAction('allow'),
      breachedInspections: events.filter(function (e) { return e.breached > 0; }).length,
      byCategory: byCategory,
      bySeverity: bySeverity
    };
  }

  /* dailyTrend(events, days, now) -> one entry per day, oldest first:
   * { start, label, inspections, flagged } */
  function dailyTrend(events, days, now) {
    var today = new Date(now); today.setHours(0, 0, 0, 0);
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today); d.setDate(d.getDate() - i);
      out.push({ start: d.getTime(), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), inspections: 0, flagged: 0 });
    }
    events.filter(isScan).forEach(function (e) {
      out.forEach(function (day) {
        if (e.ts >= day.start && e.ts < day.start + DAY) {
          day.inspections++;
          if (e.total > 0) day.flagged++;
        }
      });
    });
    return out;
  }

  /* activeDays(days) -> how many of these days had at least one inspection */
  function activeDays(days) {
    return days.filter(function (d) { return d.inspections > 0; }).length;
  }

  /* trendChart(days) -> HTML: an inline SVG bar chart plus its labels.
   * Each day is one bar: the full bar is all inspections, the dark part is the
   * ones that were flagged. The SVG uses a simple 0–100 coordinate system. */
  function trendChart(days) {
    var most = Math.max.apply(null, days.map(function (d) { return d.inspections; }));
    var top = most <= 1 ? 1 : most + (most % 2);   // even, so the middle tick is a whole number
    var slot = 100 / days.length;              // width of each day's slot
    var barW = slot * 0.6;                     // bar takes 60% of its slot
    var bars = days.map(function (d, i) {
      var x = (i * slot + (slot - barW) / 2).toFixed(2);
      var hAll = (d.inspections / top * 100).toFixed(2);
      var hFlag = (d.flagged / top * 100).toFixed(2);
      return '<rect class="bar-all" x="' + x + '" y="' + (100 - hAll) + '" width="' + barW.toFixed(2) + '" height="' + hAll + '"/>' +
        '<rect class="bar-flag" x="' + x + '" y="' + (100 - hFlag) + '" width="' + barW.toFixed(2) + '" height="' + hFlag + '"/>';
    }).join('');
    var total = days.reduce(function (s, d) { return s + d.inspections; }, 0);
    var flagged = days.reduce(function (s, d) { return s + d.flagged; }, 0);
    var mid = days[Math.floor(days.length / 2)];
    // Y-axis labels: top, middle (only when it is a whole number) and 0.
    var ticks = '<span class="tick" style="top:0%">' + top + '</span>' +
      (top >= 2 ? '<span class="tick" style="top:50%">' + top / 2 + '</span>' : '') +
      '<span class="tick" style="top:100%">0</span>';
    return '<div class="trend">' +
      '<div class="trend-plot"><div class="trend-ticks num" aria-hidden="true">' + ticks + '</div>' +
      '<svg class="trend-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="' +
        total + ' inspections and ' + flagged + ' flagged in the last ' + days.length + ' days">' +
        '<line class="grid" x1="0" y1="0" x2="100" y2="0"/><line class="grid" x1="0" y1="50" x2="100" y2="50"/>' +
        '<line class="axis" x1="0" y1="100" x2="100" y2="100"/>' + bars + '</svg></div>' +
      '<div class="trend-labels"><span>' + days[0].label + '</span><span>' + mid.label + '</span><span>Today</span></div>' +
      '</div>';
  }

  /* status(events, now) -> the one line under the Dashboard title:
   * { kind: 'critical' | 'ok', text }, looking at the last 14 days. */
  function status(events, now) {
    var recent = events.filter(function (e) { return isScan(e) && e.ts > now - 14 * DAY; });
    var breached = recent.filter(function (e) { return e.breached > 0; }).length;
    if (breached) {
      return { kind: 'critical', text: '◆ ' + (breached === 1
        ? '1 prompt had a password found in known breaches. Change that password.'
        : breached + ' prompts had passwords found in known breaches. Change those passwords.') };
    }
    var blocked = recent.filter(function (e) { return e.action === 'block'; }).length;
    var text = blocked ? plural(blocked, 'risky prompt') + ' blocked in the last 14 days.'
      : recent.length ? plural(recent.length, 'prompt') + ' checked in the last 14 days, none blocked.'
      : 'No prompts checked in the last 14 days.';
    return { kind: 'ok', text: '✓ Working. ' + text };
  }

  /* bars(rows, total) -> HTML horizontal bars. rows: [{ label, value, cls }] */
  function bars(rows, total) {
    var max = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.value; })));
    return '<ul class="hbars">' + rows.map(function (r) {
      var pct = total ? Math.round(r.value / total * 100) : 0;
      return '<li class="hbar"><span class="hbar-label">' + r.label + '</span>' +
        '<span class="hbar-value num">' + r.value + '<span class="muted"> · ' + pct + '%</span></span>' +
        '<span class="hbar-track"><span class="hbar-fill ' + (r.cls || '') + '" style="width:' + (r.value / max * 100) + '%"></span></span></li>';
    }).join('') + '</ul>';
  }

  /* stacked(segments) -> HTML one stacked bar. segments: [{ value, cls }] */
  function stacked(segments) {
    var total = segments.reduce(function (s, x) { return s + x.value; }, 0);
    if (!total) return '<div class="stack"></div>';
    return '<div class="stack">' + segments.filter(function (x) { return x.value; }).map(function (x) {
      return '<span class="' + x.cls + '" style="width:' + (x.value / total * 100) + '%"></span>';
    }).join('') + '</div>';
  }

  // Outcome of an event, as a badge: word + colour class.
  var OUTCOME = {
    block: { word: 'Blocked', cls: 'badge-critical' },
    warn: { word: 'Warned', cls: 'badge-high' },
    redact: { word: 'Redacted', cls: 'badge-info' },
    allow: { word: 'Allowed', cls: 'badge-ok' },
    'allowed-clean': { word: 'Clean', cls: 'badge-ok' },
    'sent-send': { word: 'Sent', cls: 'badge-low' },
    'sent-redacted': { word: 'Sent redacted', cls: 'badge-low' }
  };

  /* describe(e, categories) -> { outcome, outcomeCls, title, source }
   * Plain words for one audit event. categories is DatoDetect.CATEGORIES. */
  function describe(e, categories) {
    var action = String(e.action);
    if (action.indexOf('policy:') === 0) {               // e.g. "policy:secrets=allow"
      var parts = action.slice(7).split('=');
      var cat = categories[parts[0]] ? categories[parts[0]].label : parts[0];
      var word = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : '';
      return { outcome: 'Policy', outcomeCls: 'badge-low', title: cat + ' set to ' + word, source: 'Policy change' };
    }
    var o = OUTCOME[action] || { word: action, cls: 'badge-low' };
    if (action.indexOf('sent-') === 0) {
      return { outcome: o.word, outcomeCls: o.cls, title: 'Simulated send', source: 'Firewall' };
    }
    var found = Object.keys(categories).filter(function (c) { return e.byCategory && e.byCategory[c] > 0; })
      .map(function (c) { return categories[c].label; });
    var title = e.total ? plural(e.total, 'finding') + ': ' + found.join(', ') : 'No sensitive data';
    var source = /^assessment:/.test(e.source) ? 'Assessment' : (e.source === 'prompt' ? 'Prompt' : 'Prompt and files');
    return { outcome: o.word, outcomeCls: o.cls, title: title, source: source };
  }

  /* breachText(e) -> what the breach check did for this event, or '' if it did not run */
  function breachText(e) {
    if (e.breachError) return 'Breach check failed';
    if (e.breachRan && !e.breachChecked) return 'No password to check';
    if (!e.breachChecked) return '';
    if (e.breached) return e.breached + ' of ' + plural(e.breachChecked, 'password') + ' found in breaches';
    return 'Not found in breaches (' + plural(e.breachChecked, 'password') + ')';
  }

  /* timeAgo(ts, now) -> "just now", "5 min ago", "3 h ago", "Yesterday", "2 days ago" */
  function timeAgo(ts, now) {
    var s = Math.max(0, Math.round((now - ts) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < DAY / 1000) return Math.floor(s / 3600) + ' h ago';
    var days = Math.floor(s / (DAY / 1000));
    return days === 1 ? 'Yesterday' : days + ' days ago';
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  var WEEK = 7 * DAY;
  var CATCH_OUTCOME = {
    block: 'stopped',
    warn: 'warned',
    redact: 'redacted',
    allow: 'allowed',
    'allowed-clean': 'clean',
    'sent-send': 'sent anyway',
    'sent-redacted': 'redacted',
    cancelled: 'stopped',
    override: 'sent anyway',
    stopped: 'stopped',
    'sent anyway': 'sent anyway',
    allowed: 'allowed',
    redacted: 'redacted',
    warned: 'warned',
    clean: 'clean'
  };

  function startOfDay(t) {
    var d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* isWebsiteStop(e) -> true when this website blocked a prompt (nothing sent). */
  function isWebsiteStop(e) { return e && e.action === 'block'; }

  /* stops(events, extCount, from, to) -> website blocks in [from, to) plus the
   * extension's uncapped stop count (summary.stoppedToday / stoppedWeek). */
  function stops(events, extCount, from, to) {
    var n = 0;
    (events || []).forEach(function (e) {
      if (isWebsiteStop(e) && e.ts >= from && e.ts < to) n++;
    });
    extCount = Math.floor(Number(extCount));
    if (extCount > 0) n += extCount;
    return n;
  }

  // Hash aliases for the three tabs. Unknown values fall back to Dashboard.
  var HASH_TO_TAB = {
    dashboard: 'dashboard',
    try: 'try', 'try-it': 'try', firewall: 'try', assessment: 'try',
    setup: 'setup', policies: 'setup', extension: 'setup', install: 'setup',
    activity: 'dashboard', audit: 'dashboard'
  };
  var CANONICAL_HASH = ['dashboard', 'try', 'setup', 'activity', 'audit', 'assessment'];
  function tabFor(name) { return HASH_TO_TAB[name] || 'dashboard'; }
  function canonicalHash(name) {
    if (name === 'activity' || name === 'audit' || name === 'assessment') return name;
    return tabFor(name);
  }
  function isCanonicalHash(name) { return CANONICAL_HASH.indexOf(name) !== -1; }
  /* shouldReplaceHash(current, next) -> true when the URL hash must be corrected
   * without pushing a history entry (unknown or old alias). Canonical hashes
   * (tab clicks, See all) still push so Back works. */
  function shouldReplaceHash(current, next) {
    return current !== next && !isCanonicalHash(current);
  }

  /* hero({ connected, stopsToday, stopsWeek, stopsTodayKnown }) -> { kind, text }
   * for the large Dashboard sentence. "Working…" is only used when the extension
   * is connected. If an older extension omitted stoppedToday, we cannot honestly
   * say "Nothing risky yet today", so the sentence is just "Working." */
  function hero(opts) {
    opts = opts || {};
    if (!opts.connected) {
      return { kind: 'install', text: 'Install the extension to start protecting your AI chats' };
    }
    if (opts.stopsToday > 0) {
      return { kind: 'ok', text: 'Working. ' + plural(opts.stopsToday, 'risky prompt') + ' stopped today' };
    }
    if (opts.stopsWeek > 0) {
      return { kind: 'ok', text: 'Working. ' + plural(opts.stopsWeek, 'risky prompt') + ' stopped this week' };
    }
    if (opts.stopsTodayKnown === false) {
      return { kind: 'ok', text: 'Working.' };
    }
    return { kind: 'ok', text: 'Working. Nothing risky yet today' };
  }

  var NAME_MAX = 60;
  var NAME_FALLBACK = 'You';

  /* sanitizeName(value) -> trimmed string of at most 60 characters.
   * Does not interpret HTML; the caller must render with textContent. */
  function sanitizeName(value) {
    if (value == null) return '';
    var s = String(value).trim();
    if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX);
    return s;
  }
  function displayName(value) {
    return sanitizeName(value) || NAME_FALLBACK;
  }
  /* clockTime(ts) -> "2:14 PM" in the user's locale. Used on catch rows and the log
   * instead of a relative "2 min ago". */
  function clockTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  /* catchMeta(name, site, time) -> "Royce Myers · ChatGPT · 2:14 PM".
   * An empty name is shown as "You". */
  function catchMeta(name, site, time) {
    return displayName(name) + ' · ' + site + ' · ' + clockTime(time);
  }

  /* passwordAlert(events) -> a red status line when any inspection found a
   * breached password, or null. Counts inspections, not distinct passwords. */
  function passwordAlert(events) {
    var n = (events || []).filter(function (e) { return e.breached > 0; }).length;
    if (!n) return null;
    return { kind: 'critical', text: n === 1
      ? '◆ 1 prompt had a password found in known breaches. Change that password.'
      : '◆ ' + n + ' prompts had passwords found in known breaches. Change those passwords.' };
  }

  /* sentAnyway(events, extSummary) -> website simulated sends plus extension overrides. */
  function sentAnyway(events, extSummary) {
    var n = (events || []).filter(function (e) { return e.action === 'sent-send'; }).length;
    if (extSummary && extSummary.byOutcome) n += (extSummary.byOutcome.override || 0) + (extSummary.byOutcome.allowed || 0);
    return n;
  }

  /* catchLabel(e, categories) -> a short finding label for a website event. */
  function catchLabel(e, categories) {
    if (!e) return 'Confidential data';
    var action = String(e.action || '');
    if (action.indexOf('policy:') === 0) return describe(e, categories).title;
    if (action.indexOf('sent-') === 0) return 'Simulated send';
    var found = Object.keys(categories || {}).filter(function (c) { return e.byCategory && e.byCategory[c] > 0; });
    if (!found.length) return e.total ? 'Confidential data' : 'No sensitive data';
    return categories[found[0]].label;
  }

  /* catchOutcome(outcome) -> { word, cls } for the Recent catches pill.
   * "redacted" is shown as "Removed" (cobalt). Stopped is red, Sent anyway is amber. */
  function catchOutcome(outcome) {
    var map = {
      stopped: { word: 'Stopped', cls: 'badge-critical' },
      redacted: { word: 'Removed', cls: 'badge-info' },
      removed: { word: 'Removed', cls: 'badge-info' },
      'sent anyway': { word: 'Sent anyway', cls: 'badge-high' },
      warned: { word: 'Warned', cls: 'badge-high' },
      allowed: { word: 'Allowed', cls: 'badge-ok' },
      clean: { word: 'Clean', cls: 'badge-ok' }
    };
    return map[outcome] || { word: String(outcome || ''), cls: 'badge-low' };
  }

  /* websiteCatch(e, categories) -> { label, outcome, site, time } or null (policy/clean skipped for Recent catches). */
  function websiteCatch(e, categories) {
    if (!e || !isScan(e) || !e.total) return null;
    var outcome = CATCH_OUTCOME[e.action];
    if (!outcome) return null;
    return { label: catchLabel(e, categories), outcome: outcome, site: 'This website', time: e.ts, source: 'website' };
  }

  /* mergeCatches(events, extRecent, categories, limit) -> newest first, website + extension. */
  function mergeCatches(events, extRecent, categories, limit) {
    var list = [];
    (events || []).forEach(function (e) {
      var c = websiteCatch(e, categories);
      if (c) list.push(c);
    });
    (extRecent || []).forEach(function (e) {
      if (!e) return;
      list.push({ label: e.label, outcome: e.outcome, site: e.site, time: e.time, source: 'extension' });
    });
    list.sort(function (a, b) { return b.time - a.time; });
    return list.slice(0, limit || 8);
  }

  global.DatoDashboard = {
    SEVERITIES: SEVERITIES,
    isScan: isScan,
    activeDays: activeDays,
    status: status,
    summarize: summarize,
    dailyTrend: dailyTrend,
    trendChart: trendChart,
    bars: bars,
    stacked: stacked,
    describe: describe,
    breachText: breachText,
    timeAgo: timeAgo,
    startOfDay: startOfDay,
    stops: stops,
    hero: hero,
    passwordAlert: passwordAlert,
    sentAnyway: sentAnyway,
    catchLabel: catchLabel,
    catchOutcome: catchOutcome,
    websiteCatch: websiteCatch,
    mergeCatches: mergeCatches,
    WEEK: WEEK,
    HASH_TO_TAB: HASH_TO_TAB,
    tabFor: tabFor,
    canonicalHash: canonicalHash,
    isCanonicalHash: isCanonicalHash,
    shouldReplaceHash: shouldReplaceHash,
    NAME_MAX: NAME_MAX,
    sanitizeName: sanitizeName,
    displayName: displayName,
    clockTime: clockTime,
    catchMeta: catchMeta
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) { module.exports = globalThis.DatoDashboard; }

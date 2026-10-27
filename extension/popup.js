/* Dato popup: policies, strict mode and the honest status of the current tab.
 * Reads/changes chrome.storage.local category keys and dato_settings.
 */
(function () {
  'use strict';
  var P = window.DatoPolicy;
  var META = {
    secrets: ['Secrets & credentials', 'API keys, tokens, passwords, private keys'],
    pii: ['Personal data', 'SSNs, card numbers, emails, phones, addresses'],
    financial: ['Financial data', 'IBANs, account numbers, company figures'],
    source: ['Source code', 'Whole-prompt code detection'],
    contract: ['Contracts & legal', 'Agreement and legal language'],
    sensitive: ['Sensitive context', '"Confidential", "internal only" and similar']
  };
  var SUPPORTED = { 'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'claude.ai': 'Claude', 'gemini.google.com': 'Gemini' };
  var STATUS_TITLE = { active: 'Active', degraded: 'Degraded', error: 'Error', unsupported: 'Not protected here', checking: 'Checking…' };

  var root = document.getElementById('policies');
  var strictBox = document.getElementById('strict');
  var saved = document.getElementById('saved');
  var savedTimer = 0;

  function note(text) { saved.textContent = text; clearTimeout(savedTimer); savedTimer = setTimeout(function () { saved.textContent = ''; }, 2500); }

  function policyRow(key, value) {
    var id = 'policy-' + key;
    var row = document.createElement('div');
    row.className = 'policy';
    var label = document.createElement('label');
    label.htmlFor = id;
    label.innerHTML = '<strong></strong><span></span>';
    label.querySelector('strong').textContent = META[key][0];
    label.querySelector('span').textContent = META[key][1];
    var select = document.createElement('select');
    select.id = id;
    P.ACTIONS.forEach(function (a) {
      var o = document.createElement('option');
      o.value = a; o.textContent = a.charAt(0).toUpperCase() + a.slice(1);
      select.appendChild(o);
    });
    select.value = value;
    select.dataset.action = value;
    select.addEventListener('change', function () {
      var update = {}; update[key] = select.value;
      select.dataset.action = select.value;
      chrome.storage.local.set(update, function () { note(META[key][0] + ': ' + select.value + '. Applies to open tabs now.'); });
    });
    row.append(label, select);
    return row;
  }

  // Reads policies; changes the policy list.
  function render(all) {
    var policies = P.cleanPolicies(all);
    root.textContent = '';
    P.CATEGORY_KEYS.forEach(function (k) { root.appendChild(policyRow(k, policies[k])); });
    strictBox.checked = P.cleanSettings(all.dato_settings).strict;
  }

  function load() { chrome.storage.local.get(null, render); }

  strictBox.addEventListener('change', function () {
    chrome.storage.local.get('dato_settings', function (all) {
      var s = P.cleanSettings(all.dato_settings);
      s.strict = strictBox.checked;
      chrome.storage.local.set({ dato_settings: s }, function () { note(s.strict ? 'Strict mode on. Send anyway is removed.' : 'Strict mode off.'); });
    });
  });

  document.getElementById('reset').addEventListener('click', function () {
    chrome.storage.local.set(P.DEFAULT_POLICIES, function () { load(); note('Policies reset to defaults.'); });
  });

  function showStatus(state, detail) {
    var el = document.getElementById('status');
    el.dataset.state = state;
    document.getElementById('status-title').textContent = STATUS_TITLE[state] || state;
    document.getElementById('status-detail').textContent = detail;
  }

  // Asks the tab's content script for its real editor and listener checks.
  function checkTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      var host = '';
      try { host = new URL(tab.url).hostname; } catch (e) { host = ''; }
      if (!SUPPORTED[host]) { showStatus('unsupported', 'Dato only checks ChatGPT, Claude and Gemini. Prompts on this site are not checked.'); return; }
      chrome.tabs.sendMessage(tab.id, { type: 'dato:status' }, function (res) {
        if (chrome.runtime.lastError || !res) { showStatus('error', 'Dato is not running in this tab. Refresh the page to start protection.'); return; }
        showStatus(res.state, res.detail);
      });
    });
  }

  load();
  checkTab();
})();

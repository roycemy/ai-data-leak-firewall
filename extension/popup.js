/* Dato popup: wires the shared popup view (ui.js) to chrome.storage.local and
 * the current tab's real status. Reads/changes category keys and dato_settings.
 */
(function () {
  'use strict';
  var P = window.DatoPolicy, UI = window.DatoUI;
  var SUPPORTED = { 'chatgpt.com': 1, 'chat.openai.com': 1, 'claude.ai': 1, 'gemini.google.com': 1 };
  var app = document.getElementById('app');
  var saved = document.getElementById('saved');
  var savedTimer = 0;

  function note(text) { saved.textContent = text; clearTimeout(savedTimer); savedTimer = setTimeout(function () { saved.textContent = ''; }, 2500); }

  var handlers = {
    onPolicy: function (key, value) {
      var update = {}; update[key] = value;
      chrome.storage.local.set(update, function () { note(UI.CATEGORY_NAMES[key] + ': ' + value + '. Open tabs use it now.'); });
    },
    onStrict: function (on) {
      chrome.storage.local.get('dato_settings', function (all) {
        var s = P.cleanSettings(all.dato_settings);
        s.strict = on;
        chrome.storage.local.set({ dato_settings: s }, function () { note(on ? 'Strict mode on. Send anyway is removed.' : 'Strict mode off.'); });
      });
    },
    onReset: function () { chrome.storage.local.set(P.DEFAULT_POLICIES, function () { load(true); note('Policies reset to defaults.'); }); }
  };

  // Reads storage; replaces the popup view.
  function load(keepOpen) {
    chrome.storage.local.get(null, function (all) {
      app.textContent = '';
      app.appendChild(UI.popupView({
        status: { state: 'checking', detail: '' },
        policies: P.cleanPolicies(all), strict: P.cleanSettings(all.dato_settings).strict,
        dashboardHref: 'dashboard.html', handlers: handlers, openPolicies: !!keepOpen
      }));
      checkTab();
    });
  }

  // Asks the tab's content script for its real editor and listener checks.
  function checkTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0], host = '';
      try { host = new URL(tab.url).hostname; } catch (e) { host = ''; }
      if (!SUPPORTED[host]) { UI.setStatus(app, { state: 'unsupported', detail: 'Dato only checks ChatGPT, Claude and Gemini. Prompts on this site are not checked.' }); return; }
      chrome.tabs.sendMessage(tab.id, { type: 'dato:status' }, function (res) {
        if (chrome.runtime.lastError || !res) { UI.setStatus(app, { state: 'error', detail: 'Dato is not running in this tab. Refresh the page to start protection.' }); return; }
        UI.setStatus(app, { state: res.state, detail: res.detail });
      });
    });
  }

  load(false);
})();

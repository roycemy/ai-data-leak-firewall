/* Behaviour of the fixture chat pages: the parts of a real chat UI that
 * matter to Dato. Enter sends (Shift+Enter is a newline, IME Enter is
 * ignored), the send button is disabled while empty, ChatGPT's composer is a
 * form, and "New chat" swaps the composer without a page load. */
(function () {
  'use strict';
  var host = document.body.dataset.host;
  var dock = document.getElementById('dock');
  var original = dock.innerHTML;

  function editor() { return dock.querySelector('[contenteditable="true"], textarea'); }
  function button() { return dock.querySelector('button'); }
  function text(el) { return el.tagName === 'TEXTAREA' ? el.value : el.innerText; }

  function post(t) {
    var m = document.createElement('div');
    m.className = 'msg';
    m.textContent = t;
    document.getElementById('transcript').appendChild(m);
    return fetch('/mock/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t, path: location.pathname }) });
  }

  function clear(el) { if (el.tagName === 'TEXTAREA') el.value = ''; else el.innerHTML = ''; sync(); }

  function send() {
    var el = editor();
    var t = text(el).trim();
    if (!t) return;
    post(t);
    clear(el);
  }

  function sync() { var b = button(), el = editor(); if (b && el) b.disabled = !text(el).trim(); }

  function wire() {
    var el = editor(), b = button();
    if (!el) return;
    el.addEventListener('input', sync);
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      send();
    });
    if (b && host !== 'chatgpt.com') b.addEventListener('click', send);
    var form = dock.querySelector('form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); send(); });
    sync();
  }

  // Single-page navigation: new URL, brand-new composer element.
  document.getElementById('new-chat').addEventListener('click', function (e) {
    e.preventDefault();
    history.pushState({}, '', '/c/' + Date.now());
    document.getElementById('transcript').textContent = '';
    dock.innerHTML = original;
    wire();
  });

  // Test hook: an editor that refuses programmatic replacement, to prove a
  // failed redaction never sends.
  window.__fixtureRejectWrites = function () {
    var el = editor(), keep = text(el);
    new MutationObserver(function () { if (text(el) !== keep && text(el).indexOf('[REDACTED') !== -1) el.innerText = keep; })
      .observe(el, { childList: true, subtree: true, characterData: true });
  };

  wire();
})();

/* Dato site adapters.
 * One adapter per supported AI chat: where the prompt editor is, which
 * controls send it, and how to read and write its text. The controller in
 * content.js looks the editor up fresh on every send, so editors the site
 * replaces during navigation are still found.
 *
 * Selectors are checked against local fixture pages that copy each site's
 * known markup. Real sites change; health checks report when they stop matching.
 */
(function (global) {
  'use strict';

  var ADAPTERS = [
    { id: 'chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'],
      editors: ['#prompt-textarea[contenteditable="true"]', 'div.ProseMirror[contenteditable="true"]', 'textarea#prompt-textarea', 'form textarea[name="prompt-textarea"]'],
      sends: ['button[data-testid="send-button"]', '#composer-submit-button', 'button[aria-label="Send prompt"]'] },
    { id: 'claude', name: 'Claude', hosts: ['claude.ai'],
      editors: ['fieldset div.ProseMirror[contenteditable="true"]', 'div.ProseMirror[contenteditable="true"]', '[data-testid="chat-input"][contenteditable="true"]'],
      sends: ['button[aria-label="Send message" i]', 'button[aria-label="Send Message"]', 'fieldset button[type="submit"]'] },
    { id: 'gemini', name: 'Gemini', hosts: ['gemini.google.com'],
      editors: ['rich-textarea div.ql-editor[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]', 'rich-textarea textarea'],
      sends: ['button.send-button', 'button[aria-label="Send message" i]', 'button[aria-label*="Send" i][mattooltip]'] }
  ];

  var GENERIC_EDITABLE = 'textarea, [contenteditable="true"], [contenteditable="plaintext-only"]';
  var GENERIC_SEND = ['button[data-testid*="send" i]', 'button[aria-label*="send" i]', 'form button[type="submit"]'];

  function register(adapter) { ADAPTERS.push(adapter); }

  function forHost(host) {
    for (var i = 0; i < ADAPTERS.length; i++) {
      if (ADAPTERS[i].hosts.indexOf(host) !== -1) return ADAPTERS[i];
    }
    return null;
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  function isEditable(el) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return !el.disabled && !el.readOnly;
    return el.isContentEditable;
  }

  function firstMatch(doc, selectors, accept) {
    for (var i = 0; i < selectors.length; i++) {
      var nodes;
      try { nodes = doc.querySelectorAll(selectors[i]); } catch (e) { continue; }
      for (var j = 0; j < nodes.length; j++) if (accept(nodes[j])) return nodes[j];
    }
    return null;
  }

  /* findEditor -> { el, confidence: 'specific' | 'generic' } or null.
   * 'generic' means the site markup no longer matches the adapter. */
  function findEditor(adapter, doc) {
    var ok = function (el) { return isVisible(el) && isEditable(el); };
    var el = firstMatch(doc, adapter.editors, ok);
    if (el) return { el: el, confidence: 'specific' };
    var all = doc.querySelectorAll(GENERIC_EDITABLE), best = null, bottom = -Infinity;
    for (var i = 0; i < all.length; i++) {
      if (!ok(all[i])) continue;
      var b = all[i].getBoundingClientRect().bottom;
      if (b > bottom) { bottom = b; best = all[i]; }
    }
    return best ? { el: best, confidence: 'generic' } : null;
  }

  /* The editor the user is typing in, if the event came from inside one. */
  function editorFromTarget(adapter, target) {
    if (!target || !target.closest) return null;
    var sels = adapter.editors.concat([GENERIC_EDITABLE]);
    for (var i = 0; i < sels.length; i++) {
      var hit = null;
      try { hit = target.closest(sels[i]); } catch (e) { hit = null; }
      if (hit && isEditable(hit)) {
        // Walk up to the outermost editable root so nested paragraphs map to the editor.
        while (hit.parentElement && hit.parentElement.isContentEditable) hit = hit.parentElement;
        return hit;
      }
    }
    return null;
  }

  function sendSelectors(adapter) { return adapter.sends.concat(GENERIC_SEND); }

  function isSendControl(adapter, target) {
    var btn = target && target.closest ? target.closest('button, [role="button"]') : null;
    if (!btn) return null;
    var sels = sendSelectors(adapter);
    for (var i = 0; i < sels.length; i++) {
      try { if (btn.matches(sels[i])) return btn; } catch (e) { /* bad selector */ }
    }
    return null;
  }

  /* findSend(adapter, editor) -> { el, confidence } or null. Prefers a control
   * that shares a form or container with the editor. */
  function findSend(adapter, editor) {
    var specific = true, found = [];
    var collect = function (sels) {
      sels.forEach(function (s) {
        var nodes; try { nodes = document.querySelectorAll(s); } catch (e) { return; }
        for (var i = 0; i < nodes.length; i++) if (isVisible(nodes[i]) && found.indexOf(nodes[i]) === -1) found.push(nodes[i]);
      });
    };
    collect(adapter.sends);
    if (!found.length) { specific = false; collect(GENERIC_SEND); }
    if (!found.length) return null;
    var scope = editor && (editor.closest('form') || editor.closest('fieldset'));
    var pick = null;
    if (scope) for (var i = 0; i < found.length; i++) if (scope.contains(found[i])) { pick = found[i]; break; }
    if (!pick && editor) {
      var er = editor.getBoundingClientRect(), best = Infinity;
      found.forEach(function (b) {
        var br = b.getBoundingClientRect();
        var d = Math.abs(br.top - er.bottom) + Math.abs(br.left - er.right);
        if (d < best) { best = d; pick = b; }
      });
    }
    return { el: pick || found[0], confidence: specific ? 'specific' : 'generic' };
  }

  function readText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value;
    return el.innerText || el.textContent || '';
  }

  function normalize(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  function writeNative(el, text) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* Replace the whole editor content through the editing pipeline, so rich
   * editors (ProseMirror, Quill) update their own state. */
  function writeRich(el, text) {
    el.focus();
    var sel = el.ownerDocument.getSelection();
    var range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = el.ownerDocument.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok || normalize(readText(el)) !== normalize(text)) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }));
    }
  }

  /* writeText -> true only if reading the editor back gives the new text. */
  function writeText(el, text) {
    try {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') writeNative(el, text);
      else writeRich(el, text);
    } catch (e) { return false; }
    return normalize(readText(el)) === normalize(text);
  }

  var api = {
    ADAPTERS: ADAPTERS, register: register, forHost: forHost,
    findEditor: findEditor, editorFromTarget: editorFromTarget,
    findSend: findSend, isSendControl: isSendControl,
    readText: readText, writeText: writeText, normalize: normalize, isVisible: isVisible
  };
  global.DatoAdapters = api;
})(typeof window !== 'undefined' ? window : globalThis);

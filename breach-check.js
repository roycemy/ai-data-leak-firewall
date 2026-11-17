/* AI Firewall: breach check (Mini Project 3)
 *
 * Checks whether a password found in a prompt already appears in known data
 * breaches, using Have I Been Pwned's free Pwned Passwords "range" API:
 *   https://haveibeenpwned.com/API/v3#PwnedPasswords
 *
 * Privacy ("k-anonymity"): the password is hashed with SHA-1 in the browser.
 * Only the FIRST 5 characters of that hash are sent. The API answers with every
 * known hash that starts with those 5 characters, and the matching happens
 * here, in the browser. The password and its full hash never leave this page
 * and are never saved. No API key is needed.
 *
 * Runs in the browser (window.DatoBreach) and in Node for the tests.
 */
(function (global) {
  'use strict';

  var RANGE_URL = 'https://api.pwnedpasswords.com/range/';

  // Detector rules (detectors.js) whose findings can contain a password.
  var PASSWORD_RULES = ['credential-named', 'hardcoded-password'];
  // Pulls the value out of text like: password is X / password: X / pwd = "X".
  // Only these words count as passwords. "api_key = ..." is a secret, not a password.
  var PASSWORD_VALUE = /^(?:password|passwd|pwd|passcode|passphrase)["'\s]*(?:is|=|:)["'\s]*([^\s"',;]+)/i;

  /* passwordsFrom(text, findings) -> [{ findingIndex, password }]
   * Reads the scanned text and the findings from DatoDetect.scan. Changes nothing.
   * The same password written twice is only listed (and checked) once. */
  function passwordsFrom(text, findings) {
    var out = [];
    findings.forEach(function (f, i) {
      if (PASSWORD_RULES.indexOf(f.ruleId) === -1 || !f.length) return;
      var m = PASSWORD_VALUE.exec(text.slice(f.index, f.index + f.length));
      if (!m) return;
      var password = m[1].replace(/[.!?]+$/, ''); // drop a full stop at the end of a sentence
      // Skip it if the same password is already in the list. (A plain {} lookup
      // would wrongly match built-in names like "constructor" or "toString".)
      if (!password || out.some(function (p) { return p.password === password; })) return;
      out.push({ findingIndex: i, password: password });
    });
    return out;
  }

  /* sha1Hex(text) -> Promise of 40 upper-case hex characters.
   * crypto.subtle is the browser's built-in crypto library (no download). */
  async function sha1Hex(text) {
    var bytes = new TextEncoder().encode(text);                // text -> bytes (UTF-8)
    var digest = await crypto.subtle.digest('SHA-1', bytes);   // bytes -> 20-byte hash
    return Array.from(new Uint8Array(digest))
      .map(function (b) { return b.toString(16).padStart(2, '0'); }) // each byte -> 2 hex chars
      .join('')
      .toUpperCase();                                          // the API uses upper case
  }

  /* countForSuffix(body, suffix) -> number
   * body is the API's plain-text answer, one "SUFFIX:COUNT" line per hash, e.g.
   *   1E4C9B93F3F0682250B6CF8331B7EE68FD8:52373976
   * Returns the count on the line whose suffix matches, or 0 if none does
   * (0 means "not found in known breaches"). */
  function countForSuffix(body, suffix) {
    var lines = String(body).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].trim().split(':');           // ["SUFFIX", "COUNT"]
      if (parts.length === 2 && parts[0].toUpperCase() === suffix.toUpperCase()) {
        return parseInt(parts[1], 10) || 0;
      }
    }
    return 0;
  }

  /* checkPassword(password) -> Promise of { ok: true, count } or { ok: false, error }
   * Never throws: every failure becomes { ok: false } so the page can say so
   * while the normal local scan keeps working. */
  async function checkPassword(password) {
    if (!global.crypto || !global.crypto.subtle) {
      return { ok: false, error: 'this browser cannot hash the password on this page (open the site over https)' };
    }
    try {
      var hash = await sha1Hex(password);
      var prefix = hash.slice(0, 5);   // the only part that is sent
      var suffix = hash.slice(5);      // stays here; we look for it in the answer

      // await pauses this function until the API answers. fetch only throws
      // (jumping to catch) when there is no answer at all: offline, DNS, CORS.
      var response = await fetch(RANGE_URL + prefix);

      // A 404, 429 or 503 is still "an answer", so fetch does NOT throw.
      // response.ok is true only for status 200-299, so check it ourselves.
      if (!response.ok) {
        return { ok: false, error: 'Have I Been Pwned answered with status ' + response.status };
      }

      var body = await response.text();          // the "SUFFIX:COUNT" lines
      return { ok: true, count: countForSuffix(body, suffix) };
    } catch (err) {
      var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      return { ok: false, error: offline ? 'you appear to be offline' : 'could not reach Have I Been Pwned' };
    }
  }

  /* checkAll(found) -> Promise of { checked, breached, results: [{findingIndex, count}], error }
   * Checks each password one after another and works out the totals.
   * Stops at the first failure and returns its error. */
  async function checkAll(found) {
    var results = [];
    for (var i = 0; i < found.length; i++) {
      var answer = await checkPassword(found[i].password);
      if (!answer.ok) return { checked: 0, breached: 0, results: [], error: answer.error };
      results.push({ findingIndex: found[i].findingIndex, count: answer.count });
    }
    var breached = results.filter(function (r) { return r.count > 0; }).length;
    return { checked: results.length, breached: breached, results: results, error: null };
  }

  global.DatoBreach = {
    RANGE_URL: RANGE_URL,
    passwordsFrom: passwordsFrom,
    sha1Hex: sha1Hex,
    countForSuffix: countForSuffix,
    checkPassword: checkPassword,
    checkAll: checkAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) { module.exports = globalThis.DatoBreach; }

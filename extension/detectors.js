/* AI Firewall Detection Engine
 * Local-first confidential-data detection for prompts and files.
 * All inspection runs in the browser. Nothing is transmitted.
 */
(function (global) {
  'use strict';

  var CATEGORIES = {
    secrets:   { label: 'Secrets & Credentials', weight: 3 },
    pii:       { label: 'Personal Data (PII)',   weight: 2 },
    financial: { label: 'Financial Data',        weight: 2 },
    source:    { label: 'Proprietary Source Code', weight: 2 },
    contract:  { label: 'Contracts & Legal',     weight: 1 },
    sensitive: { label: 'Sensitive Context',     weight: 1 }
  };

  // Words that follow "password is" in ordinary sentences, not values.
  var COMMON_WORDS = /^(?:required|requires|needed|missing|incorrect|invalid|wrong|expired|changed|reset|stored|hashed|encrypted|optional|empty|blank|correct|secure|strong|weak|longer|shorter|different|protected|saved|visible|hidden|enabled|disabled|something|anything|nothing|usually|always|never|probably|actually|another|forgotten|sensitive|private|unknown|generated|rotated|managed|shared|working|accepted|rejected|set|not|the|this|that|your|mine|ours|theirs)$/i;

  var SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };

  // Each rule: id, category, severity, label, pattern (global regex) or detect(text) -> [{index, match}]
  var RULES = [
    // ---- Secrets & credentials ----
    { id: 'aws-access-key', category: 'secrets', severity: 'critical', label: 'AWS access key ID',
      pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[0-9A-Z]{16}\b/g },
    { id: 'github-token', category: 'secrets', severity: 'critical', label: 'GitHub token',
      pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}\b/g },
    { id: 'openai-key', category: 'secrets', severity: 'critical', label: 'OpenAI API key',
      pattern: /\bsk-(?:proj-)?[A-Za-z0-9_\-]{24,}\b/g },
    { id: 'anthropic-key', category: 'secrets', severity: 'critical', label: 'Anthropic API key',
      pattern: /\bsk-ant-[A-Za-z0-9_\-]{24,}\b/g },
    { id: 'slack-token', category: 'secrets', severity: 'critical', label: 'Slack token',
      pattern: /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/g },
    { id: 'stripe-live-key', category: 'secrets', severity: 'critical', label: 'Stripe live key',
      pattern: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/g },
    { id: 'google-api-key', category: 'secrets', severity: 'critical', label: 'Google API key',
      pattern: /\bAIza[0-9A-Za-z_\-]{35}\b/g },
    { id: 'jwt', category: 'secrets', severity: 'high', label: 'JSON Web Token',
      pattern: /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g },
    { id: 'private-key-block', category: 'secrets', severity: 'critical', label: 'Private key block',
      pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g },
    { id: 'db-connection-string', category: 'secrets', severity: 'critical', label: 'Database connection string',
      pattern: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s"'@:]+:[^\s"'@]+@[^\s"']+/gi },
    { id: 'hardcoded-password', category: 'secrets', severity: 'high', label: 'Hardcoded password or secret assignment',
      pattern: /(?:password|passwd|pwd|api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)["'\s]*[:=]["'\s]*["'][^"'\s]{8,}["']/gi },
    { id: 'basic-auth-url', category: 'secrets', severity: 'high', label: 'Credentials in URL',
      pattern: /https?:\/\/[^/\s:@]+:[^/\s@]+@[^/\s]+/gi },

    // ---- Broadened coverage: tentative rules warn instead of hard-blocking ----
    { id: 'partial-aws-key', category: 'secrets', severity: 'medium', tentative: true, label: 'Partial or shortened AWS-style key ID',
      pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[0-9A-Z]{8,15}\b/g },
    { id: 'partial-openai-key', category: 'secrets', severity: 'medium', tentative: true, label: 'Partial or shortened OpenAI-style key',
      pattern: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_\-]{8,23}\b/g },
    { id: 'credential-named', category: 'secrets', severity: 'high', tentative: true, label: 'Credential named in plain language',
      detect: function (text) {
        // "password is X" only counts when X looks like a value, not a word in a sentence.
        var out = [];
        var re = /\b(?:password|passcode|passphrase|pin|api[ _-]?key|secret[ _-]?key|access[ _-]?token|auth[ _-]?token|session[ _-]?token|private[ _-]?key|ssn|social security(?:\s*number)?|credit[ _-]?card(?:\s*number)?|card[ _-]?number|cvv|cvc|security[ _-]?code|routing[ _-]?number|bank[ _-]?account(?:\s*number)?)\b\s*(?:is|=|:|->|-)\s*([^\s,;]{3,})/gi, m;
        while ((m = re.exec(text)) !== null) {
          var value = m[1].replace(/[.!?]+$/, '');
          if (valueIsStructuredId(value)) continue;
          var wordy = /^[A-Za-z]+$/.test(value);
          if (wordy && (value.length < 6 || COMMON_WORDS.test(value))) continue;
          out.push({ index: m.index, match: m[0], value: value });
        }
        return out;
      } },
    { id: 'implied-secret', category: 'secrets', severity: 'high', label: 'Credential named in plain language',
      detect: function (text) { return detectImpliedSecret(text); } },
    { id: 'unknown-token', category: 'secrets', severity: 'medium', tentative: true, label: 'Possible key or token (unrecognized format)',
      detect: function (text) {
        var out = [];
        var re = /\b[A-Za-z0-9_\-]{24,}\b/g, m;
        while ((m = re.exec(text)) !== null) {
          var s = m[0];
          if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/\d/.test(s)) continue; // mixed case + digits
          if (/(.)\1{4,}/.test(s)) continue; // repeated runs are not keys
          out.push({ index: m.index, match: s });
          if (out.length >= 5) break;
        }
        return out;
      } },

    // ---- PII ----
    { id: 'personal-fact-named', category: 'pii', severity: 'medium', tentative: true, label: 'Personal detail named in plain language',
      pattern: /\b(?:my|her|his|their|our)\s+(?:salary|compensation|date of birth|birthday|social security|ssn|passport|driver'?s?\s*license|medical record|diagnosis|prescription|home address)\b\s*(?:is|=|:)\s*[^\s,;]{2,}/gi },
    { id: 'ssn', category: 'pii', severity: 'critical', label: 'US Social Security number',
      detect: function (text) { return detectSsn(text); } },
    { id: 'email-address', category: 'pii', severity: 'medium', label: 'Email address',
      detect: function (text) { return detectEmail(text); }, maxFindings: 25 },
    { id: 'us-phone', category: 'pii', severity: 'medium', label: 'US phone number',
      pattern: /\b(?:\+1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/g, maxFindings: 25 },
    { id: 'date-of-birth', category: 'pii', severity: 'high', label: 'Date of birth',
      pattern: /(?:DOB|date of birth|born on)[:\s]*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/gi },
    { id: 'passport-number', category: 'pii', severity: 'high', label: 'Passport number',
      pattern: /(?:passport)(?:\s*(?:number|no|#))?[:\s]*[A-Z0-9]{6,9}\b/gi },
    { id: 'drivers-license', category: 'pii', severity: 'high', label: "Driver's license",
      pattern: /(?:driver'?s?\s*license|DL)(?:\s*(?:number|no|#))?[:\s]*[A-Z0-9\-]{5,15}\b/gi },
    { id: 'street-address', category: 'pii', severity: 'medium', label: 'Street address',
      pattern: /\b\d{1,6}\s+[A-Z][A-Za-z0-9.]*(?:\s+[A-Z][A-Za-z0-9.]*){0,3}\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace)\b(?:\s*(?:Apt|Suite|Ste|Unit|#)\s*[A-Za-z0-9\-]+)?/g, maxFindings: 15 },
    { id: 'credit-card', category: 'pii', severity: 'critical', label: 'Payment card number (Luhn-valid)',
      detect: function (text) {
        var out = [];
        var re = /\b(?:\d[ \-]?){13,19}\b/g, m;
        while ((m = re.exec(text)) !== null) {
          var digits = m[0].replace(/[ \-]/g, '');
          if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
            out.push({ index: m.index, match: m[0] });
          }
        }
        return out;
      }, maxFindings: 10 },

    // ---- Financial ----
    { id: 'iban', category: 'financial', severity: 'high', label: 'IBAN',
      pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/g },
    { id: 'routing-number', category: 'financial', severity: 'high', label: 'Bank routing / account detail',
      pattern: /(?:routing(?:\s*(?:number|no|#))?|acct(?:ount)?(?:\s*(?:number|no|#))?)[:\s]*\d{8,17}\b/gi },
    { id: 'financial-figures', category: 'financial', severity: 'medium', tentative: true, label: 'Confidential financial figure',
      pattern: /(?:revenue|ARR|MRR|EBITDA|net income|gross margin|payroll|salary|compensation|valuation|funding round|burn rate|runway)[^\n.]{0,60}\$[\d,.]+(?:\s?[KMB])?/gi, maxFindings: 15 },
    { id: 'invoice-reference', category: 'financial', severity: 'low', label: 'Invoice / billing reference',
      pattern: /\b(?:invoice|billing|purchase order)\b\s*(?:number|no\.?|#)?\s*:?\s*(?=[A-Z0-9\-]*\d)[A-Z0-9][A-Z0-9\-]{4,}|\bPO\s*#?\s*:?\s*\d{4,}/gi, maxFindings: 15 }
  ];

  // Heuristic category detectors (no single span; report whole-region findings)
  function detectSourceCode(text) {
    var signals = 0;
    var lines = text.split('\n');
    var codeLineHits = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^\s*(import |from \S+ import|const |let |var |function |def |class |public |private |#include|package |fn |func )/.test(l)) codeLineHits++;
      if (/[;{}]\s*$/.test(l) && /\S/.test(l)) codeLineHits += 0.5;
    }
    if (/\bfunction\s*\(|\)\s*=>\s*{|if\s*\(.+\)\s*{|catch\s*\(/.test(text)) signals += 2;
    if (/\b(import|require|export|module\.exports|public static void|console\.log|System\.out)\b/.test(text)) signals += 2;
    var density = codeLineHits / Math.max(lines.length, 1);
    if (density > 0.25) signals += 2;
    // One pasted line is a question about code, not a codebase. Ask for a real block.
    var codeLines = lines.filter(function (x) { return /\S/.test(x); }).length;
    if (signals >= 3 && text.length > 80 && codeLines >= 4) {
      return [{ index: 0, match: text.slice(0, 120) + (text.length > 120 ? '…' : ''), heuristic: true }];
    }
    return [];
  }

  function detectContract(text) {
    // Whole words only: a substring test for "nda" matched "Monday" and "agenda".
    var terms = [/\bnon-disclosure\b/i, /\bNDA\b/, /\bhereinafter\b/i, /\bindemnif/i, /\bgoverning law\b/i, /\bconfidentiality\b/i,
      /\bparty of the first part\b/i, /\btermination clause\b/i, /\blimitation of liability\b/i,
      /\bagreement is entered\b/i, /\bin witness whereof\b/i, /\bforce majeure\b/i, /\bbinding arbitration\b/i, /\bseverability\b/i];
    var hits = [];
    for (var i = 0; i < terms.length; i++) {
      var m = terms[i].exec(text);
      if (m) hits.push(m.index);
    }
    hits.sort(function (a, b) { return a - b; });
    if (hits.length >= 2) {
      return [{ index: hits[0], match: text.slice(hits[0], hits[0] + 120) + '…', heuristic: true }];
    }
    return [];
  }

  // Labels people put on confidential material. A bare "confidential", "restricted" or "proprietary" in an
  // ordinary sentence ("the meeting is confidential", "a proprietary algorithm") is not enough on its own.
  var SENSITIVE_PHRASES = /\b(?:internal use only|internal only|do not (?:share|distribute|forward)|not for (?:distribution|external use)|under (?:an )?nda|non-disclosure agreement|trade secrets?|private and confidential|strictly confidential|company confidential|confidential (?:and proprietary|information|document|material)|proprietary (?:and|&) confidential|proprietary information|classified (?:information|document|material))\b|^\s*confidential\s*[:\-\u2013\u2014]/im;
  var ALL_CAPS_LABEL = /\bCONFIDENTIAL\b/; // case-sensitive, so a lowercase "confidential" does not match

  function detectSensitiveContext(text) {
    var hits = [];
    var m = SENSITIVE_PHRASES.exec(text) || ALL_CAPS_LABEL.exec(text);
    if (m) hits.push(m.index);
    if (hits.length >= 1 && text.length > 20) {
      return [{ index: hits[0], match: text.slice(hits[0], hits[0] + 120) + '\u2026', heuristic: true }];
    }
    return [];
  }


  function isHighEntropy(value) {
    if (!value || value.length < 8) return false;
    if (/^[A-Za-z]+$/.test(value)) return false;
    if (typeof ORDINARY_WORDS !== 'undefined' && ORDINARY_WORDS.test(value)) return false;
    if (typeof COMMON_WORDS !== 'undefined' && COMMON_WORDS.test(value)) return false;
    var classes = 0;
    if (/[a-z]/.test(value)) classes++;
    if (/[A-Z]/.test(value)) classes++;
    if (/\d/.test(value)) classes++;
    if (/[^A-Za-z0-9]/.test(value)) classes++;
    return classes >= 3;
  }

  // SSNs and Luhn-valid cards already have their own rules; "SSN is 123-45-6789" is not also a named password.
  function valueIsStructuredId(value) {
    var v = String(value || '').replace(/[.,;!?]+$/, '');
    var digits = v.replace(/[ \-]/g, '');
    if (/^\d{3}[ \-]?\d{2}[ \-]?\d{4}$/.test(v)) return true;
    if (digits.length >= 13 && digits.length <= 19 && /^\d+$/.test(digits) && luhnValid(digits)) return true;
    return false;
  }

  function emailIsInsideCredentialUrl(text, index) {
    return /[a-z][a-z0-9+\-.]*:\/\/[^\s"'<>]*:$/i.test(text.slice(0, index));
  }

  function detectSsn(text) {
    var out = [];
    var seen = {};
    function add(index, match) {
      var key = index + ':' + match;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ index: index, match: match });
    }
    var m;
    var dashed = /\b\d{3}-\d{2}-\d{4}\b/g;
    while ((m = dashed.exec(text)) !== null) add(m.index, m[0]);
    var context = /\b(?:social(?:\s+security(?:\s+number)?)?|ssn|tax(?:es)?|ein|tin|itin|nine\s+digits|9\s+digits)\b/i;
    function nearContext(index, len) {
      var from = Math.max(0, index - 60);
      var to = Math.min(text.length, index + len + 40);
      return context.test(text.slice(from, to));
    }
    var spaced = /\b\d{3} \d{2} \d{4}\b/g;
    while ((m = spaced.exec(text)) !== null) {
      if (nearContext(m.index, m[0].length)) add(m.index, m[0]);
    }
    var bare = /\b\d{9}\b/g;
    while ((m = bare.exec(text)) !== null) {
      if (nearContext(m.index, m[0].length)) add(m.index, m[0]);
    }
    return out;
  }

  function detectImpliedSecret(text) {
    var out = [];
    var cue = /\b(?:magic\s+word|passcode|passphrase|password|login|pin|creds|credentials|combo|secret)\b/gi, cueMatch;
    while ((cueMatch = cue.exec(text)) !== null) {
      var windowStart = cueMatch.index;
      var windowText = text.slice(windowStart, Math.min(text.length, windowStart + cueMatch[0].length + 80));
      var after = /(?:is|=|:)\s*([^\s,;]{6,})/i.exec(windowText);
      if (!after) continue;
      var value = after[1].replace(/[.!?]+$/, '');
      if (valueIsStructuredId(value) || !isHighEntropy(value)) continue;
      var fullEnd = windowStart + windowText.indexOf(after[0]) + after[0].length;
      if (fullEnd > 0 && after[0].slice(-1) && /[.,!?]/.test(text.charAt(fullEnd - 1))) fullEnd -= 1;
      var match = text.slice(windowStart, fullEnd);
      out.push({ index: windowStart, match: match, value: value });
    }
    return out;
  }

  function detectEmail(text) {
    var out = [];
    var re = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, m;
    while ((m = re.exec(text)) !== null) {
      if (emailIsInsideCredentialUrl(text, m.index)) continue;
      out.push({ index: m.index, match: m[0] });
    }
    return out;
  }

  function policyCategory(finding) {
    if (finding && (finding.ruleId === 'ssn' || finding.ruleId === 'credit-card')) return 'secrets';
    return finding ? finding.category : '';
  }

  var REDACT_NAMES = {
    'credit-card': 'CARD',
    'ssn': 'SSN',
    'email-address': 'EMAIL',
    'aws-access-key': 'AWS KEY',
    'github-token': 'GITHUB TOKEN',
    'openai-key': 'API KEY',
    'anthropic-key': 'API KEY',
    'slack-token': 'SLACK TOKEN',
    'stripe-live-key': 'API KEY',
    'google-api-key': 'API KEY',
    'jwt': 'TOKEN',
    'private-key-block': 'PRIVATE KEY',
    'db-connection-string': 'CONNECTION STRING',
    'hardcoded-password': 'PASSWORD',
    'basic-auth-url': 'CREDENTIALS',
    'credential-named': 'PASSWORD',
    'implied-secret': 'PASSWORD',
    'us-phone': 'PHONE',
    'date-of-birth': 'DATE OF BIRTH',
    'passport-number': 'PASSPORT',
    'drivers-license': 'LICENSE',
    'street-address': 'ADDRESS',
    'iban': 'IBAN',
    'routing-number': 'ACCOUNT',
    'financial-figures': 'FIGURE',
    'invoice-reference': 'INVOICE'
  };

  function redactToken(f) {
    var name = REDACT_NAMES[f.ruleId];
    if (!name) name = String(f.label || f.ruleId).replace(/\s*\(.*\)\s*/g, '').toUpperCase();
    return '[REDACTED ' + name + ']';
  }

  function luhnValid(digits) {
    var sum = 0, dbl = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var d = +digits[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d; dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  function maskSnippet(s) {
    if (s.length <= 8) return s[0] + '•'.repeat(Math.max(s.length - 2, 1)) + s[s.length - 1];
    return s.slice(0, 4) + '•'.repeat(Math.min(s.length - 8, 24)) + s.slice(-4);
  }

  /* scan(text, opts) -> { findings: [{ruleId, category, severity, label, index, match, masked, heuristic}] } */
  function scan(text) {
    var findings = [];
    if (!text) return { findings: findings };
    for (var r = 0; r < RULES.length; r++) {
      var rule = RULES[r];
      var matches = [];
      if (rule.detect) {
        matches = rule.detect(text);
      } else {
        rule.pattern.lastIndex = 0;
        var m;
        while ((m = rule.pattern.exec(text)) !== null) {
          matches.push({ index: m.index, match: m[0] });
          if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
        }
      }
      var cap = rule.maxFindings || 50;
      for (var i = 0; i < Math.min(matches.length, cap); i++) {
        findings.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          label: rule.label,
          index: matches[i].index,
          length: matches[i].match.length,
          masked: maskSnippet(matches[i].match),
          heuristic: false,
          tentative: !!rule.tentative
        });
      }
    }
    // Heuristics
    var code = detectSourceCode(text);
    for (var c = 0; c < code.length; c++) {
      findings.push({ ruleId: 'proprietary-source', category: 'source', severity: 'high',
        label: 'Proprietary source code', index: code[c].index, length: 0,
        masked: maskSnippet(code[c].match), heuristic: true, tentative: false });
    }
    var contract = detectContract(text);
    for (var k = 0; k < contract.length; k++) {
      findings.push({ ruleId: 'contract-language', category: 'contract', severity: 'medium',
        label: 'Contract or legal language', index: contract[k].index, length: 0,
        masked: maskSnippet(contract[k].match), heuristic: true, tentative: false });
    }
    var sens = detectSensitiveContext(text);
    for (var s = 0; s < sens.length; s++) {
      findings.push({ ruleId: 'sensitive-context', category: 'sensitive', severity: 'low',
        label: 'Confidential or restricted context', index: sens[s].index, length: 0,
        masked: maskSnippet(sens[s].match), heuristic: true, tentative: true });
    }
    // De-duplicate overlapping identical spans
    findings.sort(function (a, b) { return a.index - b.index || SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]; });
    var deduped = [];
    for (var f = 0; f < findings.length; f++) {
      var cur = findings[f];
      var dup = false;
      for (var d = 0; d < deduped.length; d++) {
        var prev = deduped[d];
        if (prev.length && cur.length && cur.index >= prev.index && cur.index < prev.index + prev.length && prev.category === cur.category) { dup = true; break; }
        if (!prev.length && cur.index === prev.index && prev.ruleId === cur.ruleId) { dup = true; break; }
      }
      if (!dup) deduped.push(cur);
    }
    return { findings: deduped };
  }

  /* redact(text, findings) -> redacted string with placeholders */
  function redact(text, findings) {
    var spans = findings.filter(function (f) { return f.length > 0; })
      .sort(function (a, b) { return b.index - a.index; });
    var out = text;
    for (var i = 0; i < spans.length; i++) {
      var f = spans[i];
      out = out.slice(0, f.index) + redactToken(f) + out.slice(f.index + f.length);
    }
    if (findings.some(function (f) { return f.heuristic && f.category === 'source'; })) {
      out = '[REDACTED · PROPRIETARY SOURCE CODE — share only the function or error message you need help with]\n\n' + out;
    }
    return out;
  }

  global.DatoDetect = {
    CATEGORIES: CATEGORIES,
    RULES: RULES.map(function (r) { return { id: r.id, category: r.category, severity: r.severity, label: r.label }; }),
    scan: scan,
    redact: redact,
    luhnValid: luhnValid,
    policyCategory: policyCategory
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) { module.exports = globalThis.DatoDetect; }


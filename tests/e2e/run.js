/* End-to-end tests: the real, unmodified extension in Chromium against local
 * fixture copies of ChatGPT, Claude and Gemini. These are FIXTURE tests: they
 * prove Dato's logic against markup modelled on each site, not against the
 * live sites, which change without notice.
 *
 * Usage: node tests/e2e/run.js            (screenshots go to tests/e2e/screenshots)
 *        DATO_CHROME=/path/to/chrome node tests/e2e/run.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Browser, sleep } = require('./cdp');
const server = require('./server');
const Store = require('../../extension/store.js');

const ROOT = path.resolve(__dirname, '../..');
const EXT = path.join(ROOT, 'extension');
const SHOTS = path.join(__dirname, 'screenshots');

// Synthetic values only.
const KEY = 'AKIAIOSFODNN7EXAMPLE';
const KEY2 = 'AKIAI44QH8DHBEXAMPLE';
const EMAIL = 'dana@example.com';
const SECRETS = [KEY, KEY2, EMAIL, 'AKIA', 'dana@', '4111', 'hunter2'];

const SITES = {
  'chatgpt.com': { editor: '#prompt-textarea', send: '#composer-submit-button' },
  'claude.ai': { editor: 'fieldset [contenteditable="true"]', send: 'fieldset button' },
  'gemini.google.com': { editor: '.ql-editor', send: '.send-button' }
};

function findChrome() {
  if (process.env.DATO_CHROME) return process.env.DATO_CHROME;
  const base = path.join(os.homedir(), process.platform === 'win32' ? 'AppData/Local/ms-playwright' : process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = path.join(base, d, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('No Chromium found. Set DATO_CHROME to a Chromium or Chrome for Testing binary (branded Chrome ignores --load-extension).');
}

function makeCert(dir) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'),
    '-days', '2', '-subj', '/CN=dato-fixture', '-addext', 'subjectAltName=DNS:chatgpt.com,DNS:claude.ai,DNS:gemini.google.com'], { stdio: 'ignore' });
}

const results = [];
async function t(name, fn) {
  const start = Date.now();
  try { await Promise.race([fn(), sleep(20000).then(() => { throw new Error('timed out after 20s'); })]); results.push({ name, ok: true, ms: Date.now() - start }); console.log('  ok   ' + name); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dato-e2e-'));
  fs.mkdirSync(SHOTS, { recursive: true });
  makeCert(tmp);
  const srv = await server.start(tmp, 0);
  const hostRules = Object.keys(SITES).map((h) => `MAP ${h} 127.0.0.1:${srv.port}`).concat(['MAP * ~NOTFOUND']).join(', ');
  const browser = await Browser.launch({ exe: findChrome(), userDataDir: path.join(tmp, 'profile'), extensionDir: EXT, hostRules });
  const id = await browser.extensionId('dashboard.html', 'Dato activity');
  const extUrl = (p) => `chrome-extension://${id}/${p}`;
  const ext = await browser.newPage(extUrl('dashboard.html'));

  const storage = () => ext.eval('chrome.storage.local.get(null)');
  const setStorage = (o) => ext.eval(`chrome.storage.local.set(${JSON.stringify(o)}).then(() => true)`);
  const resetPolicies = () => setStorage({ secrets: 'block', pii: 'warn', financial: 'warn', source: 'warn', contract: 'warn', sensitive: 'warn', dato_settings: { strict: false, retentionDays: 30 } });
  const events = async () => (await storage()).dato_events || [];
  const waitEvent = async (outcome, before) => {
    for (let i = 0; i < 60; i++) { const e = await events(); if (e.length > before && e.slice(before).some((x) => x.outcome === outcome)) return e; await sleep(50); }
    throw new Error('no ' + outcome + ' event recorded');
  };
  const tabStatus = (host) => ext.eval(`new Promise(r => chrome.tabs.query({ url: 'https://${host}/*' }, tabs => chrome.tabs.sendMessage(tabs[tabs.length - 1].id, { type: 'dato:status' }, res => r(res || { state: 'none' }))))`);

  async function open(host, query = '') {
    const p = await browser.newPage(`https://${host}/${query}`);
    const state = await p.waitFor(`(() => { const c = (document.getElementById('dato-sentinel') || {}).className; return c && c !== 'dato-checking' && c; })()`, 6000);
    p.host = host;
    p.state = state;
    return p;
  }
  const dialog = (p) => p.eval(`(() => { const m = document.getElementById('dato-modal'); if (!m) return null;
    const d = m.querySelector('.dato-dialog');
    return { action: [...d.classList].find(c => /^dato-(allow|warn|redact|block)$/.test(c)).slice(5),
      buttons: [...d.querySelectorAll('[data-dato]')].map(b => b.dataset.dato),
      msg: d.querySelector('.dato-msg').textContent, preview: (d.querySelector('.dato-preview') || {}).textContent || '',
      focused: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.dato : null }; })()`);
  const waitDialog = (p) => p.waitFor(`!!document.getElementById('dato-modal')`, 3000).then(() => dialog(p));
  const editorText = (p) => p.eval(`document.querySelector(${JSON.stringify(SITES[p.host].editor)}).innerText`);
  async function typeIn(p, text) { await p.focus(SITES[p.host].editor); await p.type(text); await sleep(60); }
  const sentCount = () => srv.sent.length;
  async function expectNothingSent(before, ms = 600) { await sleep(ms); assert(srv.sent.length === before, 'something was sent: ' + JSON.stringify(srv.sent.slice(before))); }
  async function expectSent(before, check) {
    for (let i = 0; i < 60 && srv.sent.length <= before; i++) await sleep(50);
    assert(srv.sent.length === before + 1, 'expected exactly one send, got ' + (srv.sent.length - before));
    const body = srv.sent[before].text;
    if (check) check(body);
    return body;
  }

  console.log('Dato fixture tests (local mock sites, no real AI services)\n');

  await t('dashboard starts empty with no fabricated numbers', async () => {
    await ext.waitFor(`document.querySelectorAll('.kpi').length === 5`);
    const nums = await ext.eval(`[...document.querySelectorAll('.kpi .num')].map(n => n.textContent)`);
    assert(nums.every((n) => n === '0'), 'non-zero KPI on empty store: ' + nums);
    const empty = await ext.eval(`document.getElementById('log').textContent`);
    assert(empty.includes('No activity recorded yet'), 'empty log text missing');
    const health = await ext.eval(`[...document.querySelectorAll('.health-card .state')].map(s => s.textContent)`);
    assert(health.every((h) => h === 'Not seen yet'), 'health should be unseen: ' + health);
    await ext.screenshot(path.join(SHOTS, '01-dashboard-empty.png'));
  });

  const pages = {};
  for (const host of Object.keys(SITES)) {
    await t(`${host}: adapter reports Active after real editor checks`, async () => {
      pages[host] = await open(host);
      assert(pages[host].state === 'dato-active', 'badge state ' + pages[host].state);
      const s = await tabStatus(host);
      assert(s.state === 'active', 'status ' + JSON.stringify(s));
    });
    await t(`${host}: clean prompt sends normally on Enter`, async () => {
      const p = pages[host], before = sentCount();
      await typeIn(p, 'Summarise the history of the printing press.');
      await p.key('Enter');
      await expectSent(before, (b) => assert(b === 'Summarise the history of the printing press.', 'sent ' + b));
      assert(!(await dialog(p)), 'dialog shown for clean prompt');
    });
    await t(`${host}: secret is blocked on Enter and nothing reaches the endpoint`, async () => {
      const p = pages[host], before = sentCount(), evBefore = (await events()).length;
      await typeIn(p, `deploy with ${KEY}`);
      await p.key('Enter');
      const d = await waitDialog(p);
      assert(d && d.action === 'block', 'dialog ' + JSON.stringify(d));
      assert(d.focused === 'redact' || d.focused === 'cancel', 'focus not moved into dialog');
      await expectNothingSent(before);
      if (host === 'chatgpt.com') await p.screenshot(path.join(SHOTS, '02-block-dialog.png'));
      await p.click('[data-dato="cancel"]');
      assert(!(await dialog(p)), 'dialog still open after Go back');
      assert((await editorText(p)).includes(KEY), 'prompt text lost after Go back');
      await waitEvent('cancelled', evBefore);
      await expectNothingSent(before, 100);
      await p.eval(`document.querySelector(${JSON.stringify(SITES[host].editor)}).innerHTML = ''`);
    });
  }

  const gpt = pages['chatgpt.com'], claude = pages['claude.ai'], gem = pages['gemini.google.com'];

  await t('send-button click is intercepted', async () => {
    const before = sentCount();
    await typeIn(claude, `key ${KEY}`);
    await claude.click(SITES['claude.ai'].send);
    assert((await waitDialog(claude)).action === 'block', 'no dialog on click');
    await expectNothingSent(before);
    await claude.key('Escape');
    assert(!(await dialog(claude)), 'Escape did not close');
    await claude.eval(`document.querySelector('fieldset [contenteditable]').innerHTML = ''`);
  });

  await t('form submission is intercepted', async () => {
    const before = sentCount();
    await typeIn(gpt, `key ${KEY}`);
    await gpt.eval(`document.getElementById('composer').requestSubmit(), true`);
    assert((await waitDialog(gpt)).action === 'block', 'no dialog on submit');
    await expectNothingSent(before);
    await gpt.click('[data-dato="cancel"]');
  });

  await t('block override needs two clicks and sends the reviewed text exactly', async () => {
    const before = sentCount(), evBefore = (await events()).length;
    await gpt.click('#prompt-textarea');
    await gpt.key('Enter');
    await waitDialog(gpt);
    await gpt.click('[data-dato="override"]');
    await expectNothingSent(before, 300);
    assert(await dialog(gpt), 'first override click closed the dialog');
    await gpt.click('[data-dato="override"]');
    await expectSent(before, (b) => assert(b === `key ${KEY}`, 'sent ' + b));
    await waitEvent('override', evBefore);
  });

  await t('approval does not carry over to the next prompt with the same text', async () => {
    await sleep(100);
    const before = sentCount();
    await typeIn(gpt, `key ${KEY}`);
    await gpt.key('Enter');
    assert((await waitDialog(gpt)).action === 'block', 'second identical prompt was not re-checked');
    await expectNothingSent(before);
    await gpt.click('[data-dato="cancel"]');
    await gpt.eval(`document.getElementById('prompt-textarea').innerHTML = ''`);
  });

  await t('warn shows one-click Send anyway', async () => {
    const before = sentCount(), evBefore = (await events()).length;
    await typeIn(claude, `email ${EMAIL} about the offsite`);
    await claude.key('Enter');
    const d = await waitDialog(claude);
    assert(d.action === 'warn' && d.buttons.includes('override'), JSON.stringify(d));
    await claude.click('[data-dato="override"]');
    await expectSent(before, (b) => assert(b.includes(EMAIL), 'sent ' + b));
    await waitEvent('override', evBefore);
  });

  await t('edit after review invalidates the approval and nothing sends', async () => {
    const before = sentCount(), evBefore = (await events()).length;
    await typeIn(gpt, `key ${KEY}`);
    await gpt.key('Enter');
    await waitDialog(gpt);
    // The page (or another script) changes the prompt while the review is open.
    await gpt.eval(`document.getElementById('prompt-textarea').innerText = 'key ${KEY2} and more', true`);
    await gpt.click('[data-dato="override"]');
    await gpt.click('[data-dato="override"]');
    await expectNothingSent(before);
    const d = await dialog(gpt);
    assert(d && d.msg.includes('changed after you reviewed'), 'no stale message: ' + JSON.stringify(d));
    await waitEvent('stale_review', evBefore);
    await gpt.click('[data-dato="cancel"]');
    await gpt.eval(`document.getElementById('prompt-textarea').innerHTML = ''`);
  });

  await t('redact shows a preview and sends only the redacted copy', async () => {
    await setStorage({ secrets: 'redact' });
    await sleep(150);
    const before = sentCount(), evBefore = (await events()).length;
    await typeIn(gem, `deploy with ${KEY} tonight`);
    await gem.key('Enter');
    const d = await waitDialog(gem);
    assert(d.action === 'redact' && !d.buttons.includes('override'), JSON.stringify(d));
    assert(d.preview.includes('[REDACTED: AWS ACCESS KEY ID]') && !d.preview.includes(KEY), 'preview ' + d.preview);
    await gem.screenshot(path.join(SHOTS, '03-redact-preview.png'));
    await gem.click('[data-dato="redact"]');
    await expectSent(before, (b) => assert(!b.includes(KEY) && b.includes('[REDACTED: AWS ACCESS KEY ID]') && b.includes('tonight'), 'sent ' + b));
    await waitEvent('redacted', evBefore);
  });

  await t('failed redaction never sends', async () => {
    const before = sentCount(), evBefore = (await events()).length;
    await typeIn(gem, `deploy with ${KEY} tonight`);
    await gem.eval('window.__fixtureRejectWrites(), true');
    await gem.key('Enter');
    await waitDialog(gem);
    await gem.click('[data-dato="redact"]');
    await expectNothingSent(before, 800);
    const d = await dialog(gem);
    assert(d && d.msg.includes('Nothing was sent'), 'no failure message ' + JSON.stringify(d));
    await waitEvent('redaction_failed', evBefore);
    await gem.close();
    pages['gemini.google.com'] = null;
    await resetPolicies();
  });

  await t('strict mode removes Send anyway for block and warn', async () => {
    await setStorage({ dato_settings: { strict: true, retentionDays: 30 } });
    await sleep(150);
    await typeIn(gpt, `key ${KEY}`);
    await gpt.key('Enter');
    let d = await waitDialog(gpt);
    assert(d.action === 'block' && !d.buttons.includes('override'), 'block ' + JSON.stringify(d));
    await gpt.click('[data-dato="cancel"]');
    await gpt.eval(`document.getElementById('prompt-textarea').innerHTML = ''`);
    await typeIn(gpt, `email ${EMAIL}`);
    await gpt.key('Enter');
    d = await waitDialog(gpt);
    assert(d.action === 'warn' && !d.buttons.includes('override'), 'warn ' + JSON.stringify(d));
    await gpt.screenshot(path.join(SHOTS, '04-strict-warn.png'));
    await gpt.click('[data-dato="cancel"]');
    await gpt.eval(`document.getElementById('prompt-textarea').innerHTML = ''`);
    await resetPolicies();
  });

  await t('policy change while a review is open re-evaluates it', async () => {
    await typeIn(claude, `key ${KEY}`);
    await claude.key('Enter');
    assert((await waitDialog(claude)).action === 'block', 'not blocked');
    await setStorage({ secrets: 'redact' });
    const ok = await claude.waitFor(`!!document.querySelector('#dato-modal [data-dato="redact"]') && !document.querySelector('#dato-modal [data-dato="override"]')`, 2000);
    assert(ok, 'dialog did not switch to redact');
    const d = await dialog(claude);
    assert(d.msg.includes('policy changed'), 'no policy-change message');
    await setStorage({ secrets: 'allow' });
    const closed = await claude.waitFor(`!document.getElementById('dato-modal')`, 2000);
    assert(closed, 'dialog stayed open after policy allowed the prompt');
    await claude.eval(`document.querySelector('fieldset [contenteditable]').innerHTML = ''`);
    await resetPolicies();
  });

  await t('live policy change applies without reload (Allow sends and is logged)', async () => {
    await setStorage({ pii: 'allow' });
    await sleep(150);
    const before = sentCount(), evBefore = (await events()).length;
    await typeIn(claude, `email ${EMAIL}`);
    await claude.key('Enter');
    await expectSent(before);
    assert(!(await dialog(claude)), 'dialog shown under Allow');
    await waitEvent('allowed', evBefore);
    await resetPolicies();
  });

  await t('Shift+Enter inserts a newline and does not trigger a check', async () => {
    const before = sentCount();
    await typeIn(gpt, `line one ${KEY}\nline two`);
    assert(!(await dialog(gpt)), 'dialog opened on Shift+Enter');
    const text = await editorText(gpt);
    assert(text.includes('line one') && text.includes('line two') && text.includes('\n'), 'text ' + JSON.stringify(text));
    await expectNothingSent(before, 200);
    await gpt.eval(`document.getElementById('prompt-textarea').innerHTML = ''`);
  });

  await t('IME composition Enter is left alone', async () => {
    const before = sentCount();
    await typeIn(gpt, `key ${KEY}`);
    await gpt.eval(`document.getElementById('prompt-textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true })), true`);
    await sleep(200);
    assert(!(await dialog(gpt)), 'dialog opened during IME composition');
    await expectNothingSent(before, 200);
    await gpt.eval(`document.getElementById('prompt-textarea').innerHTML = ''`);
  });

  await t('single-page navigation with a replaced editor stays protected', async () => {
    const oldNode = await gpt.eval(`window.__oldEditor = document.getElementById('prompt-textarea'), true`);
    assert(oldNode, 'setup');
    await gpt.click('#new-chat');
    await sleep(500);
    assert(await gpt.eval(`location.pathname.startsWith('/c/') && window.__oldEditor !== document.getElementById('prompt-textarea')`), 'editor not replaced');
    const before = sentCount();
    await typeIn(gpt, `key ${KEY}`);
    await gpt.key('Enter');
    assert((await waitDialog(gpt)).action === 'block', 'not protected after navigation');
    await expectNothingSent(before);
    await gpt.click('[data-dato="cancel"]');
    assert((await tabStatus('chatgpt.com')).state === 'active', 'not active after navigation');
  });

  await t('changed site markup reports Degraded, still checks the fallback editor', async () => {
    await gpt.close();
    const p = await open('chatgpt.com', '?variant=broken');
    assert(p.state === 'dato-degraded', 'badge ' + p.state);
    const s = await tabStatus('chatgpt.com');
    assert(s.state === 'degraded' && s.code === 'fallback-editor', JSON.stringify(s));
    const before = sentCount();
    await p.focus('textarea');
    await p.type(`key ${KEY}`);
    await p.key('Enter');
    assert((await waitDialog(p)).action === 'block', 'fallback editor not checked');
    await expectNothingSent(before);
    await p.close();
  });

  await t('page without a prompt box reports Degraded, not Active', async () => {
    const p = await open('claude.ai', '?variant=noeditor');
    assert(p.state === 'dato-degraded', 'badge ' + p.state);
    const s = await tabStatus('claude.ai');
    assert(s.state === 'degraded' && s.code === 'no-editor', JSON.stringify(s));
    await p.close();
  });

  await t('phone width: review dialog fits and stacks buttons', async () => {
    const p = await browser.newPage('https://claude.ai/', { width: 390, height: 780, mobile: true });
    p.host = 'claude.ai';
    await p.waitFor(`(document.getElementById('dato-sentinel') || {}).className === 'dato-active'`, 6000);
    await typeIn(p, `email ${EMAIL} and key ${KEY}`);
    await p.key('Enter');
    await waitDialog(p);
    const fits = await p.eval(`(() => { const r = document.querySelector('.dato-dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; })()`);
    assert(fits, 'dialog overflows at 390px');
    await p.screenshot(path.join(SHOTS, '05-phone-dialog.png'));
    await p.click('[data-dato="cancel"]');
    await p.close();
  });

  await t('stored data holds metadata only: no prompts, values or excerpts', async () => {
    const all = await storage();
    const json = JSON.stringify(all);
    for (const s of SECRETS) assert(!json.includes(s), 'storage contains ' + s);
    for (const w of ['deploy', 'tonight', 'offsite', 'printing']) assert(!json.toLowerCase().includes(w), 'storage contains prompt word ' + w);
    const keys = new Set(['id', 't', 'adapter', 'action', 'outcome', 'trigger', 'strict', 'categories', 'rules']);
    for (const e of all.dato_events) for (const k of Object.keys(e)) assert(keys.has(k), 'unexpected event field ' + k);
    assert(all.dato_events.length >= 10, 'expected events, got ' + all.dato_events.length);
  });

  await t('only the fixture pages talked to the network, and only on supported hosts', async () => {
    const unexpected = srv.requests.filter((r) => !/^(GET|POST) (chatgpt\.com|claude\.ai|gemini\.google\.com)\/(|c\/\d+|fixture\.js|mock\/send|favicon\.ico)$/.test(r));
    assert(!unexpected.length, 'unexpected requests: ' + unexpected.join(', '));
  });

  await t('dashboard shows the recorded activity and adapter health', async () => {
    await ext.reload();
    await ext.waitFor(`document.querySelectorAll('#log tbody tr').length > 0`);
    const evs = await events();
    const m = Store.metrics(evs, 30, Date.now());
    const nums = await ext.eval(`[...document.querySelectorAll('.kpi .num')].map(n => Number(n.textContent))`);
    const expected = [m.total - m.allowed, m.blocked, m.redacted, m.overrides, m.failed + m.stale];
    assert(JSON.stringify(nums) === JSON.stringify(expected), `KPIs ${nums} != ${expected}`);
    assert(m.blocked > 0 && m.redacted > 0 && m.overrides > 0, 'expected each kind of event');
    const states = await ext.eval(`[...document.querySelectorAll('.health-card')].map(c => c.dataset.state)`);
    assert(states.every((s) => s !== 'none'), 'health not reported: ' + states);
    await ext.screenshot(path.join(SHOTS, '06-dashboard-live.png'));
  });

  await t('demo mode is labeled and does not touch stored data', async () => {
    const before = JSON.stringify(await events());
    await ext.click('#demo');
    assert(!(await ext.eval(`document.getElementById('demo-banner').hidden`)), 'no demo banner');
    assert(await ext.eval(`document.getElementById('delete').disabled && document.getElementById('export').disabled`), 'data controls live in demo');
    await ext.screenshot(path.join(SHOTS, '07-dashboard-demo.png'));
    await ext.click('#demo-exit');
    assert(JSON.stringify(await events()) === before, 'demo mode changed storage');
  });

  await t('dashboard at phone width has no horizontal scroll', async () => {
    const p = await browser.newPage(extUrl('dashboard.html'), { width: 390, height: 844, mobile: true });
    await p.waitFor(`document.querySelectorAll('.kpi').length === 5`);
    assert(await p.eval(`document.documentElement.scrollWidth <= innerWidth`), 'horizontal scroll');
    await p.screenshot(path.join(SHOTS, '08-dashboard-phone.png'));
    await p.close();
  });

  await t('retention change prunes old events', async () => {
    const evs = await events();
    const old = Object.assign({}, evs[0], { id: 'old', t: Date.now() - 20 * Store.DAY });
    await setStorage({ dato_events: [old].concat(evs) });
    await ext.eval(`(() => { const s = document.getElementById('retention'); s.value = '7'; s.dispatchEvent(new Event('change')); return true; })()`);
    await ext.waitFor(`document.getElementById('data-msg').textContent.includes('7 days')`, 3000);
    const after = await events();
    assert(!after.some((e) => e.id === 'old') && after.length === evs.length, 'old event not pruned');
    await setStorage({ dato_settings: { strict: false, retentionDays: 30 } });
  });

  await t('delete needs a second click and leaves a true empty state', async () => {
    await ext.click('#delete');
    await sleep(150);
    assert((await events()).length > 0, 'deleted on first click');
    const deletedAt = Date.now();
    await ext.click('#delete');
    await ext.waitFor(`document.getElementById('log').textContent.includes('No activity recorded yet')`, 3000);
    const all = await storage();
    assert(!all.dato_events, 'events not cleared: ' + JSON.stringify(all.dato_events));
    assert(!all.dato_health || Object.values(all.dato_health).every((h) => h.t > deletedAt), 'old health records survived: ' + JSON.stringify(all.dato_health));
    assert(all.secrets === 'block', 'policies should survive activity deletion');
  });

  await t('popup on an unsupported tab says it is not protected', async () => {
    const p = await browser.newPage(extUrl('popup.html'), { width: 380, height: 640 });
    const title = await p.waitFor(`document.getElementById('status').dataset.state !== 'checking' && document.getElementById('status-title').textContent`);
    assert(title === 'Not protected here', 'popup said ' + title);
    await p.screenshot(path.join(SHOTS, '09-popup.png'));
    await p.close();
  });

  await browser.close();
  srv.server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

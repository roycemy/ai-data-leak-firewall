/* Minimal Chrome DevTools Protocol driver, no dependencies (Node 22+ global WebSocket).
 * Input goes through Input.* so keys and clicks are trusted, like a real user. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitFor(fn, ms = 5000, step = 50) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(step);
  }
  return last;
}

class Browser {
  static async launch({ exe, userDataDir, extensionDir, hostRules, width = 1280, height = 900 }) {
    const args = [
      '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
      `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`,
      `--host-resolver-rules=${hostRules}`, '--ignore-certificate-errors',
      '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      '--disable-component-update', '--disable-sync', `--window-size=${width},${height}`
    ];
    const proc = spawn(exe, args, { stdio: 'ignore' });
    const portFile = path.join(userDataDir, 'DevToolsActivePort');
    const ready = await waitFor(() => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').includes('\n'), 20000);
    if (!ready) { proc.kill(); throw new Error('Chrome did not start'); }
    const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
    const b = new Browser(proc);
    await b.connect(`ws://127.0.0.1:${port}${wsPath}`);
    return b;
  }

  constructor(proc) { this.proc = proc; this.id = 0; this.pending = new Map(); this.listeners = []; }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
        } else if (msg.method) this.listeners.forEach((l) => l(msg));
      };
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }

  async targets() { return (await this.send('Target.getTargets')).targetInfos; }

  /* Chromium runs its own component extensions too, so find ours by opening
   * each candidate's page and checking for a known title. */
  async extensionId(page, title) {
    await waitFor(async () => (await this.targets()).some((x) => x.type === 'service_worker' && x.url.endsWith('/background.js')), 10000);
    const ids = [...new Set((await this.targets()).filter((x) => x.url.startsWith('chrome-extension://')).map((x) => new URL(x.url).host))];
    for (const id of ids) {
      const p = await this.newPage(`chrome-extension://${id}/${page}`);
      const ok = (await p.eval('document.title').catch(() => '')) === title;
      await p.close();
      if (ok) return id;
    }
    throw new Error('Dato extension not found. Is --load-extension supported by this Chrome?');
  }

  async newPage(url, { width = 1280, height = 900, mobile = false } = {}) {
    // Open the URL directly: extension pages refuse navigation from about:blank.
    const { targetId } = await this.send('Target.createTarget', { url: url || 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const p = new Page(this, sessionId, targetId);
    await p.send('Page.enable');
    await p.send('Runtime.enable');
    await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await p.waitFor(`document.readyState === 'complete' && location.href !== 'about:blank'`, 10000);
    return p;
  }

  async close() { try { await this.send('Browser.close'); } catch (e) { /* closing */ } await sleep(300); try { this.proc.kill(); } catch (e) { /* gone */ } }
}

class Page {
  constructor(browser, sessionId, targetId) { this.b = browser; this.sessionId = sessionId; this.targetId = targetId; }
  send(method, params) { return this.b.send(method, params, this.sessionId); }

  async reload() {
    await this.eval('window.__reloading = true');
    await this.send('Page.reload', {});
    await this.waitFor(`!window.__reloading && document.readyState === 'complete'`, 10000);
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  }

  waitFor(expression, ms = 5000) { return waitFor(() => this.eval(expression).catch(() => false), ms); }

  async focus(selector) { await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); const s = getSelection(); const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); s.removeAllRanges(); s.addRange(r); return true; })()`); }

  async type(text) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await this.send('Input.insertText', { text: lines[i] });
      if (i < lines.length - 1) await this.key('Enter', { shift: true });
    }
  }

  async key(key, { shift = false, ctrl = false } = {}) {
    const codes = { Enter: 13, Escape: 27, Tab: 9 };
    const modifiers = (shift ? 8 : 0) | (ctrl ? 2 : 0);
    const base = { key, code: key, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key], modifiers };
    await this.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', text: key === 'Enter' ? '\r' : undefined }, base));
    await this.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
  }

  async click(selector) {
    const box = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!box) throw new Error('No element for ' + selector);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    }
  }

  async screenshot(file) {
    await this.send('Page.bringToFront');
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }

  async close() { await this.b.send('Target.closeTarget', { targetId: this.targetId }); }
}

module.exports = { Browser, sleep, waitFor };

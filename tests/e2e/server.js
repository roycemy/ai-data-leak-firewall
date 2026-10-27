/* Local HTTPS mock of the three supported chat sites.
 * Chrome is started with host-resolver rules that send chatgpt.com, claude.ai
 * and gemini.google.com here and every other host nowhere, so no test prompt
 * can reach a real AI service.
 *
 * Each page copies the composer markup the adapters target, and sends prompts
 * to POST /mock/send on the same origin. GET /mock/sent lists what arrived.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// Composer markup per site, modelled on each site's known DOM.
const COMPOSERS = {
  'chatgpt.com': `<form id="composer" class="composer">
      <div id="prompt-textarea" class="ProseMirror" contenteditable="true" role="textbox" aria-label="Message ChatGPT"></div>
      <button id="composer-submit-button" data-testid="send-button" aria-label="Send prompt" type="submit" disabled>Send</button>
    </form>`,
  'claude.ai': `<fieldset class="composer">
      <div class="ProseMirror" contenteditable="true" role="textbox" aria-label="Write your prompt to Claude"></div>
      <button type="button" aria-label="Send message">Send</button>
    </fieldset>`,
  'gemini.google.com': `<div class="composer">
      <rich-textarea><div class="ql-editor" contenteditable="true" role="textbox" aria-label="Enter a prompt here"></div></rich-textarea>
      <button class="send-button" aria-label="Send message" mattooltip="Send message">Send</button>
    </div>`
};

// Variants simulate a site changing under the adapter.
const VARIANTS = {
  broken: `<div class="composer"><textarea class="new-editor" aria-label="Prompt"></textarea><button class="go">Go</button></div>`,
  noeditor: `<p>Settings page with no prompt box.</p>`
};

function page(host, variant) {
  const composer = VARIANTS[variant] || COMPOSERS[host];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fixture ${host}</title>
<style>
body{margin:0;font:15px system-ui;background:#f4f4f5;color:#111}
header{padding:10px 16px;background:#fff;border-bottom:1px solid #ddd;display:flex;gap:12px;align-items:center}
main{max-width:760px;margin:0 auto;padding:16px 16px 160px}
.msg{background:#fff;border:1px solid #ddd;border-radius:10px;padding:10px 12px;margin:8px 0;white-space:pre-wrap}
#dock{position:fixed;left:0;right:0;bottom:0;padding:12px 16px;background:#fff;border-top:1px solid #ddd}
.composer{max-width:760px;margin:0 auto;display:flex;gap:8px;align-items:flex-end;border:0;padding:0}
[contenteditable],textarea{flex:1;min-height:44px;max-height:200px;overflow:auto;padding:10px;border:1px solid #bbb;border-radius:10px;background:#fff;font:inherit;white-space:pre-wrap}
button{padding:10px 14px;border-radius:10px;border:1px solid #333;background:#111;color:#fff}
button:disabled{opacity:.4}
</style></head><body data-host="${host}" data-variant="${variant || ''}">
<header><b>${host} (local fixture)</b><a href="/c/new" id="new-chat">New chat</a></header>
<main id="transcript"></main>
<div id="dock">${composer}</div>
<script src="/fixture.js"></script>
</body></html>`;
}

function start(certDir, port) {
  const sent = [];
  const requests = [];
  const key = fs.readFileSync(path.join(certDir, 'key.pem'));
  const cert = fs.readFileSync(path.join(certDir, 'cert.pem'));
  const fixtureJs = fs.readFileSync(path.join(__dirname, 'fixture.js'));
  const server = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    const url = new URL(req.url, 'https://' + host);
    requests.push(req.method + ' ' + host + url.pathname);
    if (req.method === 'POST' && url.pathname === '/mock/send') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try { sent.push(Object.assign({ host }, JSON.parse(body))); } catch (e) { sent.push({ host, bad: body }); }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
      });
      return;
    }
    if (url.pathname === '/fixture.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(fixtureJs); return; }
    if (url.pathname === '/favicon.ico') { res.writeHead(404); res.end(); return; }
    if (!COMPOSERS[host]) { res.writeHead(404); res.end('unknown host'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page(host, url.searchParams.get('variant')));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, sent, requests, port: server.address().port })));
}

module.exports = { start };

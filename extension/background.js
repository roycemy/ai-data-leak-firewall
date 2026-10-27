/* Dato service worker: the only writer of the activity log.
 * Writes go through one queue so two tabs cannot overwrite each other's events.
 *
 * Storage (chrome.storage.local):
 *   dato_events   - array of sanitized flag events (see store.js), pruned by retention
 *   dato_settings - { retentionDays }
 * Policy keys (secrets, pii, ...) belong to the popup and content script, not this file.
 */
importScripts('store.js');

var queue = Promise.resolve();
function enqueue(task) { queue = queue.then(task).catch(function (e) { console.error('Dato store', e); }); return queue; }

function retentionDays(all) { return DatoStore.cleanRetention(all.dato_settings && all.dato_settings.retentionDays); }

// Reads and changes dato_events.
function appendEvent(raw) {
  return enqueue(async function () {
    var all = await chrome.storage.local.get(['dato_events', 'dato_settings']);
    var now = Date.now();
    var events = DatoStore.prune(all.dato_events, retentionDays(all), now);
    events.push(DatoStore.sanitizeEvent(raw, now, crypto.randomUUID()));
    await chrome.storage.local.set({ dato_events: DatoStore.prune(events, retentionDays(all), now) });
  });
}

// Changes dato_events: drops events older than the retention setting.
function pruneNow() {
  return enqueue(async function () {
    var all = await chrome.storage.local.get(['dato_events', 'dato_settings']);
    await chrome.storage.local.set({ dato_events: DatoStore.prune(all.dato_events, retentionDays(all), Date.now()) });
  });
}

// Changes dato_events: removes every recorded flag.
function deleteActivity() {
  return enqueue(function () { return chrome.storage.local.remove('dato_events'); });
}

function fromOwnPage(sender) { return sender.id === chrome.runtime.id && sender.url && sender.url.indexOf(chrome.runtime.getURL('')) === 0; }

chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (!msg || sender.id !== chrome.runtime.id) return;
  var job = null;
  if (msg.type === 'dato:event' && sender.tab) job = appendEvent(msg.event);
  else if (msg.type === 'dato:prune' && fromOwnPage(sender)) job = pruneNow();
  else if (msg.type === 'dato:delete' && fromOwnPage(sender)) job = deleteActivity();
  if (!job) return;
  job.then(function () { reply({ ok: true }); }, function () { reply({ ok: false }); });
  return true;
});

chrome.runtime.onStartup.addListener(pruneNow);
chrome.runtime.onInstalled.addListener(pruneNow);

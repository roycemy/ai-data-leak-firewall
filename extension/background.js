/* Dato service worker: the only writer of the activity log and adapter health.
 * Writes go through one queue so two tabs cannot overwrite each other's events.
 *
 * Storage (chrome.storage.local):
 *   dato_events   - array of sanitized events (see store.js), pruned by retention
 *   dato_health   - { [adapter]: latest health report }
 *   dato_settings - { strict, retentionDays }
 */
importScripts('policy.js', 'store.js');

var queue = Promise.resolve();
function enqueue(task) { queue = queue.then(task).catch(function (e) { console.error('Dato store', e); }); return queue; }

function get(keys) { return chrome.storage.local.get(keys); }
function set(items) { return chrome.storage.local.set(items); }

function retentionDays(all) { return DatoPolicy.cleanSettings(all.dato_settings).retentionDays; }

// Reads and changes dato_events.
function appendEvent(raw) {
  return enqueue(async function () {
    var all = await get(['dato_events', 'dato_settings']);
    var now = Date.now();
    var events = DatoStore.prune(all.dato_events, retentionDays(all), now);
    events.push(DatoStore.sanitizeEvent(raw, now, crypto.randomUUID()));
    await set({ dato_events: DatoStore.prune(events, retentionDays(all), now) });
  });
}

// Reads and changes dato_health.
function reportHealth(raw) {
  return enqueue(async function () {
    var all = await get(['dato_health']);
    var map = all.dato_health || {};
    var h = DatoStore.sanitizeHealth(raw, Date.now());
    map[h.adapter] = h;
    await set({ dato_health: map });
  });
}

// Changes dato_events.
function pruneNow() {
  return enqueue(async function () {
    var all = await get(['dato_events', 'dato_settings']);
    await set({ dato_events: DatoStore.prune(all.dato_events, retentionDays(all), Date.now()) });
  });
}

// Changes dato_events and dato_health.
function deleteActivity() {
  return enqueue(function () { return chrome.storage.local.remove(['dato_events', 'dato_health']); });
}

function fromOwnPage(sender) { return sender.id === chrome.runtime.id && sender.url && sender.url.indexOf(chrome.runtime.getURL('')) === 0; }

chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (!msg || sender.id !== chrome.runtime.id) return;
  var job = null;
  if (msg.type === 'dato:event' && sender.tab) job = appendEvent(msg.event);
  else if (msg.type === 'dato:health' && sender.tab) job = reportHealth(msg.health);
  else if (msg.type === 'dato:prune' && fromOwnPage(sender)) job = pruneNow();
  else if (msg.type === 'dato:delete' && fromOwnPage(sender)) job = deleteActivity();
  if (!job) return;
  job.then(function () { reply({ ok: true }); }, function () { reply({ ok: false }); });
  return true;
});

chrome.runtime.onStartup.addListener(pruneNow);
chrome.runtime.onInstalled.addListener(pruneNow);

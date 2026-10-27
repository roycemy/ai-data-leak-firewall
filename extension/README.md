# Dato Chrome extension (1.1.0)

Dato checks prompts on **ChatGPT** (`chatgpt.com`, `chat.openai.com`), **Claude** (`claude.ai`) and **Gemini** (`gemini.google.com`) before they send. It runs on your device and can Allow, Warn, Redact or Block each type of data.

> **Best-effort, not a security boundary.** Dato watches the page's send paths from inside the browser. A site change, another extension, a script on the page or the user can get around it, and pattern matching misses things. Use it as a guard rail next to your organisation's real controls, not instead of them.

## Install

1. Get the repository (clone it or download the ZIP from GitHub and unzip it).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension` folder.
4. Pin Dato from the Extensions menu.
5. Open or **refresh** any ChatGPT, Claude or Gemini tab. Tabs that were already open do not get Dato until you refresh them.

## Update or reload after pulling changes

1. `chrome://extensions` → Dato → the **reload** arrow.
2. **Refresh every open AI chat tab.** Until you do, the old copy in that tab is cut off from the extension: the badge shows **Error** and its events are not recorded.

## What you'll see

The badge in the bottom-right corner and the popup show the real result of Dato's checks in that tab:

| State | Meaning |
| --- | --- |
| **Active** | The site's prompt editor was found with Dato's site-specific selectors, and send checks are attached. |
| **Degraded** | Dato is running but something doesn't match. Either no prompt box was found, or the layout changed and a fallback editor match is in use, or the send button isn't recognised (Enter and form submits are still checked). |
| **Error** | Dato cannot protect this tab. Usually the extension was reloaded and the tab needs a refresh. |
| **Not protected here** (popup) | Any site other than the four hosts above. Prompts there are not checked. |

## How a send is checked

Enter (not Shift+Enter, and not Enter while an IME composition is open), send-button clicks and form submits all go through one checkpoint. The checkpoint runs before the site's own handlers.

- **Strictest action wins.** If one prompt has an email (Warn) and an API key (Block), it is blocked.
- **Lower-confidence matches** (partial keys, "my password is …", context words like *confidential*) never go above Warn.
- **Redact** shows a preview of exactly what will be sent. Dato writes the redacted copy into the editor and reads it back. It waits a moment in case the site reverts it, then re-scans. If any step fails, nothing is sent. Whole-prompt patterns (source code, contract language) have no exact value to replace, so a Redact policy on them blocks instead.
- **Send anyway** is the explicit personal override. On a block it needs a second click.
- **Approval is bound to the exact text you reviewed.** If the prompt changes while the review is open, or before the send goes out, the approval is dropped. Dato re-checks and nothing is sent until you choose again. An approval also lapses after 3 seconds and can't be reused for a later prompt.
- **Strict mode** (popup) removes Send anyway from every review. Anyone using this browser can turn it off again, so it is a guard rail, not a lock.
- Changing a policy applies to open tabs straight away, including a review that is already on screen.

## Activity dashboard

Popup → **Open activity dashboard**. It shows real data from this browser profile only:

- adapter health per site, and when it was last checked
- prompts held, blocks, redactions, overrides, and prompts not sent (failed redaction or changed after review)
- interventions per day (with a table view), and findings by data type
- recent events, a retention setting (7, 30 or 90 days), JSON export and Delete all (two clicks)

**What is stored:** time, site, policy action, what you chose, what triggered the send, the strict-mode flag, and counts by data type and detector. **Never stored:** prompt text, matched values, masked excerpts or file contents. The service worker rebuilds every event from an allowlist before saving, so extra fields can't get in.

**Show demo data** swaps in generated numbers under a labelled banner. Nothing is saved, and delete and export are disabled while it is on. The website playground (`index.html`) keeps its own separate log in the page's `localStorage`. The dashboard does not show it.

## Tests

```sh
npm run test:unit   # detectors, policy engine, storage rules, static privacy checks (Node 22+)
npm run test:e2e    # the real extension in Chromium against local fixture sites
```

The e2e run needs Chromium or Chrome for Testing: branded Chrome ignores `--load-extension`. It finds Playwright's Chromium download automatically, or you can set `DATO_CHROME=/path/to/chrome`. It also needs `openssl` on PATH to make a throwaway certificate.

How the e2e run stays private: Chrome starts with host-resolver rules that point `chatgpt.com`, `claude.ai` and `gemini.google.com` at a local HTTPS mock server, and send **every other host nowhere**. Each mock page copies that site's composer markup and posts prompts to a local `/mock/send` endpoint. The tests assert exactly what arrived there. Screenshots land in `tests/e2e/screenshots/`.

**Fixture tests are not real-site verification.** They prove Dato's logic against markup modelled on each site. They do not prove the live sites still use that markup. Dato has not yet been checked against live ChatGPT, Claude or Gemini accounts as part of this test suite.

## Known limitations

- Real-site selectors can go stale whenever a site ships a redesign. When they do, the badge says Degraded instead of claiming protection.
- Only typed or pasted prompt text is checked. **File uploads are not inspected yet**, so don't read "Active" as meaning attachments are safe.
- Some sites let users switch Enter to insert a newline. Dato still treats plain Enter as a send there, so a prompt with findings shows a review when you press Enter.
- If a site keeps its own copy of the prompt and ignores the editor contents, a redacted send could still use the original. Dato re-reads the editor to catch the common cases, but it can't see a site's internal state.
- Detection is pattern matching. Known misses (SSNs without dashes, keys split across lines, non-US phone numbers, names on their own) and known false positives are listed as TODO tests in `tests/unit/detectors.test.js`.

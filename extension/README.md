# AI Firewall Chrome extension

AI Firewall checks prompts locally before they are submitted on **ChatGPT (`chatgpt.com`)**, **Claude (`claude.ai`)**, and **Gemini (`gemini.google.com`)**. Those are the only sites this first release supports.

## Install it today

1. Download this repository as a ZIP from GitHub and unzip it.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** in the top-right.
4. Click **Load unpacked** and choose this repository's `extension` folder.
5. Pin AI Firewall from Chrome's Extensions menu. Open ChatGPT, Claude, or Gemini and look for the **AI Firewall · Protected locally** badge.

Chrome will show that AI Firewall can read and change data on the three supported AI sites. It needs that access to inspect the prompt editor and stop a submission. It has no access to other websites.

## What it catches (1.1.0)

Two tiers, both local-only:

- **Exact matches hard-block by default.** Full-length API keys, private key blocks, connection strings, valid card numbers, SSNs, and similar high-confidence patterns stop the prompt immediately.
- **Anything plausibly confidential warns.** Shortened or partial keys, credentials named in plain language ("my password is ..."), unrecognized high-entropy tokens, personal details like salaries, and confidentiality labels (a line starting "Confidential:", the capitals CONFIDENTIAL, "internal use only", "do not distribute", "under NDA") show a review warning instead of silently passing. The everyday words "confidential", "restricted" and "proprietary" inside a normal sentence do not.

Every interception can be overridden intentionally: warnings offer **Send anyway**, and hard blocks offer it too, with a second confirming click so it cannot fire accidentally.

## Safe five-minute test

Use synthetic values only. Paste this on a supported site:

```text
Summarize this fake deployment note:
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
Customer email: dana@example.com
Test card: 4111 1111 1111 1111
```

- Default policy blocks the AWS example key before submission.
- A shortened version of the key (or a phrase like `my password is hunter2`) triggers the review warning instead of a hard block.
- On a hard block, **Send anyway** requires a second confirming click before the prompt goes through.
- Open the AI Firewall toolbar popup and set **Secrets & credentials** to **Warn**. Try again to see the review-and-send flow.
- Set it to **Redact**. AI Firewall replaces detected values in the editor and submits only the redacted copy.

The key and card above are public synthetic examples, not live credentials.

## Flagged-activity dashboard

Click **View flagged activity** in the toolbar popup. Each time AI Firewall holds, blocks or flags a prompt it records one line in this browser: the time, the site, the worst severity, the policy action, what you chose, and counts by data type and detector. The dashboard shows:

- **Flagged prompts**, and how many were **high severity** (critical or high)
- **Stopped, not sent:** you went back, pressed Escape or clicked outside, so nothing was sent
- **Sent through:** you chose Send anyway, or your policy was Allow
- **Redacted, then sent:** sent with the flagged values replaced
- flags per day, findings by data type, and the recent flags, with a retention setting (7, 30 or 90 days), JSON export and a two-click Delete

Before anything is flagged it shows zeros and "Nothing flagged yet". **Show demo data** fills it with generated examples under a banner that says so. The demo data is never saved. The website's Dashboard keeps its own separate log and is not shown here. When you open the AI Firewall website (`roycemy.github.io/ai-data-leak-firewall/`), the small `bridge.js` content script hands that page a summary of this log, counts and labels only (never prompt text, matched values or rule details), so its Dashboard can show a "From the Chrome extension" card. It runs on no other page.

## Privacy and limits

- Detection runs in the browser content script. AI Firewall makes no network requests and does not store prompt text.
- `chrome.storage.local` holds your policy choices and the flag log (`dato_events`). A flag line never contains the prompt, the values AI Firewall found or any excerpt of them; the service worker rebuilds every line from an allowlist before saving it.
- Detection is best-effort pattern matching, not a certified security control. It will still flag some harmless text on purpose: a street address or a birthday you type about yourself, an invoice number, or a revenue figure it cannot tell is public. Those are warnings you can dismiss with Go back or Send anyway.
- This release checks typed/pasted prompt text. It does not inspect uploaded files on AI sites.
- Site interfaces change. If a supported editor changes, AI Firewall may need a selector update.

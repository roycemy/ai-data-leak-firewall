# AI Firewall

**Stop confidential data from entering AI tools — without stopping people from using AI.**

AI Firewall (first called Dato; the repo and the Chrome extension still use that name) is a local-first AI data-leak firewall. It inspects prompts and files **before** they reach ChatGPT, Claude, or any other LLM, detects confidential content, and applies your policy: **warn**, **redact**, or **block**. Every inspection runs in the browser. The only thing that ever leaves it is the optional breach check below, which sends a 5-character hash prefix and nothing else.

**Live:** https://roycemy.github.io/ai-data-leak-firewall/

## Mini Project 3: breach check for passwords

**What it does.** When AI Firewall finds a password in a prompt (for example "my password is …" or `db_password = "…"`), it can also check whether that password has already leaked in a known data breach. A password found in breaches is raised to a **Critical** finding with a "Found in breaches" badge in its own row, which also says how many times it has been seen. This means that password string appears in breach data, not that your own account was breached. The audit log and the Dashboard count it.

**The API.** [Have I Been Pwned — Pwned Passwords](https://haveibeenpwned.com/API/v3#PwnedPasswords), range endpoint: `GET https://api.pwnedpasswords.com/range/{first 5 characters of the SHA-1 hash}`. It is free, needs no API key, and allows calls from the browser (it sends `Access-Control-Allow-Origin: *`).

**How it stays private.** The browser hashes the password with SHA-1 (`crypto.subtle.digest`) and sends only the first 5 of the 40 hex characters. The API answers with every known hash that starts with those 5 characters (about 2,000 of them), and the page looks for the remaining 35 characters in that list itself. The password and its full hash never leave the browser. Have I Been Pwned does see the request itself (and your IP address), just not the password. Only counts are saved (passwords checked, passwords breached), never the password, the hash or the prefix.

**How to use it.**
1. Open the **Firewall** tab.
2. Tick **Also check detected passwords against known breaches** (it is off by default).
3. Paste a prompt that contains a password, for example `my password is password123`, and press **Inspect**.
4. Under the result you see "Checking…", then either a red "found in known breaches" note with the count or a green "Not found in known breaches" note.
5. Open **Audit log** (filter: *Password found in breaches*) or **Dashboard** (*Breached passwords*, captioned "Inspections with a breached password") to see the count. The dashboard counts inspections, so inspecting the same prompt twice counts twice.

**Every state** (from [PRD.md](PRD.md)): box off: no network call at all. Nothing to check: "No passwords found, so nothing was sent". Loading: "Checking N passwords…". Error (offline, network failure or a non-OK status such as 404, 429 or 503): an amber "Breach check unavailable" note, and the normal local scan, verdict and Send rule still work. Invalid input (nothing to inspect): the usual red message and no call. Edited while checking: the old answer is ignored. After Reset everything: the box is unticked and the count is 0.

**The code.** [`breach-check.js`](breach-check.js) holds all of it in small commented functions: `passwordsFrom` (which findings are passwords), `sha1Hex` (hashing), `checkPassword` (the `fetch` with `await` inside `try/catch` and the `response.ok` check), `countForSuffix` (reading the `SUFFIX:COUNT` lines) and `checkAll` (the totals). [`app.js`](app.js) `runBreachCheck` shows the states and saves the counts. Tests: [`tests/breach-check.test.js`](tests/breach-check.test.js).

## Mini Project 2 to 3: what changed

This is the same repo, expanded on purpose for Mini Project 3. Mini Project 2 is preserved at the tag [`mp2-final`](https://github.com/roycemy/ai-data-leak-firewall/tree/mp2-final) (commit `336fa8c`), the interactive web tool as it was submitted.

| Change | Where |
| --- | --- |
| Planning docs first: AGENTS.md now allows this one API call and nothing else; PROPOSAL.md and PRD.md describe the breach check and every state; DESIGN.md styles it. PROPOSAL.md no longer calls the extension dashboard a mock-up (commit `a91da88` replaced it) | `AGENTS.md`, `PROPOSAL.md`, `PRD.md`, `DESIGN.md` |
| Breach check with Have I Been Pwned (the API requirement) | `breach-check.js`, `app.js`, `index.html`, `styles.css` |
| "Found in breaches" count in the audit log (column and filter) and on the Dashboard | `app.js`, `index.html` |
| The site shows the name AI Firewall instead of Dato | `index.html`, `app.js`, `assessment.js` |
| Tests for hashing, response parsing, non-OK and offline handling | `tests/breach-check.test.js` |
| UI polish after review: a tighter design system first (DESIGN.md), then a calmer Firewall (one primary button, a switch with a short privacy line, one verdict banner, the breach result inside the password's row), a Dashboard built as the owner's home (stats, 14-day SVG trend, data types, severity and outcomes, recent activity, policies, empty state, "this device only" note) and an audit log that becomes stacked cards on a phone | `DESIGN.md`, `styles.css`, `index.html`, `app.js`, `dashboard.js`, `tests/dashboard.test.js` |

The Chrome extension did not change, so `dato-extension.zip` was not rebuilt.

**Where the agent's build differed from what I expected (Mini Project 3):** I expected a checkbox and a result line; the agent also added a "Breach check" column and a "Password found in breaches" filter in the audit log and a "Breached passwords" dashboard card, and it only checks passwords the detector already flagged, so a password pasted on its own with no word like "password" in front of it is not checked. *(Royce: edit this line if it does not match what you expected.)*

## Required question (Mini Project 3): AI output I did not accept as-is

> **TODO — Royce writes this himself.** Point at a specific commit, say what the agent produced, what you changed or rejected, and how you checked it. *(Left blank on purpose. The agent did not write this answer.)*

## Mini Project 2 notes

The sections below, down to "About PROPOSAL.md", are the Mini Project 2 write-up and describe that submission.

## Where this repo came from

This repo was created for Mini Project 2 by copying over a concept I had been working on for the past few weeks (Dato). The history here starts at the copy, so it does not show that earlier work. For this assignment I added the planning documents (PROPOSAL.md, PRD.md, DESIGN.md, AGENTS.md), inline error handling, Reset everything, the keyboard shortcut, empty states and phone fixes. The Chrome extension is in [`extension/`](extension/README.md), and the site has an Extension tab to download it.

## How to use

1. **Firewall tab (opens first):** paste a prompt or attach text files, then press **Inspect** (or Ctrl/Cmd + Enter in the prompt box). AI Firewall shows one verdict and the findings, most severe first. Turn on *Check passwords against known breaches* to also check detected passwords against Have I Been Pwned (see above). **Send** only appears after an inspection, and only while the text is exactly what was inspected. If you edit the prompt afterwards, inspect again.
2. **Policies tab:** set Allow / Warn / Redact / Block for each data class and inspect again to see the verdict change. **Reset everything** restores defaults and clears the log.
3. **Dashboard tab:** the owner's view of this browser's log: inspections, flagged, blocked and breached-password counts, a 14-day trend, data types found, severity and outcomes, recent activity and the policies in effect. It shows a "No activity yet" card until the first inspection.
4. **Audit log tab:** filter events (including *Password found in breaches*), export them as JSON, or clear them. On a phone each event is a small card.
5. **Extension tab (last tab):** download `dato-extension.zip` and follow the install steps. The extension checks prompts on ChatGPT, Claude, and Gemini before they send.

Empty or invalid input (nothing to inspect, file over 2 MB, unreadable file) shows a message in the page. Nothing uses pop-up dialogs. Every control can be reached with the Tab key.

## Where the agent differed from what I expected (Mini Project 2)

I pictured this as just an extension, so I did not put certain things in the proposal. Then I realized the value for business owners of having an actual dashboard connected to the extension. The agent built the website console, an Extension tab to download the extension, and an owner dashboard page at `extension/executive-dashboard.html`. That dashboard uses hardcoded demo data, and the extension does not send it any events yet, so it is a mock-up and not a working connection.

## Required question (Mini Project 2): AI output I did not accept as-is

I think I accepted the agent's output as-is, so I checked one commit: **86e3ffa** ("Add detection and redaction engine"), which added `detectors.js`. To verify it, I ran `scan` from `detectors.js` in Node on a test string with a fake AWS key, an SSN, a Luhn-valid test card number and an email. It found all four and masked each value. A harmless sentence ("hello, lunch at noon?") returned no findings. I ran this check on 2026-10-26 with the agent's help. It only covers those four patterns, so I did not test the code, contract or financial detectors.

## About PROPOSAL.md

PROPOSAL.md was rewritten in my words after the code was written. The original draft is in commit 6cb1ee6. Because it was written after the code, it describes what is built, including what is still a mock-up (the owner dashboard) and what I do not know yet.

## Why

Employees paste customer records, credentials, source code, contracts, and financials into AI tools every day. Most companies find out after the fact, if ever. AI Firewall makes the risk visible and enforceable at the moment it happens.

## What it does

- **Prompt & file inspection** — paste a prompt or attach text-based files (`.txt`, `.md`, `.csv`, `.json`, source files, logs, `.env`, …). Files are read locally with the browser File API.
- **Detection engine** (`detectors.js`)
  - **Secrets & credentials** — AWS keys, GitHub/OpenAI/Anthropic/Slack/Stripe/Google tokens, JWTs, private-key blocks, DB connection strings, hardcoded passwords, passwords and PINs stated in plain words ("my password is …"), credentialed URLs
  - **PII** — SSNs, Luhn-validated payment cards, emails, phones, dates of birth, passports, driver's licenses, street addresses
  - **Financial data** — IBANs, routing/account details, revenue/payroll/runway figures, invoice references
  - **Proprietary source code** — code-density heuristics that flag pasted code
  - **Contracts & legal** — clause-language heuristics (indemnification, governing law, NDA terms, …), matched on whole words so ordinary words like "Monday" and "agenda" do not count
- **Policy controls** — per data class: **Allow / Warn / Redact / Block**. Redaction produces a safe-to-send copy with placeholders.
- **Breach check (optional)** — detected passwords can be checked against Have I Been Pwned's Pwned Passwords list; only a 5-character hash prefix is sent.
- **Audit log** — every scan, policy decision, and simulated send is logged locally and exportable as JSON.
- **Dashboard** — inspections, flagged, blocked and breached-password counts, a 14-day trend (hand-written SVG), data types found, severity and outcomes, recent activity and policies in effect. Built from this browser's log only.
- **Authorized synthetic assessment** — a guided demo for a fictional company (*Northstar Robotics*) that generates obviously fake credentials, PII, and financials, runs four realistic workplace scenarios, and produces an exportable risk report. **Synthetic data only — no real person, company, credential, or network is involved or contacted.**

## Run the web app

It's a static app with zero dependencies and no build step:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` in a browser. (The breach check needs `crypto.subtle`, which browsers only allow on https or localhost; if you open the file directly and it is not available, the page says the check is unavailable and the rest still works.)

## Run the tests

The detector tests use Node's built-in test runner, so there is nothing to install:

```bash
node --test tests/detectors.test.js
node --test tests/zip.test.js
node --test tests/store.test.js
node --test tests/false-flags.test.js
node --test tests/breach-check.test.js
node --test tests/dashboard.test.js
```

Or all at once: `node --test tests/*.test.js`. The breach-check tests replace `fetch` with a fake, so they need no network.

The second one checks that the download is a real ZIP file.

## Architecture

| File | Role |
| --- | --- |
| `index.html` | App shell: Firewall console (opens first), Dashboard, Audit log, Policies, Assessment, Extension download |
| `breach-check.js` | Breach check: SHA-1 hashing, the Pwned Passwords range `fetch`, response parsing (Mini Project 3) |
| `detectors.js` | Pure detection engine (patterns + heuristics + redaction). Runs in browser or Node (`module.exports`). |
| `app.js` | Console UI, policy state, local audit log, dashboard rendering |
| `dashboard.js` | Dashboard and log maths and wording: totals, 14-day trend, SVG chart, plain-language event text (pure functions, tested) |
| `assessment.js` | Synthetic assessment module |
| `tests/*.test.js` | Tests with Node's built-in runner: detectors, false flags, extension store, ZIP, breach check, dashboard |
| `styles.css` | Styles following the design system in `DESIGN.md` |
| `extension/` | Chrome extension (Manifest V3) for ChatGPT, Claude, and Gemini |
| `dato-extension.zip` | Zipped copy of `extension/` for the download button |
| `tools/build-zip.py` | Rebuilds `dato-extension.zip` as a real ZIP (`python tools/build-zip.py`) |

State lives in `app.js`: `policies` (object, class to action), `events` (audit log array), `attachedFiles`, and `inspectedText` (the exact text the last Inspect ran on, which Send must still match). Policies and events are saved to `localStorage` (events hold counts only, including the breach-check counts `breachChecked` and `breached`); clearing site data or pressing Reset everything wipes them. Planning docs: [PROPOSAL.md](PROPOSAL.md), [PRD.md](PRD.md), [DESIGN.md](DESIGN.md), [AGENTS.md](AGENTS.md).

## Changes since the first submission

The first submission is commit `03cb8bf`. These changes were made afterwards by the AI agent, in separate commits. The two reflection sections above ("Where the agent differed" and "Required question") were not changed and describe the original submission.

| Commit | Change |
| --- | --- |
| `ffa3707` | Detector fixes: contract terms match whole words ("Monday agenda" no longer looks like an NDA) and "my password is …" is now caught |
| `4f59de5` | Send only works on the exact text that was inspected |
| `8c786d6` | The site opens on the Firewall tab; the Extension tab moved to the end |
| `366f6c3` | Keyboard focus rings, skip link, `aria-current` / `aria-pressed`, reduced-motion support |
| (this fix) | `dato-extension.zip` was really a tar archive with a `.zip` name, so Windows could not extract it. It is now a real ZIP, with a test |
| (false flags) | Fewer flags on harmless prompts, in both the website and the extension: "billing about" no longer counts as an invoice number, one line of code is no longer "proprietary source", "my password is not working" is no longer a credential, and in the extension the plain word "confidential" is no longer a flag. `tests/false-flags.test.js` covers both |
| (extension dashboard) | The extension now records each flag (counts and labels only) and has a real flagged-activity dashboard in place of the mock-up `executive-dashboard.html`. It shows zeros when empty and has a labelled demo-data button |
| `2e59d21`, `acceebe` | Detector tests with Node's built-in runner |
| `dfe919e`, then the restyle commit | New look (warm white, black text, cobalt). `DESIGN.md` was updated first, then `styles.css`; layout and behaviour are unchanged |

## Safety & scope

AI Firewall is a **defensive** security tool.

- All detection is local; the web app's "Send to AI" action is simulated and performs no network call.
- The only network call is the optional, off-by-default breach check, which sends a 5-character SHA-1 prefix to `api.pwnedpasswords.com`. No API key is used or stored.
- The assessment mode only ever uses fabricated data for a fictional company.
- AI Firewall does not test, probe, or interact with any third party's systems or data. Real assessments require written authorization and synthetic/canary data.
- Detection is best-effort pattern matching, not a guarantee. It is a demo of the product concept, not a certified control.

## Roadmap

- Managed policy sync and signed Chrome Web Store distribution
- Slack / email / IDE integrations
- Centralized policy management and SIEM export
- Custom detectors (keyword lists, regex, document canaries)
- SSO and team audit trails

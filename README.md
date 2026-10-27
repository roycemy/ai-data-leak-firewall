# Dato: AI data-leak firewall

**Stop confidential data from entering AI tools — without stopping people from using AI.**

Dato is a local-first AI data-leak firewall. It inspects prompts and files **before** they reach ChatGPT, Claude, or any other LLM, detects confidential content, and applies your policy: **warn**, **redact**, or **block**. Every inspection runs entirely in the browser — no prompt, file, or audit event is ever transmitted.

**Live:** https://roycemy.github.io/ai-data-leak-firewall/

## Where this repo came from

This repo was created for Mini Project 2 by copying over a concept I had been working on for the past few weeks (Dato). The history here starts at the copy, so it does not show that earlier work. For this assignment I added the planning documents (PROPOSAL.md, PRD.md, DESIGN.md, AGENTS.md), inline error handling, Reset everything, the keyboard shortcut, empty states and phone fixes. The Chrome extension is in [`extension/`](extension/README.md), and the site has an Extension tab to download it.

## How to use

1. **Firewall tab (opens first):** paste a prompt or attach text files, then press **Inspect locally** (or Ctrl/Cmd + Enter in the prompt box). Dato shows what it found and what your policy says to do. **Send** is only available after an inspection, and only while the text is exactly what was inspected. If you edit the prompt afterwards, inspect again.
2. **Policies tab:** set Allow / Warn / Redact / Block for each data class and inspect again to see the verdict change. **Reset everything** restores defaults and clears the log.
3. **Audit log tab:** filter events, export them as JSON, or clear them.
4. **Risk dashboard tab:** totals and charts computed from the log.
5. **Extension tab (last tab):** download `dato-extension.zip` and follow the install steps. The extension checks prompts on ChatGPT, Claude, and Gemini before they send.

Empty or invalid input (nothing to inspect, file over 2 MB, unreadable file) shows a message in the page. Nothing uses pop-up dialogs. Every control can be reached with the Tab key.

## Where the agent differed from what I expected

I pictured this as just an extension, so I did not put certain things in the proposal. Then I realized the value for business owners of having an actual dashboard connected to the extension. The agent built the website console, an Extension tab to download the extension, and an owner dashboard page at `extension/executive-dashboard.html`. That dashboard uses hardcoded demo data, and the extension does not send it any events yet, so it is a mock-up and not a working connection.

## Required question: AI output I did not accept as-is

I think I accepted the agent's output as-is, so I checked one commit: **86e3ffa** ("Add detection and redaction engine"), which added `detectors.js`. To verify it, I ran `scan` from `detectors.js` in Node on a test string with a fake AWS key, an SSN, a Luhn-valid test card number and an email. It found all four and masked each value. A harmless sentence ("hello, lunch at noon?") returned no findings. I ran this check on 2026-10-26 with the agent's help. It only covers those four patterns, so I did not test the code, contract or financial detectors.

## About PROPOSAL.md

PROPOSAL.md was rewritten in my words after the code was written. The original draft is in commit 6cb1ee6. Because it was written after the code, it describes what is built, including what is still a mock-up (the owner dashboard) and what I do not know yet.

## Why

Employees paste customer records, credentials, source code, contracts, and financials into AI tools every day. Most companies find out after the fact, if ever. Dato makes the risk visible and enforceable at the moment it happens.

## What it does

- **Prompt & file inspection** — paste a prompt or attach text-based files (`.txt`, `.md`, `.csv`, `.json`, source files, logs, `.env`, …). Files are read locally with the browser File API.
- **Detection engine** (`detectors.js`)
  - **Secrets & credentials** — AWS keys, GitHub/OpenAI/Anthropic/Slack/Stripe/Google tokens, JWTs, private-key blocks, DB connection strings, hardcoded passwords, passwords and PINs stated in plain words ("my password is …"), credentialed URLs
  - **PII** — SSNs, Luhn-validated payment cards, emails, phones, dates of birth, passports, driver's licenses, street addresses
  - **Financial data** — IBANs, routing/account details, revenue/payroll/runway figures, invoice references
  - **Proprietary source code** — code-density heuristics that flag pasted code
  - **Contracts & legal** — clause-language heuristics (indemnification, governing law, NDA terms, …), matched on whole words so ordinary words like "Monday" and "agenda" do not count
- **Policy controls** — per data class: **Allow / Warn / Redact / Block**. Redaction produces a safe-to-send copy with placeholders.
- **Audit log** — every scan, policy decision, and simulated send is logged locally and exportable as JSON.
- **Risk dashboard** — findings by data class, policy outcomes, 7-day activity, and current posture at a glance.
- **Authorized synthetic assessment** — a guided demo for a fictional company (*Northstar Robotics*) that generates obviously fake credentials, PII, and financials, runs four realistic workplace scenarios, and produces an exportable risk report. **Synthetic data only — no real person, company, credential, or network is involved or contacted.**

## Run the web app

It's a static app with zero dependencies and no build step:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` in a browser.

## Run the tests

The detector tests use Node's built-in test runner, so there is nothing to install:

```bash
node --test tests/detectors.test.js
```

## Architecture

| File | Role |
| --- | --- |
| `index.html` | App shell: Firewall console (opens first), Policies, Audit log, Risk dashboard, Assessment, Extension download |
| `detectors.js` | Pure detection engine (patterns + heuristics + redaction). Runs in browser or Node (`module.exports`). |
| `app.js` | Console UI, policy state, local audit log, dashboard |
| `assessment.js` | Synthetic assessment module |
| `tests/detectors.test.js` | Tests for `detectors.js` (Node's built-in runner) |
| `styles.css` | Brand and component system |
| `extension/` | Chrome extension (Manifest V3) for ChatGPT, Claude, and Gemini |
| `dato-extension.zip` | Zipped copy of `extension/` for the download button |

State lives in `app.js`: `policies` (object, class to action), `events` (audit log array), `attachedFiles`, and `inspectedText` (the exact text the last Inspect ran on, which Send must still match). Policies and events are saved to `localStorage`; clearing site data or pressing Reset everything wipes them. Planning docs: [PROPOSAL.md](PROPOSAL.md), [PRD.md](PRD.md), [DESIGN.md](DESIGN.md), [AGENTS.md](AGENTS.md).

## Changes since the first submission

The first submission is commit `03cb8bf`. These changes were made afterwards by the AI agent, in separate commits. The two reflection sections above ("Where the agent differed" and "Required question") were not changed and describe the original submission.

| Commit | Change |
| --- | --- |
| `ffa3707` | Detector fixes: contract terms match whole words ("Monday agenda" no longer looks like an NDA) and "my password is …" is now caught |
| `4f59de5` | Send only works on the exact text that was inspected |
| `8c786d6` | The site opens on the Firewall tab; the Extension tab moved to the end |
| `366f6c3` | Keyboard focus rings, skip link, `aria-current` / `aria-pressed`, reduced-motion support |
| `2e59d21`, `acceebe` | Detector tests with Node's built-in runner |
| `dfe919e`, then the restyle commit | New look (warm white, black text, cobalt). `DESIGN.md` was updated first, then `styles.css`; layout and behaviour are unchanged |

## Safety & scope

Dato is a **defensive** security tool.

- All detection is local; the web app's "Send to AI" action is simulated and performs no network call.
- The assessment mode only ever uses fabricated data for a fictional company.
- Dato does not test, probe, or interact with any third party's systems or data. Real assessments require written authorization and synthetic/canary data.
- Detection is best-effort pattern matching, not a guarantee. It is a demo of the product concept, not a certified control.

## Roadmap

- Managed policy sync and signed Chrome Web Store distribution
- Slack / email / IDE integrations
- Centralized policy management and SIEM export
- Custom detectors (keyword lists, regex, document canaries)
- SSO and team audit trails

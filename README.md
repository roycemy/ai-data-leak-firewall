# Dato: AI data-leak firewall

**Stop confidential data from entering AI tools — without stopping people from using AI.**

Dato is a local-first AI data-leak firewall. It inspects prompts and files **before** they reach ChatGPT, Claude, or any other LLM, detects confidential content, and applies your policy: **warn**, **redact**, or **block**. Every inspection runs entirely in the browser — no prompt, file, or audit event is ever transmitted.

**Live:** https://roycemy.github.io/ai-data-leak-firewall/

## Where this repo came from

This repo was created for Mini Project 2 by copying over a concept I had been working on for the past few weeks (Dato). The history here starts at the copy, so it does not show that earlier work. For this assignment I added the planning documents (PROPOSAL.md, PRD.md, DESIGN.md, AGENTS.md), inline error handling, Reset everything, the keyboard shortcut, empty states and phone fixes. The separate Chrome extension was left out of this repo.

## How to use

1. **Firewall tab:** paste a prompt or attach text files, then press **Inspect locally** (or Ctrl/Cmd + Enter in the prompt box). Dato shows what it found and what your policy says to do.
2. **Policies tab:** set Allow / Warn / Redact / Block for each data class and inspect again to see the verdict change. **Reset everything** restores defaults and clears the log.
3. **Audit log tab:** filter events, export them as JSON, or clear them.
4. **Risk dashboard tab:** totals and charts computed from the log.

Empty or invalid input (nothing to inspect, file over 2 MB, unreadable file) shows a message in the page. Nothing uses pop-up dialogs.

## Where the agent differed from what I expected

> TODO (write one line in your own words once you have checked the finished tool against PROPOSAL.md).

## Required question: AI output I did not accept as-is

> TODO: pick one specific commit (hash), say what the agent gave you, what you changed, and how you knew it needed changing. If the output was fine first time, say how you verified it.

## Why

Employees paste customer records, credentials, source code, contracts, and financials into AI tools every day. Most companies find out after the fact, if ever. Dato makes the risk visible and enforceable at the moment it happens.

## What it does

- **Prompt & file inspection** — paste a prompt or attach text-based files (`.txt`, `.md`, `.csv`, `.json`, source files, logs, `.env`, …). Files are read locally with the browser File API.
- **Detection engine** (`detectors.js`)
  - **Secrets & credentials** — AWS keys, GitHub/OpenAI/Anthropic/Slack/Stripe/Google tokens, JWTs, private-key blocks, DB connection strings, hardcoded passwords, credentialed URLs
  - **PII** — SSNs, Luhn-validated payment cards, emails, phones, dates of birth, passports, driver's licenses, street addresses
  - **Financial data** — IBANs, routing/account details, revenue/payroll/runway figures, invoice references
  - **Proprietary source code** — code-density heuristics that flag pasted code
  - **Contracts & legal** — clause-language heuristics (indemnification, governing law, NDA terms, …)
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

## Architecture

| File | Role |
| --- | --- |
| `index.html` | App shell: Firewall console, Policies, Audit log, Risk dashboard, Assessment |
| `detectors.js` | Pure detection engine (patterns + heuristics + redaction). Runs in browser or Node (`module.exports`). |
| `app.js` | Console UI, policy state, local audit log, dashboard |
| `assessment.js` | Synthetic assessment module |
| `styles.css` | Brand and component system |

State lives in `app.js`: `policies` (object, class to action), `events` (audit log array) and `attachedFiles`. Policies and events are saved to `localStorage`; clearing site data or pressing Reset everything wipes them. Planning docs: [PROPOSAL.md](PROPOSAL.md), [PRD.md](PRD.md), [DESIGN.md](DESIGN.md), [AGENTS.md](AGENTS.md).

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

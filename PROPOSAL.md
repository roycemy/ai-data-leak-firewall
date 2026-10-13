# Proposal — Dato

> DRAFT SCAFFOLD: the assignment requires this file in YOUR words, written before the agent codes. Rewrite each section in your own voice before submitting.

## What I am building
A browser tool that checks a prompt or file for confidential data before it is pasted into an AI tool, and remembers what it caught.

## Who it is for
Me and any coworker who pastes work text into ChatGPT or Claude. The problem: it is easy to paste an API key, a customer's SSN or a contract clause without noticing.

## What it remembers
- **Policies:** for each of five data classes (secrets, PII, financial, source code, contract), one of Allow / Warn / Redact / Block.
- **Audit log:** a list of events (time, source, number of findings, worst severity, action taken).
- **The current draft:** the prompt text and attached files, while the page is open.

## Where the data lives
Policies and audit log: state in JavaScript, saved to `localStorage` so they survive a refresh. Draft and attachments: variables only.

## What each action changes
- **Inspect:** finds sensitive items, picks the strictest policy action among them, adds one event to the audit log.
- **Change a policy:** that class's action changes and the next inspection can reach a different verdict.
- **Send (simulated):** adds a "sent" event; blocked content cannot be sent.
- **Clear:** empties the prompt, attachments and result.
- **Filter the log:** changes which events are shown, not the data.
- **Clear log / Reset everything:** the log empties and the dashboard counts go to zero; Reset also restores default policies.

## Features
1. Detect secrets, PII, financial data, code and contract language.
2. Per-class policy: allow, warn, redact, block.
3. Redacted copy that is safe to send.
4. Audit log with filter and JSON export.
5. Risk dashboard computed from the log.

## What I do not know yet
- How to read files in the browser (FileReader).
- How to write regular expressions that catch real secrets without too many false hits.
- How to keep state in sync with the page after every change.
- How to save and load objects with localStorage.

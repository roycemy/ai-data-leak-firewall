# Proposal — Dato

## What I am building
I am building an extension for companies that have big enterprise AI plans and want to make sure their employees aren't uploading confidential information to these systems. As AI use increases and more businesses adopt it, owners are going to want to make sure data is not being leaked. The goal is a central dashboard for owners to manage what their employees are sending and to make sure employees aren't sending confidential information. I first pictured it as just an extension, but then I realized the value for business owners of having an actual dashboard connected to the extension.

## Who it is for
Company owners and security staff who don't want confidential data ending up in AI tools, and the employees who use ChatGPT, Claude and Gemini every day. The problem it solves is simple. Someone pastes an API key, an SSN or a chunk of a contract into a chat without thinking, and it's gone. Dato checks the text before it gets sent.

## What it remembers
- **Policies.** Each type of sensitive data (secrets, personal info, financial, source code, contracts) is set to Allow, Warn, Redact or Block. The extension has a sixth type, "Sensitive context", that the website doesn't.
- **Audit log (website only).** It keeps the last 250 events. Each one has the time, source, number of findings, worst severity and the action taken. It logs scans, simulated sends and policy changes, not just scans.
- **Current draft (website only).** The prompt and any attached files, only until the page is closed or reloaded.

## Where the data lives
- **Website:** policies and the log sit in `app.js` and are saved to `localStorage`. The draft is just a variable, so it's never saved.
- **Extension:** policies are in `chrome.storage.local`, and it keeps no log at all. It doesn't share anything with the website, so a policy changed in one doesn't change the other.
- **Owner dashboard:** `extension/executive-dashboard.html` is a mock-up with made-up people and numbers typed straight into the file. It isn't connected to anything. The website also has its own dashboard view, and that one is built from the real local log.

## What each action changes
- **Inspect:** scans the text, takes the strictest action across everything it found, and logs one event.
- **Policy buttons:** change that data type's action, save it, and add a line to the log.
- **Send (simulated):** logs a "sent" event, and it's disabled when the result is Block.
- **Clear:** empties the form and leaves the log alone.
- **Clear log and Reset everything:** both need a second click within 4 seconds. Reset also restores the default policies and wipes the log.
- **Extension:** catches the send button and Enter on ChatGPT, Claude and Gemini, then shows a pop-up if the policy says warn, redact or block. Unlike the website, a Block pop-up still lets you click "Send anyway" (it asks twice), so it's not a hard block.

## Features
1. Detect secrets, personal data, financial data, code and contract language, all in the browser.
2. Per-type policy: allow, warn, redact, block.
3. Redacted copy that is safe to send.
4. Audit log with filter and JSON export (website).
5. Risk dashboard built from the website log.
6. Chrome extension that checks prompts on ChatGPT, Claude and Gemini before they send.
7. Owner dashboard mock-up using demo data.

## What I do not know yet
- **Real events from many employees:** how to get them into one owner dashboard. Right now it's a mock-up, and my own rules (no server, no fetch) rule out the usual way of doing it.
- **Detection accuracy:** how to catch more real leaks and flag fewer false alarms.
- **Sign-in and enrollment:** how employees would join a company and how one policy would apply to everyone.
- **Block in the extension:** whether it should be a real block with no override.

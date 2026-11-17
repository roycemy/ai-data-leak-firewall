# Proposal — AI Firewall

(The project started under the name Dato. It is now called AI Firewall. The repo name and the Chrome extension still say Dato.)

## What I am building
I am building an extension for companies that have big enterprise AI plans and want to make sure their employees aren't uploading confidential information to these systems. As AI use increases and more businesses adopt it, owners are going to want to make sure data is not being leaked. The goal is a central dashboard for owners to manage what their employees are sending and to make sure employees aren't sending confidential information. I first pictured it as just an extension, but then I realized the value for business owners of having an actual dashboard connected to the extension.

## Who it is for
Company owners and security staff who don't want confidential data ending up in AI tools, and the employees who use ChatGPT, Claude and Gemini every day. The problem it solves is simple. Someone pastes an API key, an SSN or a chunk of a contract into a chat without thinking, and it's gone. AI Firewall checks the text before it gets sent. For Mini Project 3 it can also check whether a password someone is about to paste has already leaked in a known data breach, using the free Have I Been Pwned Pwned Passwords API.

## What it remembers
- **Policies.** Each type of sensitive data (secrets, personal info, financial, source code, contracts) is set to Allow, Warn, Redact or Block. The extension has a sixth type, "Sensitive context", that the website doesn't.
- **Audit log (website only).** It keeps the last 250 events. Each one has the time, source, number of findings, worst severity and the action taken. It logs scans, simulated sends and policy changes, not just scans.
- **Breach-check results (website only, Mini Project 3).** For each inspection with the breach check on, the log keeps two numbers: how many passwords were checked and how many were found in known breaches. It never keeps the password or its hash.
- **Current draft (website only).** The prompt and any attached files, only until the page is closed or reloaded.

## Where the data lives
- **Website:** policies and the log sit in `app.js` and are saved to `localStorage`. The draft is just a variable, so it's never saved.
- **Extension:** policies are in `chrome.storage.local`. It also keeps its own flag log there (`dato_events`), counts and labels only, never the prompt or the values it found. It doesn't share anything with the website, so a policy changed in one doesn't change the other.
- **Owner dashboard:** the extension has a flagged-activity dashboard (`extension/dashboard.html`), built from the extension's own flag log on that computer. It shows zeros when nothing is flagged and has a clearly labelled demo-data button whose examples are never saved. (Commit `a91da88` replaced the old mock-up `executive-dashboard.html`, which had made-up people and numbers.) The website has its own Risk dashboard, built from the website's local log. The two do not share data.

## What each action changes
- **Inspect:** scans the text, takes the strictest action across everything it found, and logs one event.
- **Breach-check box (off by default):** when it is ticked and Inspect finds a password, the browser hashes the password with SHA-1, sends only the first 5 characters of that hash to Have I Been Pwned, and looks for the rest of the hash in the list that comes back. A match means the password is in known breaches: that finding becomes critical and the log and dashboard count it as found in breaches. (It means the password string is in breach data, not that the person's own account was breached.) If the API is offline or returns an error, the page says so and the normal scan result still stands.
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
7. Flagged-activity dashboard in the extension, built from its own local flag log.
8. Optional breach check for detected passwords (Have I Been Pwned Pwned Passwords API, Mini Project 3).

## What I do not know yet
- **Real events from many employees:** how to get them into one owner dashboard. Right now each dashboard only sees its own computer, and my rules (no server, and only one outside API) rule out the usual way of doing it.
- **Detection accuracy:** how to catch more real leaks and flag fewer false alarms.
- **Sign-in and enrollment:** how employees would join a company and how one policy would apply to everyone.
- **Block in the extension:** whether it should be a real block with no override.

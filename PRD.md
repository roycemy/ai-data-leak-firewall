# PRD — AI Firewall web console

## Goal
Let a person check a prompt or file for confidential data before it goes to an AI tool, apply a policy, and keep a local record. Optionally, check any password found in the text against known data breaches (Mini Project 3).

## User
Someone who pastes work text into AI tools: an employee, or the security person reviewing what employees might leak.

## State (all in `app.js`)
| Name | Type | Persisted | Read by | Changed by |
| --- | --- | --- | --- | --- |
| `policies` | object, class → `allow/warn/redact/block` | `localStorage` `dato.policies.v1` | `evaluate`, scan result, posture | policy buttons, Reset everything |
| `events` | array of audit events | `localStorage` `dato.events.v1` (last 250) | audit log, dashboard | every inspect, send, policy change; Clear log; Reset |
| `attachedFiles` | array of `{name, text}` | no | `scanNow`, `currentText` | file input, chip ×, Clear |
| `breachCheckOn` | boolean, the "Also check detected passwords against known breaches" box. Off by default | no | `scanNow` | the checkbox; Clear leaves it alone; Reset everything turns it off |
| `breachRunId` | number: which inspection the latest breach check belongs to | no | `runBreachCheck` (drops answers for an older inspection) | each Inspect, Clear and edit |
| `inspectedText` | string or `null`: the exact prompt + files text the last Inspect ran on | no | Send button, its click handler | `scanNow` sets it; editing the prompt, adding or removing a file, Clear and an empty Inspect set it back to `null` |

## Worked-out output
- Breach count per detected password, from the Pwned Passwords range response (see below). A password found at least once is "found in breaches" (the string is in breach data; it does not mean the user's account was breached): its finding is raised to critical and tagged, and the event's `breached` count goes up.
- Audit events gain two numbers when the breach check ran: `breachChecked` (passwords checked) and `breached` (passwords found in breaches), plus `breachRan: true` with `breachChecked: 0` when the box was on but there was no password, and `breachError: true` when the check could not run. The log's Breach check column shows "—" (off), "No password to check", "Not found in breaches (N passwords)", "N of M passwords found in breaches" or "Breach check failed" ("—" for sends and policy changes, and Severity is "—" when nothing was found). Counts only: never the password, the hash or the prefix.
- Findings per class, from `DatoDetect.scan`.
- Governing action: the strictest policy among the findings (block > redact > warn > allow).
- Redacted copy of the text.
- Dashboard (`dashboard.js`, pure functions with tests): a status line under the title (`status()` in dashboard.js, last 14 days: "◆ N prompt(s) had a password found in known breaches. Change …" in red when any did, otherwise "✓ Working. N risky prompts blocked in the last 14 days." or "… checked …, none blocked."), four stats (Inspections, Flagged, Blocked, Password alerts; the last one is captioned "Inspections with a breached password" and is the number of events with `breached` > 0, so it counts inspections, not distinct passwords), a 14-day inline-SVG trend of clean and flagged inspections with whole-number ticks and a 0 baseline (7 days plus the hint "Activity will build up over the next few days" while there is activity on fewer than 3 days), data types found as horizontal bars, worst-severity and outcome breakdowns, the five most recent events ("just now", "5 min ago", "Yesterday", "3 days ago"), and the policies in effect with what each covers. The lede says the data stays in this browser; there is no multi-user data.

## Send rule
Send works only on text that was inspected. `inspectedText` holds that text, and Send is allowed only while the prompt box and files still produce exactly the same text. Any edit makes the old result stale: Send is disabled ("Inspect first to send"), the result panel asks for a new inspection, and a forced click is refused by the same check. Block still disables Send.

## Breach check (the one API call)
API: Have I Been Pwned, Pwned Passwords range endpoint, https://haveibeenpwned.com/API/v3#PwnedPasswords. No key.
1. Only when the box is ticked and Inspect finds a password (the `credential-named` or `hardcoded-password` rule, with the word password, passwd, pwd, passcode or passphrase).
2. The browser hashes the password with SHA-1 (`crypto.subtle.digest`) and turns it into 40 upper-case hex characters.
3. `fetch('https://api.pwnedpasswords.com/range/' + first5)` inside `try/catch`, with `await`.
4. If `response.ok` is false (for example 404, 429 or 503), that is an error, not a result.
5. The answer is plain text, one `SUFFIX:COUNT` line per hash that starts with those 5 characters. The page looks for the line whose suffix equals the other 35 characters. Its count is how many times the password appears in breaches; no line means 0.
6. The password and full hash stay in memory only for the check and are never saved or shown.
7. On screen the wording stays plain: every result summary (found, not found, error) ends with "Your password stayed on this device." The SHA-1 and 5-character detail is in "How this works" and the README.

## Interactions
1. Buttons: Inspect, Send (only after Inspect, and only until the text changes), Clear, policy toggles, Clear log, Export, Reset everything.
2. File input: attach text files.
3. Keyboard: Ctrl/Cmd + Enter in the prompt box inspects.
4. Dropdown: audit log filter, including "Password found in breaches".
5. Keyboard: every control can be reached with Tab and shows a cobalt focus ring; a skip link jumps to the tool; the open tab is marked for screen readers; motion is turned off when the browser asks for reduced motion.
6. Switch (a styled checkbox): "Check passwords against known breaches" on the Firewall tab, off by default, with one line under it ("Your password stays on this device. Only a short scrambled code is checked online.") and a closed "How this works" disclosure holding the details. Ticking it does not re-run the last inspection ("Runs on your next Inspect."). Unticking it removes any breach-check lines and ignores an answer still on its way. It is not saved, so it is off again after a reload (the disclosure says so).
7. Links: the dashboard's empty-state button opens the Firewall; "View audit log" and "Edit" jump to the Audit log and Policies.

## Page states
| State | When | What the page shows |
| --- | --- | --- |
| Empty | first visit, nothing typed | Result card: icon, "Nothing inspected yet" and one sentence. Audit log: "No events yet" (or "No events match this filter" when a filter hides every event). Dashboard: no status line, zero stats and a "No activity yet" card with a "Go to Firewall" button instead of empty charts. Default policies. Send is hidden until an inspection. With no events the site opens on this Firewall tab (with events it opens on the Dashboard, the first tab); the Extension tab is the last tab. The breach-check box is unticked and its privacy note says what would be sent. Dashboard "Inspections with a breached password" is 0. |
| Breach check: nothing to check | box ticked, Inspect finds no password | Under the findings: "Breach check: no passwords found, so nothing was sent to Have I Been Pwned." No network call. |
| Breach check: loading | box ticked, password found, waiting for the API | Each password row says "Checking known breaches…" (small spinner, none with reduced motion) and the summary line says "Checking N passwords against known breaches…" (`aria-busy`). The local result and Send button are already usable. |
| Breach check: error | offline, network error, non-OK status (404, 429, 503…), or a browser without `crypto.subtle` | Each password row says "▲ Breach check unavailable"; the amber summary line reads "▲ Breach check unavailable: <reason>. The local scan above still applies. Your password stayed on this device." Reasons: "too many checks, wait a few seconds and try again" (429), "Have I Been Pwned is busy or unavailable right now (status N). Try Inspect again in a minute" (other non-OK), "you appear to be offline" or "could not reach Have I Been Pwned" (no answer). The verdict, findings, Send rule and log work as normal; the event gets `breachError: true`. |
| Invalid input | Inspect with no text and no files; file over 2 MB; unreadable file | Red message under the prompt box (`role="alert"`), red border on the box, focus returns to the box. No pop-ups. The message clears when the user types or attaches a valid file. With the breach-check box ticked, nothing is sent to the API either. |
| Edited after inspecting | prompt or files change while a result is showing | The old result is replaced by "The prompt changed" and one sentence asking for a new Inspect; Send is hidden until the next Inspect. A breach check still running for the old text is ignored when it answers. |
| In use | text or files inspected | One verdict banner (icon + word, and in plain words which kinds of data decided it: "Your policy blocks passwords and keys. Remove them, or change the rule in Policies."), then finding rows sorted by severity (badge with icon + word, a plain label such as "Password in the message", the data type and the masked value; a password shows only its last two characters, "••••••••23"), a redacted copy when policy is Redact, Send button text matches the verdict (on Block there is no Send button; the banner says it), log and dashboard update. With the breach check on, the result sits inside the password's own row: a password found in breaches is raised to Critical and the row says "◆ Found in known breaches · seen N times. Change this password everywhere it is used." (updated in place, no extra badge); otherwise the row says "✓ Not found in known breaches". One muted summary under the findings (the `role=status` region): "Breach check done. Your password stayed on this device." A simulated Send logs one send event and does not inspect again; the button stays done until the next Inspect. The log's Breach check column and the dashboard count update. |
| After reset | Clear (console only) or Reset everything (policies, log, console) | Console returns to the empty state (Send hidden again); after Reset everything the policies are the defaults, the log is empty, the breach-check box is unticked and the dashboard shows the empty state ("Password alerts" 0); the next visit opens on the Firewall. Destructive buttons ask for a second click, not a dialog. |

## Default policy for SSNs and payment cards
SSNs and payment card numbers stay in the Personal details class in the log, but they use the Passwords & keys policy. That policy defaults to Block, so a customer card or SSN is stopped at least as strictly as an API key, on the site and in the extension. Other personal details (emails, phones, addresses) still default to Warn.

## Detector rules added after live testing
- A dashed SSN (`123-45-6789`) is always flagged. A spaced or 9-digit SSN is flagged when it sits near words such as social, ssn, tax, ein or tin (for example "her social is 123 45 6789" or "nine digits: 123456789 for taxes").
- A high-entropy value after is/=/: near words such as magic word, passcode, passphrase, login, pin, creds, combo or secret is flagged (for example "the magic word for the admin panel is Tr0ub4dor&3"). Ordinary sentences such as "hello, lunch at noon?" and "my password is not working" stay clean.
- "Customer SSN is 123-45-6789, card 4111 1111 1111 1111" is only an SSN and a card, not a "password in the message".
- An email-shaped substring inside a credential URL (`postgres://admin:pass@host.example.com`, `https://user:pass@host.example.com`) is not flagged as an email.

## Extension intervention (v1.2.0)
When the extension stops a prompt on ChatGPT, Claude or Gemini, the dialog offers **Go back**, **Remove and send** (the primary action: it replaces flagged values in the composer with placeholders such as `[REDACTED CARD]` and then sends), and **Send anyway** (a confirm-twice danger action). **Remove and send** appears on Warn and Block as well as Redact, whenever a finding has an exact value to replace. If the same prompt also has a whole-prompt finding (source code or contract language), a note says those parts would go out unchanged; if every finding is whole-prompt, the button is hidden. The extension toolbar, intervention dialog, activity dashboard and icons use the cobalt "A" mark from the site favicon. The download is `ai-firewall-extension.zip`, with `manifest.json` at the zip root so "Load unpacked" works on the extracted folder.

## Constraints
Plain HTML, CSS and JavaScript. No framework, no CDN, no server, no API key. One outside API, only the call described above. Semantic HTML, readable on a phone (the audit log becomes stacked cards below 720px, with no sideways scroll). Styling follows DESIGN.md. Deployed on GitHub Pages.

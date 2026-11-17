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
- Audit events gain two numbers when the breach check ran: `breachChecked` (passwords checked) and `breached` (passwords found in breaches), plus `breachError: true` when the check could not run. Counts only: never the password, the hash or the prefix.
- Findings per class, from `DatoDetect.scan`.
- Governing action: the strictest policy among the findings (block > redact > warn > allow).
- Redacted copy of the text.
- Dashboard: totals, findings per class, outcome split, 7-day activity, and "Inspections with a breached password" (the number of events with `breached` > 0; it counts inspections, not distinct passwords).

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

## Interactions
1. Buttons: Inspect, Send (only after Inspect, and only until the text changes), Clear, policy toggles, Clear log, Export, Reset everything.
2. File input: attach text files.
3. Keyboard: Ctrl/Cmd + Enter in the prompt box inspects.
4. Dropdown: audit log filter, including "Password found in breaches".
5. Keyboard: every control can be reached with Tab and shows a cobalt focus ring; a skip link jumps to the tool; the open tab is marked for screen readers; motion is turned off when the browser asks for reduced motion.
6. Checkbox: "Also check detected passwords against known breaches" on the Firewall tab, off by default. Ticking it does not re-run the last inspection; the note under it says "Runs on your next Inspect." Unticking it removes any breach-check note and ignores an answer still on its way. It is not saved, so it is off again after a reload (the note says so).

## Page states
| State | When | What the page shows |
| --- | --- | --- |
| Empty | first visit, nothing typed | Result panel: "Paste a prompt or attach a file…". Audit log: "No events yet…". Dashboard: "No data yet…" with zero counts. Default policies. Send is disabled and reads "Inspect first to send". The site opens on this Firewall tab; the Extension tab is the last tab. The breach-check box is unticked and its privacy note says what would be sent. Dashboard "Inspections with a breached password" is 0. |
| Breach check: nothing to check | box ticked, Inspect finds no password | Under the result: "No passwords found, so nothing was sent to Have I Been Pwned." No network call. |
| Breach check: loading | box ticked, password found, waiting for the API | Under the result: "Checking N password(s) against known breaches…" (`aria-busy`). The local result and Send button are already usable. |
| Breach check: error | offline, network error, non-OK status (404, 429, 503…), or a browser without `crypto.subtle` | Amber note: "Breach check unavailable: <reason>. The local scan above still applies." The verdict, findings, Send rule and log work as normal; the event gets `breachError: true`. |
| Invalid input | Inspect with no text and no files; file over 2 MB; unreadable file | Red message under the prompt box (`role="alert"`), red border on the box, focus returns to the box. No pop-ups. The message clears when the user types or attaches a valid file. With the breach-check box ticked, nothing is sent to the API either. |
| Edited after inspecting | prompt or files change while a result is showing | The old result is replaced by "You changed the prompt after it was inspected. Press Inspect locally…", and Send is disabled until the next Inspect. A breach check still running for the old text is ignored when it answers. |
| In use | text or files inspected | Verdict banner coloured by action, findings grouped by class with masked values, redacted copy when policy is Redact, Send button text matches the verdict, log and dashboard update. With the breach check on: each password shows "Found in known breaches N times" (finding raised to CRITICAL, tagged "Found in breaches") or "Not found in known breaches", and the log's Breach check column and the dashboard count update. |
| After reset | Clear (console only) or Reset everything (policies, log, console) | Console returns to the empty state (Send disabled again); after Reset everything the policies are the defaults, the log is empty, the breach-check box is unticked and the dashboard shows the empty state ("Inspections with a breached password" 0). Destructive buttons ask for a second click, not a dialog. |

## Constraints
Plain HTML, CSS and JavaScript. No framework, no CDN, no server, no API key. One outside API, only the call described above. Semantic HTML, readable on a phone. Deployed on GitHub Pages.

# PRD — Dato web console

## Goal
Let a person check a prompt or file for confidential data before it goes to an AI tool, apply a policy, and keep a local record.

## User
Someone who pastes work text into AI tools: an employee, or the security person reviewing what employees might leak.

## State (all in `app.js`)
| Name | Type | Persisted | Read by | Changed by |
| --- | --- | --- | --- | --- |
| `policies` | object, class → `allow/warn/redact/block` | `localStorage` `dato.policies.v1` | `evaluate`, scan result, posture | policy buttons, Reset everything |
| `events` | array of audit events | `localStorage` `dato.events.v1` (last 250) | audit log, dashboard | every inspect, send, policy change; Clear log; Reset |
| `attachedFiles` | array of `{name, text}` | no | `scanNow`, `currentText` | file input, chip ×, Clear |
| `inspectedText` | string or `null`: the exact prompt + files text the last Inspect ran on | no | Send button, its click handler | `scanNow` sets it; editing the prompt, adding or removing a file, Clear and an empty Inspect set it back to `null` |

## Worked-out output
- Findings per class, from `DatoDetect.scan`.
- Governing action: the strictest policy among the findings (block > redact > warn > allow).
- Redacted copy of the text.
- Dashboard: totals, findings per class, outcome split, 7-day activity.

## Send rule
Send works only on text that was inspected. `inspectedText` holds that text, and Send is allowed only while the prompt box and files still produce exactly the same text. Any edit makes the old result stale: Send is disabled ("Inspect first to send"), the result panel asks for a new inspection, and a forced click is refused by the same check. Block still disables Send.

## Interactions
1. Buttons: Inspect, Send (only after Inspect, and only until the text changes), Clear, policy toggles, Clear log, Export, Reset everything.
2. File input: attach text files.
3. Keyboard: Ctrl/Cmd + Enter in the prompt box inspects.
4. Dropdown: audit log filter.
5. Keyboard: every control can be reached with Tab and shows a teal focus ring; a skip link jumps to the tool; the open tab is marked for screen readers; motion is turned off when the browser asks for reduced motion.

## Page states
| State | When | What the page shows |
| --- | --- | --- |
| Empty | first visit, nothing typed | Result panel: "Paste a prompt or attach a file…". Audit log: "No events yet…". Dashboard: "No data yet…" with zero counts. Default policies. Send is disabled and reads "Inspect first to send". The site opens on this Firewall tab; the Extension tab is the last tab. |
| Invalid input | Inspect with no text and no files; file over 2 MB; unreadable file | Red message under the prompt box (`role="alert"`), red border on the box, focus returns to the box. No pop-ups. The message clears when the user types or attaches a valid file. |
| Edited after inspecting | prompt or files change while a result is showing | The old result is replaced by "You changed the prompt after it was inspected. Press Inspect locally…", and Send is disabled until the next Inspect. |
| In use | text or files inspected | Verdict banner coloured by action, findings grouped by class with masked values, redacted copy when policy is Redact, Send button text matches the verdict, log and dashboard update. |
| After reset | Clear (console only) or Reset everything (policies, log, console) | Console returns to the empty state (Send disabled again); after Reset everything the policies are the defaults, the log is empty and the dashboard shows the empty state. Destructive buttons ask for a second click, not a dialog. |

## Constraints
Plain HTML, CSS and JavaScript. No framework, no CDN, no server, no outside API. Semantic HTML, readable on a phone. Deployed on GitHub Pages.

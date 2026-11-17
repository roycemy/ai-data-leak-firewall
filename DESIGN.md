# Design system

## Feel
A calm, premium security product that a business owner would pay for: warm off-white page, white cards, near-black text and one cobalt accent. Colour is kept for meaning (severity and outcome). There is no decoration beyond fine borders and one soft shadow. Every screen has one clear primary action.

(The first version was a dark teal console, and Mini Project 2 used warm white with cobalt. This Mini Project 3 pass tightens that look into the system below. Behaviour is unchanged unless PRD.md says otherwise.)

## Colour (tokens in `styles.css` `:root`)
| Token | Value | Use |
| --- | --- | --- |
| `--bg` | #F7F6F3 | page |
| `--surface` / `--surface-2` | #FFFFFF / #F2F1EC | cards / quiet fills (inputs, tracks, hover) |
| `--border` / `--border-strong` | #E5E2DA / #D2CEC4 | card and row borders / control borders |
| `--text` / `--text-2` | #16150F / #5C5850 | primary text / secondary text (6.9:1 on white) |
| `--accent` / `--accent-strong` / `--accent-tint` | #2F5BFF / #2347D6 / #EEF2FF | brand, primary button, links, focus ring, charts |
| `--critical` on `--critical-tint` | #B42318 on #FEF0EE | critical severity, Blocked, errors, destructive |
| `--high` on `--high-tint` | #B54708 on #FFF4E5 | high severity, Warned |
| `--medium` on `--medium-tint` | #7A5A00 on #FFF8DB | medium severity |
| `--low` on `--low-tint` | #5C5850 on #F2F1EC | low severity, neutral |
| `--ok` on `--ok-tint` | #1E6B3A on #EAF5EE | clean, allowed, not found in breaches |

Cobalt is the brand and never means "safe". Red is used only for critical, blocked and errors, so it stays loud.

## Severity (always colour + icon + word)
| Severity | Icon | Word |
| --- | --- | --- |
| Critical | ◆ | Critical |
| High | ▲ | High |
| Medium | ● | Medium |
| Low | ○ | Low |

Outcomes use the same badge with a dot: Blocked (critical colours), Warned (high), Redacted (accent), Clean or Allowed (ok), Sent and Policy change (neutral).

## Type
These are the only sizes in `styles.css` (12, 13, 14, 16, 24, 28 and 32px, where 24 and 28 are the phone sizes of the title and stat number). System sans for all UI; monospace (`--mono`) only for masked values and redacted text. Numbers use `font-variant-numeric: tabular-nums`.
| Role | Size / line height | Weight |
| --- | --- | --- |
| Page title (h1) | 28 / 34px (24px on phones) | 700, -0.02em |
| Dashboard hero | 32 / 40px (28 / 34px on phones) | 700, -0.02em |
| Card title (h2) | 16 / 24px | 600 |
| Body | 16 / 24px | 400 |
| Finding label | 16 / 24px | 500 |
| Small | 14 / 20px | 400 or 500 |
| Meta (row details, chart labels, times) | 13 / 20px | 400 |
| Caption and table headers | 12 / 16px, uppercase, +0.04em | 600 |
| Stat number | 32 / 40px | 700 |

## Spacing (8px scale)
4 (half step, inside badges only), 8, 16, 24, 32, 48. Cards have 24px padding (16px on phones), and grids have 16px gaps (24px between page sections).

## Components
- **Brand mark:** a cobalt (`--accent`, #2F5BFF) rounded square with a white shield-and-check, as in the site header. The extension popup, intervention dialog, flagged-activity dashboard and toolbar icons use that same mark.
- **Card (the only container):** white, 1px `--border`, 12px radius, shadow `0 1px 2px rgba(22, 21, 15, 0.05)`. Header: card title on the left, an optional small action or caption on the right.
- **Badge (the only tag):** 999px radius, 12px/600 text, 2px 8px padding, tint background and coloured text, icon first. Used for severity, outcome and policy action. Small radii (code, inputs) use `--radius-sm`.
- **Buttons:** primary (cobalt fill), secondary (white with `--border-strong`) and quiet (text only). One primary per screen. 40px tall (44px on phones). Destructive buttons are secondary until armed.
- **Extension intervention:** one primary action, **Remove and send**, replaces flagged values in the composer with placeholders such as `[REDACTED CARD]` and then sends. **Go back** dismisses the dialog and does not send. **Send anyway** is the danger action and needs a second click on a block (and is confirm-twice whenever it appears).
- **Switch:** the breach check is a checkbox styled as a switch (still `type="checkbox"`, with a real label), 44px touch target.
- **Disclosure:** long explanations live in `<details>` ("How this works"), not on screen.
- **Charts:** hand-written inline SVG or CSS only. One series per colour, labelled axes, no legends that need decoding.

## Layout
- Top bar: brand on the left and three tabs on the right — Dashboard, Try it, Setup — with Dashboard first. On phones the three tabs sit in a single row, so every tab is visible without scrolling, and the bar is not sticky.
- Home: the app always opens on the Dashboard. Older hashes still work: `#firewall` and `#assessment` open Try it, `#policies`, `#extension` and `#install` open Setup, and `#activity` or `#audit` open the Dashboard with the audit log expanded. Redirects from unknown or old hashes use `history.replaceState` so Back is not trapped.
- Try it: the paste-a-prompt inspector (Firewall) and the Northstar assessment live on one tab. Two cards, Prompt (input) and Result, sit side by side from 960px (same height) and stack below that. On phones the prompt box is shorter so Inspect is on the first screen, and after Inspect the page scrolls to the result. The result has one verdict banner and then one row per finding. The breach result sits inside the password's row, not in a separate box. Inspect is the primary action; "Run the Northstar demo" is a secondary button that reveals the existing assessment flow inline.
- Dashboard: a large hero sentence (32px, 28px on phones) at the top. When the Chrome extension is connected it reads "Working. N risky prompts stopped today" (or "this week" when nothing was stopped today), counting website blocks plus the extension's uncapped today/week stop counts; when nothing has been stopped it reads "Working. Nothing risky yet today". If an older extension omitted today's stop count, the hero is just "Working." When the extension is not connected, the hero is "Install the extension to start protecting your AI chats", the lede is "It watches ChatGPT, Claude and Gemini and stops secrets before they're sent. Nothing leaves your browser.", a primary "Get the extension" button goes to Setup, and three numbered install steps follow (download, extract, Load unpacked on the folder with manifest.json). A small cobalt "Connected" badge sits next to the hero when the extension has answered. Under the hero, a small "All time" eyebrow and one row of three small stats — Flagged, Blocked, Sent anyway — including extension counts (the hero's "today" / "this week" is a different period). The gap from the lede to the stat row is 24px. There is no Inspections card and no Password alerts card; if any inspection found a password in known breaches, a single red status line says so. The main body is "Recent catches": up to 8 rows, each with the label in bold on the left, "Royce Myers · ChatGPT · 2:14 PM" muted underneath (the name from Setup, or "You" if it is empty; a clock time, not a relative phrase), and an outcome pill on the right — Stopped (red-tint), Removed (cobalt-tint, used instead of "redacted"), Sent anyway (amber-tint). Rows do not wrap messily on a 375px screen. "See all" expands the full audit log inline (filters, export and clear) and shows the name the same way. When the extension is not connected and there is nothing to show, the zero stat cards and the empty Recent catches card are hidden. When it is connected but empty, the three stats stay at 0 and a muted line replaces the empty card: "Try it: paste a fake key into ChatGPT, it'll show up here."
- Audit log: a table on wide screens, opened from "See all" on the Dashboard (it is no longer a tab). Empty cells show "—" (no severity, breach check off). Below 720px each event becomes a stacked card (outcome and time on top, event below, then severity and breach check), so nothing scrolls sideways.
- Setup: a "Your name" field at the top (max 60 characters, trimmed, saved in this browser as `aif.userName`, never sent anywhere, rendered with textContent only), then install steps and the download button, then policy controls, under one Setup heading. Reset everything does not clear the name.

## State styling
- **Empty:** the Firewall result still uses an icon, a one-line heading and one sentence. The Dashboard has no large empty card. If the extension is not connected, the empty state is the install hero, the “It watches…” lede, a primary “Get the extension” button and three short install steps (stats and Recent catches stay hidden while they are empty). If it is connected, the hero is “Working. Nothing risky yet today”, stats may read 0 in `--text-2`, and a muted one-line hint replaces the empty Recent catches card.
- **Invalid input:** red text under the field with a red field border. Never a pop-up.
- **In use:** a verdict banner (tint background, icon and word, written for an owner: "Your policy blocks passwords and keys."), then finding rows with a severity badge, a plain label ("Password in the message"), the data class and the masked value. Password values are masked down to their last two characters ("••••••••x9"), with no keyword or punctuation.
- **One red signal per problem:** the banner says what happened; each row's severity badge carries the colour; the breach line is one sentence in that row. The summary under the findings is one muted line.
- **Breach check:** one sentence inside the password's finding row: "Checking known breaches…" (spinner, removed when reduced motion is on), "◆ Found in known breaches · seen N times. Change this password everywhere it is used." (the row becomes Critical), "✓ Not found in known breaches" (ok), or "▲ Breach check unavailable" (high). Glyphs sit in a fixed-width span so rows line up. A one-line muted summary under the findings ("Breach check done. Your password stayed on this device.") is the screen-reader status. Plain words on screen; SHA-1 and the 5-character prefix are explained only in "How this works" and the README.
- **Destructive action armed:** the button turns red and reads "Click again to confirm" for 4 seconds.
- **Edited after inspecting:** the result returns to its empty state with a sentence asking for a new inspection, and Send is hidden.
- **Blocked:** no Send button at all; the verdict banner says it was blocked.
- **After reset:** identical to the empty state.

## Motion
150–200ms colour and opacity changes only. `prefers-reduced-motion` turns them off.

## Accessibility
Real labels for every control, `role="alert"` on errors, `aria-live` on the result, the breach summary in its own `role="status"` region (`#breach-status`), a visible 2px cobalt focus ring, a skip-to-tool link, `aria-current` on the open tab, `aria-pressed` on policy buttons, and charts with a text alternative (`role="img"` plus `aria-label`). Meaning never relies on colour alone. Text keeps at least 4.5:1 contrast.

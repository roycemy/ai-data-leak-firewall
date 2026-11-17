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
System sans for all UI; monospace (`--mono`) only for masked values and redacted text. Numbers use `font-variant-numeric: tabular-nums`.
| Role | Size / line height | Weight |
| --- | --- | --- |
| Page title (h1) | 28 / 34px (24px on phones) | 700, -0.02em |
| Card title (h2) | 16 / 24px | 600 |
| Body | 16 / 24px | 400 |
| Small | 14 / 20px | 400 or 500 |
| Caption and table headers | 12 / 16px, uppercase, +0.04em | 600 |
| Stat number | 32 / 40px | 700 |

## Spacing (8px scale)
4 (half step, inside badges only), 8, 16, 24, 32, 48. Cards have 24px padding (16px on phones), and grids have 16px gaps (24px between page sections).

## Components
- **Card (the only container):** white, 1px `--border`, 12px radius, shadow `0 1px 2px rgba(22, 21, 15, 0.05)`. Header: card title on the left, an optional small action or caption on the right.
- **Badge (the only tag):** 999px radius, 12px/600 text, 2px 8px padding, tint background and coloured text, icon first. Used for severity, outcome, policy action and "Found in breaches".
- **Buttons:** primary (cobalt fill), secondary (white with `--border-strong`) and quiet (text only). One primary per screen. 40px tall (44px on phones). Destructive buttons are secondary until armed.
- **Switch:** the breach check is a checkbox styled as a switch (still `type="checkbox"`, with a real label), 44px touch target.
- **Disclosure:** long explanations live in `<details>` ("How this works"), not on screen.
- **Charts:** hand-written inline SVG or CSS only. One series per colour, labelled axes, no legends that need decoding.

## Layout
- Top bar: brand on the left and tabs on the right. On phones the tabs sit in one row that scrolls sideways, and the bar is not sticky.
- Firewall: two cards, Prompt (input) and Result, side by side from 960px and stacked below that. The result has one verdict banner and then one row per finding. The breach result sits inside the password's row, not in a separate box.
- Dashboard: 4 stat cards (2 × 2 on phones), then a trend card (full width), then Data types and Severity & outcomes side by side, then Recent activity and Policies in effect. A line under the title says the data comes from this browser only.
- Audit log: a table on wide screens. Below 720px each event becomes a stacked card (outcome and time on top, event below, then severity and breach check), so nothing scrolls sideways.

## State styling
- **Empty:** an icon, a one-line heading, one sentence and one button that leads to the next step. Stat cards show 0 in `--text-2`.
- **Invalid input:** red text under the field with a red field border. Never a pop-up.
- **In use:** a verdict banner (tint background, icon and word), then finding rows with a severity badge, the label, the data class and the masked value.
- **Breach check:** a line inside the password's finding row: "Checking known breaches…" (spinner, removed when reduced motion is on), "Found in breaches · seen N times" (critical badge, and the row becomes Critical), "Not found in known breaches" (ok), or "Breach check unavailable" (high colour with ▲). A one-line summary under the findings says what was sent ("Sent: a 5-character hash prefix only.") and is the screen-reader status. "Nothing to check" appears only in that summary line.
- **Destructive action armed:** the button turns red and reads "Click again to confirm" for 4 seconds.
- **Edited after inspecting:** the result returns to its empty state with a sentence asking for a new inspection, and Send is hidden.
- **After reset:** identical to the empty state.

## Motion
150–200ms colour and opacity changes only. `prefers-reduced-motion` turns them off.

## Accessibility
Real labels for every control, `role="alert"` on errors, `aria-live` on the result, the breach summary in its own `role="status"` region (`#breach-status`), a visible 2px cobalt focus ring, a skip-to-tool link, `aria-current` on the open tab, `aria-pressed` on policy buttons, and charts with a text alternative (`role="img"` plus `aria-label`). Meaning never relies on colour alone. Text keeps at least 4.5:1 contrast.

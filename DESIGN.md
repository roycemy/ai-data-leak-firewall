# Design direction

## Feel
A calm security console: dark, precise, a little technical. Colour carries meaning, so it is used sparingly.

## Colour (tokens in `styles.css` `:root`)
| Token | Value | Meaning |
| --- | --- | --- |
| `--bg` / `--panel` / `--line` | #070b14 / #0c1220 / #1b2740 | page, cards, borders |
| `--text` / `--muted` | #e6edf7 / #8a97ac | body, secondary |
| `--teal` | #2de2c5 | brand, primary action, clear/safe |
| `--amber` | #ffb020 | warn |
| `--violet` | #7c5cff | redact |
| `--red` | #ff4d5e | block, errors, destructive |

## Type
System sans for UI, monospace (`--mono`) for masked values, redacted text and timestamps.

## Layout
One column of content under a top bar. The console is two panels (input, result) that stack below 900px. Stats go 4 → 2 columns on narrow screens.

## State styling
- **Empty:** muted centred sentence that says what to do next.
- **Invalid input:** red-tinted box under the field plus a red field border; short plain sentence, never a pop-up.
- **In use:** verdict banner in the colour of the action; findings rows with a severity tag.
- **Destructive action armed:** button turns red and its label changes to "Click again to confirm" for 4 seconds.
- **After reset:** identical to the empty state.
- **Edited after inspecting:** the result panel shows the muted empty-state sentence asking for a new inspection, and the Send button is disabled (dimmed) and reads "Inspect first to send".

## Accessibility
Real `label` for the prompt box (visually hidden), `role="alert"` on errors, `aria-live` on the result, visible focus (a 2px teal ring on every control, kept inside segmented buttons), a skip-to-tool link, `aria-current` on the open tab, `aria-pressed` on policy buttons, `prefers-reduced-motion` turns off the pulse, fade-in and transitions, text never relies on colour alone (verdicts carry words and icons).

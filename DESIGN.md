# Design direction

## Feel
A calm, simple tool: warm white, black text and one cobalt accent. Plenty of space, fine borders, no glow or neon. Colour carries meaning, so it is used sparingly. (The first version was a dark teal console. This is a deliberate restyle of the same layout and behaviour, made after the first submission.)

## Colour (tokens in `styles.css` `:root`)
| Token | Value | Meaning |
| --- | --- | --- |
| `--bg` / `--panel` / `--panel-2` / `--line` | #FAF8F4 / #FFFFFF / #F3F0EA / #E3DED4 | page, cards, quiet fills, borders |
| `--text` / `--muted` | #111111 / #5E5A52 | body, secondary |
| `--cobalt` / `--cobalt-dark` | #2F5BFF / #2347D6 | brand, primary button, focus ring, links, redact |
| `--green` | #1E6B3A | clear / allowed |
| `--amber` | #7A4F00 on #FFF3D6 | warn |
| `--red` | #A3231B on #FDECEA | block, errors, destructive |

Cobalt is the brand and the primary action. It never means "safe": verdicts use words and icons plus the muted green, amber and red.

## Type
System sans for UI, monospace (`--mono`) for masked values, redacted text and timestamps. Body 16px, headings tight (-0.02em).

## Layout
One column of content under a top bar. The console is two panels (input, result) that stack below 900px. Stats go 4 → 2 columns on narrow screens. Unchanged from the first version.

## State styling
- **Empty:** muted centred sentence that says what to do next.
- **Invalid input:** red-tinted box under the field plus a red field border; short plain sentence, never a pop-up.
- **In use:** verdict banner in the colour of the action; findings rows with a severity tag.
- **Destructive action armed:** button turns red and its label changes to "Click again to confirm" for 4 seconds.
- **After reset:** identical to the empty state.
- **Edited after inspecting:** the result panel shows the muted empty-state sentence asking for a new inspection, and the Send button is disabled (dimmed) and reads "Inspect first to send".

## Motion
200ms fades and colour changes only. `prefers-reduced-motion` turns all of it off.

## Accessibility
Real `label` for the prompt box (visually hidden), `role="alert"` on errors, `aria-live` on the result, visible focus (a 2px cobalt ring on every control, kept inside segmented buttons), a skip-to-tool link, `aria-current` on the open tab, `aria-pressed` on policy buttons, text never relies on colour alone (verdicts carry words and icons). Text and background pairs keep at least 4.5:1 contrast.

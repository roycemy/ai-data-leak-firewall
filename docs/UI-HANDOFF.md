# Dato site — UI handoff for Opus

**What this is:** a local-only, premium-but-super-simple marketing/install site plus polished extension surfaces (popup, in-chat intervention, settings). One calm product story — not a security control room.

**What this is not:** protection, detection, storage, interception, or permissions. Opening these files does not scan prompts or stop sends.

**Location:** `/workspace/dato-site/` only. Do **not** integrate from `/workspace/dato-quiet-precision` (dashboard direction — rejected) or edit the product repo / `dato-inspect` for this work.

**Constraints honored:** no push, no deploy, no paid services, no engine changes. Product repo untouched.

**Inspection method:** extension **v1.0.2** source (`popup.html` / `popup.js` / `content.js` / `content.css`). Not a live Chrome session on ChatGPT unless you load unpacked separately.

---

## Design direction

Warm white (`#FAF8F4`), near-black type (`#111`), one restrained cobalt accent (`#2F5BFF`) for brand, focus, and primary CTAs only. Cobalt is **not** proof that protection is active.

Premium = restraint: excellent type, generous space, fine borders, subtle 200–250ms motion with `prefers-reduced-motion`. No metric grids, sidebars, decorative charts, neon, shields-as-status, or jargon walls.

**Logo:** geometric **D** monogram with pause bars inside the bowl (“pauses risky sends”). Files: `logo.svg` (full), `logo-mark.svg` (24–32px), `logo-ink.svg` (dark variant). Not a stock shield/padlock.

---

## Files

| File | Role |
|------|------|
| `index.html` | Full one-page site + interactive “See it” stage |
| `tokens.css` | Design tokens |
| `styles.css` | Site + extension surface styles |
| `app.js` | Fixtures, popup/intervene/settings renderers, tabs |
| `logo.svg` / `logo-mark.svg` / `logo-ink.svg` | Brand marks |
| `HANDOFF.md` | This document |
| `renders/*.png` | Review screenshots |

### Routes / query

| URL | Surface |
|-----|---------|
| `/` (default) | Full marketing site; hero shows Active popup + Warn intervention |
| `#see` | Interactive previews |
| `?view=popup-active` / `unsupported` / `error` / `warn` / `redact` / `block` / `settings` | Jump See-it stage |
| `?view=…&solo=1&render=1` | Clean solo surface for screenshots |

---

## Component map (styling-only)

### Site (new / Pages)

Replace the current GitHub Pages executive dashboard as the **primary** customer landing with this calm install story. Keep any advanced/demo tools secondary and labeled. Do not present website sample activity as live extension events (today’s site dashboard is not connected to extension events).

### Popup → `extension/popup.html` + CSS (+ light copy in `popup.js`)

| Prototype | Engine today | Notes |
|-----------|--------------|-------|
| Mark + “dato” + subtitle + power chip | Mark + “AI data-leak firewall” + always ON | Restyle to logo-mark; power chip On/Off/Error when engine supports |
| Status card text + icon | Hostname-only “Protecting…” | **Never** show Protected/Active from URL alone |
| Attention line | — | Keep short |
| Policies under `<details>` | Full list always visible | Progressive disclosure |
| Six policy selects | Same keys + allow/warn/redact/block | Restyle only; keep storage wiring |
| Privacy footer | Footer + managed-team link | Keep local-scan; demote team dashboard |

### Intervention → `content.js` `show()` + `content.css`

Preserve **exact** v1.0.2 actions:

| Action | Title | Buttons |
|--------|-------|---------|
| `warn` | Confidential data detected | Go back · **Send anyway** |
| `block` | Blocked by policy | Go back · **Send anyway** (2nd click confirms) |
| `redact` | Redaction required | Go back · **Redact & send** |

Do not add/remove bypasses via design. Mask findings. Add explicit **“Not sent yet”** prep line while redact dialog is open. Restyle sentinel colors only.

### Settings

Same six keys: `secrets`, `pii`, `financial`, `source`, `contract`, `sensitive`.  
Defaults: secrets=`block`; others=`warn`.

### Install CTA

- No fabricated Chrome Web Store URL
- Primary CTA disabled / “coming soon” until listing verified
- Load unpacked = secondary testing path only

---

## Status honesty (needs engine)

| Label | Meaning | Engine today | Needs engine? |
|-------|---------|--------------|---------------|
| **Active** | Adapter hooked; inspecting | Hostname match only | **Yes** — real hook/health |
| **Unsupported** | Not a supported host | Partial | Copy/visual OK |
| **Off** | Not inspecting | No Off switch | **Yes** if product wants Off |
| **Error** | Inspection failed | No distinct UI | **Yes** |

Every status uses **text + icon**, not color alone.

---

## Tokens (integrate as CSS variables)

See `tokens.css`. Key: `--bg #FAF8F4`, `--ink #111111`, `--cobalt #2F5BFF`, `--popup-w 360px`, `--motion 200ms`.

---

## Flagged: needs engine (do not fake)

1. Active vs URL-match-only  
2. Off switch + Error reporting  
3. Real adapter health on ChatGPT/Claude/Gemini  
4. Chrome Web Store listing URL (when verified)  
5. Any claim that a redaction was already sent (must stay “not sent yet” until send completes)

---

## Success check

An owner understands Dato in seconds; a flagged prompt has one obvious next step; the installation page previews the **same** popup and intervention people will use — impressive by removing complexity, not adding features.

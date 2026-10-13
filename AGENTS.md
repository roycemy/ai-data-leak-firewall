# Agent rules

- Plain HTML, CSS and JavaScript only. No React, Tailwind, other frameworks or libraries, and nothing loaded from a CDN.
- No server and no outside API. No `fetch`, no network calls. Everything runs in the browser.
- Data lives in JavaScript state, saved to `localStorage`. Do not add a database, `.csv` or separate `.json` data file.
- No `alert()`, `confirm()` or `prompt()`. Show feedback in the page.
- Read `PROPOSAL.md`, `PRD.md` and `DESIGN.md` before changing behaviour or styles. Styles use the tokens in `DESIGN.md`.
- Every state in `PRD.md` (empty, invalid, in use, after reset) must keep working.
- Semantic HTML; must work at phone width.
- One piece at a time. Keep functions small; name what state they read and change.
- Commit in small steps with clear messages. Do not commit secrets, even synthetic ones that look real, outside `assessment.js`.

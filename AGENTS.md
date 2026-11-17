# Agent rules

- Plain HTML, CSS and JavaScript only. No React, Tailwind, other frameworks or libraries, and nothing loaded from a CDN.
- No server. Everything runs in the browser.
- One outside API is allowed, and only this call: the Have I Been Pwned Pwned Passwords range endpoint, `GET https://api.pwnedpasswords.com/range/<first 5 hex characters of the SHA-1 hash>`. It needs no key. It runs only when the user ticks the breach-check box, and only for detected passwords. Never send the password or its full hash. No other `fetch` or network call.
- Every `fetch` sits inside `try/catch` and checks `response.ok` (a 404 or 503 does not throw). If the call fails, the normal local scan must still work.
- No API keys anywhere in the repo.
- Data lives in JavaScript state, saved to `localStorage`. Save counts only: never a password, a hash or a prompt. Do not add a database, `.csv` or separate `.json` data file.
- No `alert()`, `confirm()` or `prompt()`. Show feedback in the page.
- Read `PROPOSAL.md`, `PRD.md` and `DESIGN.md` before changing behaviour or styles. Styles use the tokens in `DESIGN.md`.
- Every state in `PRD.md` (empty, loading, error, invalid, in use, after reset) must keep working.
- Semantic HTML; must work at phone width.
- One piece at a time. Keep functions small; name what state they read and change.
- Commit in small steps with clear messages. Do not commit secrets, even synthetic ones that look real, outside `assessment.js`.

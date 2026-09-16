# ChildTaskTracker

A playful chore and rewards tracker for kids ages 6–16 and their parents. This repo holds the product design work and a working front-end demo of the MVP.

## Live app

`index.html`, `styles.css`, `app.js`, `ai.js` at the repo root are a **fully client-side** demo — no backend, no build step. All data lives in your browser's `localStorage`.

**Run it locally:**
```bash
git clone https://github.com/adamhelwa/ChildTaskTracker.git
cd ChildTaskTracker
python3 -m http.server 8000
# open http://localhost:8000
```
Or just double-click `index.html` to open it directly in a browser.

**Deploy it:** enable GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main` → `/ (root)`) and it will be served at `https://adamhelwa.github.io/ChildTaskTracker/`.

### How it works

- **Profile picker** — choose a child (Emma, 8, or Jayden, 14, seeded as demo data) or "Parent" to enter parent mode.
- **Child view** — Tasks (tap to mark done), Rewards (redeem with points), Progress (streak, points, weekly recap).
- **Parent view** — switch between Parent A / Parent B (simulates two guardians sharing one device), validate pending tasks and reward requests, manage children/tasks/rewards, and view AI-assisted insights.
- **Demo clock** — open Settings (⚙️) → "Advance to next day" to fast-forward the simulated calendar and see 24-hour auto-approval and multi-day streaks play out without waiting in real time.

### Optional: OpenAI features

Reward recommendations, weekly KPI summaries, and starter-task suggestions can call the OpenAI API directly from your browser if you add your own key in Settings (⚙️). The key is stored only in your browser's `localStorage` and is never committed to this repo. Without a key, every AI feature falls back to built-in rule-based logic, so the app is fully functional either way.

## Repo contents

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js`, `ai.js` | The MVP front-end demo (Option B: Warm & Playful) |
| `ChildTaskTracker_PRD.pdf` | Product requirements document |
| `ChildTaskTracker_Roadmap.pdf` / `.html` | Phased product roadmap |
| `ARCHITECTURE.html` | System architecture &amp; data-flow diagrams, with tradeoffs and risk management |
| `landing-concepts/` | Three landing page design explorations (Calm, Playful, Animated) |

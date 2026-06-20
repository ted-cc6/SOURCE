# Cost of Doing Nothing — Dashboard (React + Vite)

A React frontend for the FastAPI OUD cost-simulation API (`main.py` /
`cost_engine.py`). Renders the baseline projection, lets you model
population-level interventions, and surfaces the two LLM-backed
narrative endpoints.

## What's wired up

| UI section | Backend endpoint |
|---|---|
| Hero running total + sparkline | `GET /baseline` on load |
| "Model an intervention" sliders | `POST /simulate` (`population_scalers`, `n_simulations`, `random_seed`) |
| Trajectory chart w/ domain tabs | `result.cumulative.{total,healthcare,justice,economic,child_welfare}` |
| Domain ledger + equity breakdown | `result.summary.domain_shares_pct`, `result.equity_distribution` |
| Executive summary | `POST /generate_summary` |
| Human-cost case study | `POST /generate_persona` |

Per-metric cost overrides (`mean_cost` / `std_dev` / `distribution_type` —
see `SimulationRequest.overrides` in `main.py`) aren't exposed in the UI
yet. `src/api/client.js#postSimulate` already accepts an `overrides` key
if you want to add controls for it.

## Setup

```bash
# 1. Start the FastAPI backend (from the main.py project root)
python main.py
# → serving on http://localhost:8000

# 2. In this directory, install and run the frontend
npm install
npm run dev
# → opens on http://localhost:5173
```

If your backend runs somewhere other than `localhost:8000`, copy
`.env.example` to `.env` and set `VITE_API_BASE_URL` accordingly.

The backend already sets `allow_origins=["*"]` in its CORS middleware, so
no proxy config is needed in `vite.config.js` — the browser talks to the
API directly.

### The two AI endpoints need LM Studio running

`/generate_summary` and `/generate_persona` proxy to a local LM Studio
server at `http://127.0.0.1:1234`. If it's not running, those two cards
will show the backend's own error message (it returns a clear `503` with
instructions). Everything else in the dashboard works without it.

## Project structure

```
src/
  api/client.js          fetch wrappers for all four endpoints
  hooks/useCountUp.js     animated count-up for the hero number
  components/
    Hero.jsx              running total + trajectory sparkline
    ScenarioPanel.jsx      population-scaler sliders, run controls
    CostChart.jsx          main chart, p025–p975 band + domain tabs
    DomainLedger.jsx       median cost share per domain
    EquityBreakdown.jsx    income / race-ethnicity overlay
    NarrativePanel.jsx     executive summary + persona generator
  utils/format.js         currency / date formatting helpers
```

## Notes on the design

Dark "ledger" hero with a monospace running total, paper-toned panels
below for controls and breakdowns. Color tokens and type choices live at
the top of `src/index.css` if you want to retheme.

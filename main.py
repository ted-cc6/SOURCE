"""
main.py — FastAPI layer for the "Cost of Doing Nothing" OUD Simulator

Wraps the Step 3 CostProjectionEngine and exposes three endpoints:

    GET  /health     → liveness probe
    GET  /baseline   → cached default projection (N=1 000, seed=42)
    POST /simulate   → custom Monte Carlo run with optional overrides

Run locally:
    python main.py
    # or
    uvicorn main:app --reload --port 8000
"""

import os
import sys
from contextlib import asynccontextmanager
from typing import Any, Optional

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

# Ensure the project root is on sys.path so cost_engine imports cleanly
# regardless of where uvicorn is launched from.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from cost_engine import CostProjectionEngine

# ──────────────────────────────────────────────────────────────────────
# Configuration constants
# ──────────────────────────────────────────────────────────────────────

DATA_DIR            = os.path.join(_HERE, "synthetic_data")
DEFAULT_SIMULATIONS = 1_000
MAX_SIMULATIONS     = 10_000   # cap to protect the server under load
BASELINE_SEED       = 42       # reproducible baseline used for caching
LM_STUDIO_URL       = "http://127.0.0.1:1234/v1/chat/completions"

# Synthetic demographic burden splits — applied post-simulation to produce
# equity_distribution in every API response.  Percentages are derived from:
#   Income: SAMHSA NSDUH 2022 (OUD prevalence by household income quintile)
#   Race:   CDC WONDER overdose mortality + BJS drug-offense arrest data
SYNTHETIC_DEMOGRAPHICS: dict[str, dict[str, float]] = {
    "income_bracket": {
        "below_30k":   0.45,   # lowest quintile bears ~45% of total burden
        "30k_to_75k":  0.35,
        "above_75k":   0.20,
    },
    "race_ethnicity": {
        "white_non_hispanic":    0.52,   # historically highest raw OUD count
        "black_non_hispanic":    0.18,   # fastest-rising overdose rate (fentanyl era)
        "hispanic":              0.18,
        "american_indian_ak":    0.05,   # disproportionate per-capita burden
        "asian_pacific":         0.03,
        "other_multiracial":     0.04,
    },
}


# ──────────────────────────────────────────────────────────────────────
# Application lifespan — runs once at startup / shutdown
# ──────────────────────────────────────────────────────────────────────

# Both the engine and the baseline result are module-level so the
# endpoint functions can reference them without re-instantiation on
# every request.
_engine:         Optional[CostProjectionEngine] = None
_baseline_cache: Optional[dict]                 = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup:
      1. Instantiate CostProjectionEngine (loads + caches JSON and CSV).
      2. Pre-compute the baseline projection so the first /baseline
         response is already warm.
    Shutdown:
      Nothing to release — all state is in-process.
    """
    global _engine, _baseline_cache

    print("[startup] Initialising CostProjectionEngine …")
    _engine = CostProjectionEngine(DATA_DIR)

    print(f"[startup] Pre-computing baseline (N={DEFAULT_SIMULATIONS}, seed={BASELINE_SEED}) …")
    _baseline_cache = _engine.run_simulation(
        n_simulations=DEFAULT_SIMULATIONS,
        random_seed=BASELINE_SEED,
    )
    rt = _baseline_cache["metadata"]["runtime_s"]
    print(f"[startup] Baseline ready in {rt:.3f}s — server is live.")

    yield   # ← application runs here

    print("[shutdown] Engine released.")


# ──────────────────────────────────────────────────────────────────────
# FastAPI application
# ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Cost of Doing Nothing — OUD Simulator API",
    description=(
        "Monte Carlo cost projections for Opioid Use Disorder, "
        "built on the FDA/SOURCE epidemiological engine.\n\n"
        "All cost figures are cumulative USD from 1999 to 2032, "
        "reported as 2.5 / 50 / 97.5 percentile trajectories."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the frontend dashboard to call the API from any origin
# (safe for local development; tighten allow_origins in production).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────
# Pydantic request / response models
# ──────────────────────────────────────────────────────────────────────

class CostOverride(BaseModel):
    """
    Fine-grained override for a single cost metric's distribution.
    All fields are optional — only supply the parameters you want to change.
    """
    mean_cost:         Optional[float] = Field(
        default=None,
        gt=0,
        description="New mean unit cost in USD.",
        examples=[5000.0],
    )
    std_dev:           Optional[float] = Field(
        default=None,
        gt=0,
        description="New standard deviation in USD.",
        examples=[1500.0],
    )
    distribution_type: Optional[str]  = Field(
        default=None,
        description='Distribution shape: "normal" or "log-normal".',
        examples=["log-normal"],
    )

    @field_validator("distribution_type")
    @classmethod
    def _validate_dist(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("normal", "log-normal"):
            raise ValueError('distribution_type must be "normal" or "log-normal"')
        return v


class SimulationRequest(BaseModel):
    """
    Request body for POST /simulate.

    Overrides schema
    ----------------
    Supply a nested dictionary to hot-swap unit costs before sampling:

        {
          "<domain>": {
            "<metric>": {
              "mean_cost": <float>,     # optional
              "std_dev":   <float>,     # optional
              "distribution_type": ...  # optional
            }
          }
        }

    Valid domain keys:
        healthcare | justice | economic | child_welfare

    Valid metric keys per domain:
        healthcare   → er_visit_overdose | inpatient_rehab | outpatient_mat
        justice      → police_arrest | court_processing | incarceration
        economic     → lost_productivity | unemployment_disability
        child_welfare→ foster_care

    Example — raise ER visit mean cost to $5 000 and tighten its spread:
        {
          "healthcare": {
            "er_visit_overdose": { "mean_cost": 5000, "std_dev": 800 }
          }
        }
    """
    n_simulations: int = Field(
        default=DEFAULT_SIMULATIONS,
        ge=1,
        le=MAX_SIMULATIONS,
        description=(
            f"Number of Monte Carlo draws. "
            f"Default: {DEFAULT_SIMULATIONS}. Max: {MAX_SIMULATIONS}."
        ),
        examples=[1000],
    )
    overrides: Optional[dict[str, dict[str, CostOverride]]] = Field(
        default=None,
        description="Nested cost-parameter overrides. See schema description above.",
    )
    population_scalers: Optional[dict[str, float]] = Field(
        default=None,
        description=(
            "Multiply individual population count columns by a float multiplier "
            "before the Monte Carlo run, simulating policy interventions. "
            "Keys must be valid count columns from state_timeseries.csv. "
            "Valid keys: er_visit_overdose_count | inpatient_rehab_count | "
            "outpatient_mat_count | police_arrest_count | incarceration_count | "
            "lost_productivity_count | foster_care_risk_count. "
            "Example — model a 20%% MOUD expansion + 15%% productivity gain: "
            '{"outpatient_mat_count": 1.20, "lost_productivity_count": 0.85}'
        ),
        examples=[{"outpatient_mat_count": 1.20, "lost_productivity_count": 0.85}],
    )
    random_seed: Optional[int] = Field(
        default=None,
        description=(
            "Fix the RNG seed for reproducibility "
            "(useful for A/B comparisons or caching)."
        ),
        examples=[42],
    )

    def to_engine_overrides(self) -> Optional[dict[str, Any]]:
        """
        Convert the validated Pydantic overrides to the plain nested dict
        that CostProjectionEngine.run_simulation() expects.
        Strips None values so the engine falls back to its JSON defaults.
        """
        if self.overrides is None:
            return None

        engine_ovr: dict[str, Any] = {}
        for domain, metrics in self.overrides.items():
            engine_ovr[domain] = {}
            for metric, override_obj in metrics.items():
                patch = override_obj.model_dump(exclude_none=True)
                if patch:                        # only include non-empty patches
                    engine_ovr[domain][metric] = patch

        return engine_ovr if engine_ovr else None


class SummaryRequest(BaseModel):
    """
    Request body for POST /generate_summary.

    Designed to accept the JSON output from POST /simulate directly —
    pipe the simulate response straight into this endpoint without reshaping.
    Only the four fields below are read; all other simulate keys are ignored.

    Quickstart
    ----------
    1. Call POST /simulate and capture the response JSON.
    2. POST that same JSON body to POST /generate_summary.
    3. Receive {"executive_summary": "..."}.
    """
    total_cost_p50: float = Field(
        description="Median cumulative total cost in USD (summary.total_cost_p50).",
    )
    domain_shares_pct: dict[str, float] = Field(
        description="Per-domain share of median total cost (summary.domain_shares_pct).",
    )
    equity_distribution: dict[str, dict[str, float]] = Field(
        description="Demographic cost breakdown injected by /simulate (equity_distribution).",
    )
    population_scalers_applied: dict[str, float] = Field(
        default_factory=dict,
        description=(
            "Population scalers used in this run (metadata.population_scalers_applied). "
            "Empty dict means baseline — no intervention."
        ),
    )


class PersonaRequest(BaseModel):
    """
    Request body for POST /generate_persona.

    The frontend sends the domain and demographic context it wants to
    zoom in on; the endpoint returns a 150-word hypothetical case study.
    """
    domain: str = Field(
        description=(
            "Cost domain to focus the story on. "
            "Examples: 'Child Welfare', 'Justice', 'Economic', 'Healthcare'."
        ),
        examples=["Child Welfare"],
    )
    income_bracket: str = Field(
        description=(
            "Income bracket of the hypothetical individual or family. "
            "Examples: 'Below $30k', '$30k to $75k', 'Above $75k'."
        ),
        examples=["Below $30k"],
    )
    intervention_applied: Optional[str] = Field(
        default=None,
        description=(
            "Policy context active during this simulation run. "
            "Pass None or omit for baseline. "
            "Examples: 'Expanded MAT Access', 'Increased Naloxone Distribution'."
        ),
        examples=["Expanded MAT Access"],
    )


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

def _require_engine() -> CostProjectionEngine:
    """Raise 503 if the engine isn't ready (shouldn't happen post-startup)."""
    if _engine is None:
        raise HTTPException(
            status_code=503,
            detail="Simulation engine is not initialised. Retry in a moment.",
        )
    return _engine


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    tags=["System"],
    summary="Liveness probe",
    response_description="Engine status.",
)
async def health():
    """
    Returns HTTP 200 with engine status.
    Use this endpoint from load-balancers or the frontend to confirm
    the API is ready before sending simulation requests.
    """
    return {
        "status":        "ok",
        "engine_loaded": _engine is not None,
        "data_dir":      DATA_DIR,
    }


@app.get(
    "/baseline",
    tags=["Simulation"],
    summary="Cached baseline projection",
    response_description=(
        "Pre-computed projection with default parameters "
        f"(N={DEFAULT_SIMULATIONS}, seed={BASELINE_SEED})."
    ),
)
async def get_baseline():
    """
    Returns the **cached** baseline projection that was computed at
    server startup.

    This endpoint is intentionally cheap — the heavy computation already
    happened. Use it for the initial dashboard render, then call
    **POST /simulate** for scenario analysis with custom overrides.

    The response shape is identical to POST /simulate.
    """
    _require_engine()
    return JSONResponse(content=_baseline_cache)


@app.post(
    "/simulate",
    tags=["Simulation"],
    summary="Run a custom Monte Carlo simulation",
    response_description="Full cost-projection result with 95% confidence intervals.",
)
def simulate(request: SimulationRequest):
    """
    Runs a fresh Monte Carlo simulation with the supplied parameters.

    **Overrides** let you hot-swap any unit-cost distribution before
    sampling — this is how the frontend supports "what-if" scenario
    analysis (e.g., "what if naloxone distribution halves ER visit
    costs?") without restarting the server.

    The response contains:
    - `metadata`   — run configuration and timing
    - `months`     — ISO-format monthly time index (1999-01 → 2032-01)
    - `cumulative` — total and per-domain cumulative cost trajectories
                     (p025 / p50 / p975 percentile bands)
    - `summary`    — scalar headline figures and domain share percentages

    **Note:** `n_simulations=1000` typically returns in < 100 ms.
    `n_simulations=10000` stays under 600 ms.
    """
    engine = _require_engine()

    try:
        result = engine.run_simulation(
            n_simulations=request.n_simulations,
            overrides=request.to_engine_overrides(),
            population_scalers=request.population_scalers,
            random_seed=request.random_seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Simulation failed: {exc}",
        )

    # Inject equity distribution — multiply median total cost by each demographic
    # share so Phase 2 AI summaries can comment on disproportionate burden.
    total_p50 = result["summary"]["total_cost_p50"]
    result["equity_distribution"] = {
        category: {
            group: round(total_p50 * share, 0)
            for group, share in splits.items()
        }
        for category, splits in SYNTHETIC_DEMOGRAPHICS.items()
    }

    return JSONResponse(content=result)


@app.post(
    "/generate_summary",
    tags=["AI"],
    summary="Generate an AI executive summary from simulation results",
    response_description='{"executive_summary": "<3-sentence natural language summary>"}',
)
async def generate_summary(request: SummaryRequest):
    """
    Sends simulation metrics to the local **LM Studio** server
    (`http://127.0.0.1:1234`) and returns a 3-sentence executive summary
    suitable for a county health director.

    **Prerequisites:** LM Studio must be running with a model loaded and its
    local server enabled (LM Studio → Local Server → Start Server).

    **Typical flow:**
    1. `POST /simulate` → capture full response JSON.
    2. `POST /generate_summary` with that same JSON body.
    3. Display `executive_summary` in the dashboard narrative panel.

    **Error codes:**
    - `503` — LM Studio server not reachable (not running / wrong port).
    - `504` — Model did not respond within 30 seconds.
    - `502` — LM Studio returned an unexpected response shape.
    """
    # ── Build scalar strings for the prompt ────────────────────────────

    def _fmt(v: float) -> str:
        if abs(v) >= 1e12:
            return f"${v / 1e12:.2f} trillion"
        if abs(v) >= 1e9:
            return f"${v / 1e9:.2f} billion"
        return f"${v:,.0f}"

    cost_str = _fmt(request.total_cost_p50)

    top_domain     = max(request.domain_shares_pct, key=request.domain_shares_pct.get)
    top_domain_pct = request.domain_shares_pct[top_domain]
    domain_str     = f"{top_domain.replace('_', ' ').title()} ({top_domain_pct:.1f}% of total)"

    if request.population_scalers_applied:
        policy_str = "; ".join(
            f"{col.replace('_count', '').replace('_', ' ')} scaled to {mult:.2f}×"
            for col, mult in request.population_scalers_applied.items()
        )
    else:
        policy_str = "Baseline — no intervention applied"

    income = request.equity_distribution.get("income_bracket", {})
    if income:
        top_bracket      = max(income, key=income.get)
        bracket_label    = top_bracket.replace("_", " ")
        bracket_str      = f"{bracket_label} households ({_fmt(income[top_bracket])})"
    else:
        bracket_str = "unknown"

    prompt = (
        "You are an expert public health policy analyst. "
        "Review the following simulation data for Opioid Use Disorder costs "
        "over a 33-year horizon (1999–2032). "
        f"Median Total Cost: {cost_str}. "
        f"Highest Cost Domain: {domain_str}. "
        f"Policy Applied: {policy_str}. "
        f"Most Impacted Income Bracket: {bracket_str}. "
        "Write a strict 3-sentence executive summary for a county health director "
        "explaining the financial and social impact of this specific scenario. "
        "Be precise with dollar figures and domain names."
    )

    # ── Call LM Studio (OpenAI-compatible endpoint) ─────────────────────
    payload = {
        "model":       "local-model",   # LM Studio uses whatever is loaded
        "messages":    [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens":  350,
        "stream":      False,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            llm_resp = await client.post(LM_STUDIO_URL, json=payload)
            llm_resp.raise_for_status()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Cannot reach LM Studio at {LM_STUDIO_URL}. "
                "Open LM Studio → Local Server tab → click Start Server."
            ),
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="LM Studio did not respond within 30 s. Try a smaller/faster model.",
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"LM Studio returned HTTP {exc.response.status_code}: "
                f"{exc.response.text[:300]}"
            ),
        )

    try:
        text = llm_resp.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected response shape from LM Studio: {exc}",
        )

    return {"executive_summary": text}


@app.post(
    "/generate_persona",
    tags=["AI"],
    summary="Generate a hypothetical 150-word personal case study",
    response_description='{"persona_narrative": "<150-word human story>"}',
)
async def generate_persona(request: PersonaRequest):
    """
    Sends demographic and domain context to the local **LM Studio** server
    and returns a ~150-word hypothetical case study about an individual or
    family navigating OUD costs in that specific situation.

    **Prerequisites:** LM Studio must be running with a model loaded
    (LM Studio → Local Server → Start Server).

    **Typical flow:**
    1. User selects a domain tile and income bracket in the dashboard.
    2. Frontend POSTs `{"domain": "...", "income_bracket": "...", "intervention_applied": "..."}`.
    3. Display `persona_narrative` in the "Human Cost" panel.

    **Error codes:**
    - `503` — LM Studio server not reachable.
    - `504` — Model did not respond within 30 seconds.
    - `502` — LM Studio returned an unexpected response shape.
    """
    intervention_str = request.intervention_applied or "None"

    prompt = (
        "You are a compassionate public health narrative writer. "
        f"Write a realistic, 150-word hypothetical case study about an individual "
        f"or family in the {request.income_bracket} bracket navigating the "
        f"{request.domain} system due to untreated Opioid Use Disorder. "
        f"Policy context: {intervention_str}. "
        "Focus on the compounding social and financial friction they experience. "
        "Keep the tone grounded, empathetic, and objective. "
        "Do not be overly melodramatic. Do not use bullet points."
    )

    payload = {
        "model":       "local-model",
        "messages":    [{"role": "user", "content": prompt}],
        "temperature": 0.8,
        "max_tokens":  400,
        "stream":      False,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            llm_resp = await client.post(LM_STUDIO_URL, json=payload)
            llm_resp.raise_for_status()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Cannot reach LM Studio at {LM_STUDIO_URL}. "
                "Open LM Studio → Local Server tab → click Start Server."
            ),
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="LM Studio did not respond within 30 s. Try a smaller/faster model.",
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"LM Studio returned HTTP {exc.response.status_code}: "
                f"{exc.response.text[:300]}"
            ),
        )

    try:
        text = llm_resp.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected response shape from LM Studio: {exc}",
        )

    return {"persona_narrative": text}


# ──────────────────────────────────────────────────────────────────────
# Direct execution entry point
# ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,       # set True only during active development
        log_level="info",
    )

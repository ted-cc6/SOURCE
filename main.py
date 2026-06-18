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
            random_seed=request.random_seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Simulation failed: {exc}",
        )

    return JSONResponse(content=result)


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

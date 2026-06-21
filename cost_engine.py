"""
cost_engine.py — Step 3: Vectorised Monte Carlo Cost Engine

Maps the FDA/SOURCE epidemiological population time-series (Step 2)
to cumulative economic cost trajectories with 95% confidence intervals
by sampling from the synthetic cost distributions (Step 1).

Core mathematical strategy
──────────────────────────
All N simulations run as a single matrix operation — no Python-level
simulation loop.

  unit_costs  (N, K)  one unit-cost draw per simulation per cost line
  count_mat   (M, K)  population counts × period-factor per month
  ─────────────────────────────────────────────────────────────────
  monthly     (N, M)  = unit_costs  @  count_mat.T          [matmul]
  cumulative  (N, M)  = cumsum(monthly, axis=1)
  output      (3, M)  = percentile(cumulative, [2.5,50,97.5], axis=0)

For N=1000, M=397, K=9 the entire run completes in < 200 ms.
"""

import os
import json
import time
from typing import Optional

import numpy as np
import pandas as pd


class CostProjectionEngine:
    """
    Vectorised Monte Carlo engine: Step 1 distributions × Step 2 counts.

    Instantiate once; call run_simulation() as many times as needed
    (JSON and CSV are cached after the first call).

    Quick-start
    -----------
    engine = CostProjectionEngine("datasets_cleaned/")

    # Baseline run
    result = engine.run_simulation(n_simulations=1000)

    # Sensitivity run: raise ER visit cost by 56 %
    result = engine.run_simulation(
        overrides={"healthcare": {"er_visit_overdose": {"mean_cost": 5000}}}
    )
    """

    # ------------------------------------------------------------------
    # Cost-line registry
    # ------------------------------------------------------------------
    # Each entry maps one (domain, metric) pair to:
    #   json_file      — Step 1 cost distribution file
    #   json_key       — key inside that file (excludes _metadata)
    #   count_col      — column in state_timeseries.csv
    #   period_factor  — converts the unit cost to per-month scale:
    #                    1.0  → per-event cost  (multiply by event count)
    #                    1/12 → annual per-person → monthly per-person
    #                    0.6  → 60% of arrests proceed to court (BJS 2022)
    # ------------------------------------------------------------------
    _COST_LINES: list[dict] = [
        # ── Healthcare ─────────────────────────────────────────────────
        dict(domain='healthcare',    metric='er_visit_overdose',
             json_file='healthcare_costs.json',
             json_key='er_visit_overdose',
             count_col='er_visit_overdose_count',
             period_factor=1.0),

        dict(domain='healthcare',    metric='inpatient_rehab',
             json_file='healthcare_costs.json',
             json_key='inpatient_rehab_30_days',
             count_col='inpatient_rehab_count',
             period_factor=1.0),

        dict(domain='healthcare',    metric='outpatient_mat',
             json_file='healthcare_costs.json',
             json_key='outpatient_medication_annual',
             count_col='outpatient_mat_count',
             period_factor=1 / 12),

        # ── Justice ────────────────────────────────────────────────────
        dict(domain='justice',       metric='police_arrest',
             json_file='justice_costs.json',
             json_key='police_arrest',
             count_col='police_arrest_count',
             period_factor=1.0),

        dict(domain='justice',       metric='court_processing',
             json_file='justice_costs.json',
             json_key='court_processing',
             count_col='police_arrest_count',   # same count, fraction proceeds to court
             period_factor=0.6),

        dict(domain='justice',       metric='incarceration',
             json_file='justice_costs.json',
             json_key='incarceration_annual',
             count_col='incarceration_count',
             period_factor=1 / 12),

        # ── Economic ───────────────────────────────────────────────────
        dict(domain='economic',      metric='lost_productivity',
             json_file='economic_costs.json',
             json_key='lost_productivity_annual',
             count_col='lost_productivity_count',
             period_factor=1 / 12),

        dict(domain='economic',      metric='unemployment_disability',
             json_file='economic_costs.json',
             json_key='unemployment_disability_annual',
             count_col='lost_productivity_count',
             period_factor=1 / 12),

        # ── Child Welfare ──────────────────────────────────────────────
        dict(domain='child_welfare', metric='foster_care',
             json_file='child_welfare_costs.json',
             json_key='foster_care_annual',
             count_col='foster_care_risk_count',
             period_factor=1 / 12),
    ]

    # Flow columns get 3-month centred rolling mean before simulation
    # to smooth the Vensim 1/16-year sub-monthly doubling artifact.
    _FLOW_COLS: frozenset = frozenset({
        'er_visit_overdose_count',
        'inpatient_rehab_count',
        'police_arrest_count',
    })

    _DOMAINS: list[str] = ['healthcare', 'justice', 'economic', 'child_welfare']

    # ------------------------------------------------------------------
    def __init__(self, synthetic_data_dir: str):
        """
        Parameters
        ----------
        synthetic_data_dir : str
            Directory containing the Step 1 JSON cost files and the
            Step 2 state_timeseries.csv output.
        """
        self.data_dir    = synthetic_data_dir.rstrip('/\\')
        self._json_cache: dict[str, dict]      = {}
        self._ts_cache:   Optional[pd.DataFrame] = None

    # ==================================================================
    # Loading helpers (with caching)
    # ==================================================================

    def _load_json(self, filename: str) -> dict:
        if filename not in self._json_cache:
            path = os.path.join(self.data_dir, filename)
            with open(path, 'r', encoding='utf-8') as fh:
                self._json_cache[filename] = json.load(fh)
        return self._json_cache[filename]

    def _load_timeseries(self) -> pd.DataFrame:
        """
        Load state_timeseries.csv and smooth flow columns in-place.
        A 3-month centred rolling mean corrects the sub-monthly step
        doubling without distorting the cumulative total.
        """
        if self._ts_cache is not None:
            return self._ts_cache

        path = os.path.join(self.data_dir, 'state_timeseries.csv')
        df   = pd.read_csv(path, index_col=0, parse_dates=True)
        df.index.name = 'month'

        for col in df.columns:
            if col in self._FLOW_COLS:
                df[col] = df[col].rolling(window=3, center=True, min_periods=1).mean()

        df             = df.clip(lower=0.0)
        self._ts_cache = df
        return df

    def _resolve_params(self, overrides: Optional[dict]) -> list[dict]:
        """
        Build the active cost-param list (one dict per cost line) by
        reading JSON files and overlaying any caller-supplied overrides.

        Override structure:
            {domain_key: {metric_key: {field_key: value, ...}}}
        e.g.
            {"healthcare": {"er_visit_overdose": {"mean_cost": 5000}}}
        """
        resolved: list[dict] = []
        for line in self._COST_LINES:
            raw   = self._load_json(line['json_file'])[line['json_key']]
            entry = {
                **line,
                'mean_cost':         float(raw['mean_cost']),
                'std_dev':           float(raw['std_dev']),
                'distribution_type': raw['distribution_type'],
            }
            # Overlay overrides for this (domain, metric) pair
            patch = (overrides or {}).get(line['domain'], {}).get(line['metric'], {})
            if patch:
                entry.update({k: v for k, v in patch.items()
                               if k in ('mean_cost', 'std_dev', 'distribution_type')})
            resolved.append(entry)
        return resolved

    # ==================================================================
    # Statistical helpers
    # ==================================================================

    @staticmethod
    def _to_lognormal_params(mean: float, std: float) -> tuple[float, float]:
        """
        Convert arithmetic (mean, std) → log-space (μ_ln, σ_ln) such that
        E[X] = mean and Std[X] = std for X ~ LogNormal(μ_ln, σ_ln).

        Formulas:
            σ_ln² = log(1 + (std/mean)²)
            μ_ln  = log(mean) − σ_ln² / 2
        """
        cv2   = (std / mean) ** 2
        s2    = float(np.log1p(cv2))        # log1p: numerically stable for small cv
        mu    = float(np.log(mean) - s2 / 2.0)
        return mu, float(np.sqrt(s2))

    def _sample_unit_costs(
        self,
        params:  list[dict],
        n_sims:  int,
        rng:     np.random.Generator,
    ) -> np.ndarray:
        """
        Draw N unit-cost samples for each of the K cost lines.

        One draw per (simulation, cost_line) — cost uncertainty is
        treated as structural (constant within a simulation run), not
        as random noise that varies month to month.

        Returns: ndarray shape (N, K)
        """
        K       = len(params)
        samples = np.empty((n_sims, K), dtype=np.float64)

        for k, p in enumerate(params):
            mean = p['mean_cost']
            std  = p['std_dev']
            if p['distribution_type'] == 'log-normal':
                mu_ln, sigma_ln  = self._to_lognormal_params(mean, std)
                samples[:, k]    = rng.lognormal(mu_ln, sigma_ln, size=n_sims)
            else:
                # Normal — floor at zero; negative costs are not meaningful
                samples[:, k] = np.maximum(0.0, rng.normal(mean, std, size=n_sims))

        return samples   # (N, K)

    def _build_count_matrix(
        self,
        df:     pd.DataFrame,
        params: list[dict],
    ) -> np.ndarray:
        """
        Build effective-count matrix: population × period_factor.

        Returns: ndarray shape (M, K)
            M = months, K = cost lines.
        """
        M         = len(df)
        K         = len(params)
        count_mat = np.zeros((M, K), dtype=np.float64)

        for k, p in enumerate(params):
            col    = p['count_col']
            factor = float(p['period_factor'])
            if col in df.columns:
                count_mat[:, k] = df[col].to_numpy(dtype=np.float64) * factor

        return count_mat   # (M, K)

    @staticmethod
    def _pct(arr: np.ndarray) -> dict:
        """
        Percentile summary of a (N, M) array across simulations (axis=0).
        Returns JSON-serialisable dict with keys p025, p50, p975.
        """
        lo, mid, hi = np.percentile(arr, [2.5, 50.0, 97.5], axis=0)
        return {
            'p025': lo.round(0).tolist(),
            'p50':  mid.round(0).tolist(),
            'p975': hi.round(0).tolist(),
        }

    # ==================================================================
    # Public API
    # ==================================================================

    def run_simulation(
        self,
        n_simulations:      int                      = 1000,
        overrides:          Optional[dict]           = None,
        population_scalers: Optional[dict[str, float]] = None,
        random_seed:        Optional[int]            = None,
    ) -> dict:
        """
        Run the vectorised Monte Carlo simulation.

        Parameters
        ----------
        n_simulations : int
            Number of Monte Carlo draws (1 000 recommended for web;
            10 000 for offline analysis). Runtime scales linearly.
        overrides : dict, optional
            Hot-swap any cost parameter before sampling — designed for
            the FastAPI layer so the UI can run "what-if" scenarios
            without restarting the engine.

            Schema:
                {
                  "<domain>": {
                    "<metric>": {
                      "mean_cost":         <float>,   # optional
                      "std_dev":           <float>,   # optional
                      "distribution_type": <str>      # optional
                    }
                  }
                }

            Valid domain  keys : healthcare | justice | economic | child_welfare
            Valid metric  keys : see _COST_LINES registry in this file
            Valid field   keys : mean_cost | std_dev | distribution_type

            Example — raise ER visit mean cost to $5 000:
                overrides={"healthcare": {"er_visit_overdose": {"mean_cost": 5000}}}

        random_seed : int, optional
            Fix the RNG seed for reproducible outputs (useful for API
            response caching and unit tests).

        Returns
        -------
        dict  — fully JSON-serialisable, schema:
        {
          "metadata": {
              "n_simulations":     int,
              "n_months":          int,
              "n_cost_lines":      int,
              "time_range":        str,
              "runtime_s":         float,
              "overrides_applied": bool,
              "cost_lines_active": [
                  {"domain":…, "metric":…, "mean_cost":…,
                   "std_dev":…, "distribution_type":…},
                  …
              ]
          },
          "months":    ["YYYY-MM-DD", …],       ← length M

          "cumulative": {                        ← cumulative USD from t₀
              "total":        {"p025":[…], "p50":[…], "p975":[…]},
              "healthcare":   {"p025":[…], "p50":[…], "p975":[…]},
              "justice":      {"p025":[…], "p50":[…], "p975":[…]},
              "economic":     {"p025":[…], "p50":[…], "p975":[…]},
              "child_welfare":{"p025":[…], "p50":[…], "p975":[…]},
          },

          "summary": {                           ← scalar headline figures
              "total_cost_p025":   float,        ← cumulative end-of-horizon
              "total_cost_p50":    float,
              "total_cost_p975":   float,
              "domain_shares_pct": {             ← median share of total
                  "healthcare":   float,
                  "justice":      float,
                  "economic":     float,
                  "child_welfare":float,
              }
          }
        }
        """
        t0  = time.perf_counter()
        rng = np.random.default_rng(random_seed)

        # ── Step A: resolve cost parameters ─────────────────────────────
        params = self._resolve_params(overrides)

        # ── Step B: load population time-series ──────────────────────────
        df     = self._load_timeseries()

        # ── Step B2: apply population scalers (intervention faking) ──────
        # Operate on a copy so the module-level cache is never mutated.
        if population_scalers:
            df = df.copy()
            for col, scaler in population_scalers.items():
                if col in df.columns:
                    df[col] = df[col] * float(scaler)

        M      = len(df)
        months = df.index.strftime('%Y-%m-%d').tolist()

        # ── Step C: draw unit costs  →  shape (N, K) ────────────────────
        unit_costs = self._sample_unit_costs(params, n_simulations, rng)
        N, K       = unit_costs.shape

        # ── Step D: build count matrix  →  shape (M, K) ─────────────────
        count_mat = self._build_count_matrix(df, params)

        # ── Step E: vectorised monthly costs  →  shape (N, M) ───────────
        # monthly[i, m] = Σ_k  unit_cost[i, k] × count[m, k]
        # Implemented as:  (N,K) @ (K,M)  — single BLAS matmul, no loops
        monthly_total: np.ndarray = unit_costs @ count_mat.T    # (N, M)

        # ── Step F: per-domain monthly costs  →  dict of (N, M) ─────────
        domain_monthly: dict[str, np.ndarray] = {}
        for dom in self._DOMAINS:
            k_idx = np.array([k for k, p in enumerate(params) if p['domain'] == dom],
                             dtype=np.intp)
            if k_idx.size == 0:
                domain_monthly[dom] = np.zeros((N, M), dtype=np.float64)
            else:
                domain_monthly[dom] = unit_costs[:, k_idx] @ count_mat[:, k_idx].T

        # ── Step G: cumulative sums  →  (N, M) each ─────────────────────
        cum_total  = np.cumsum(monthly_total, axis=1)
        cum_domain = {d: np.cumsum(domain_monthly[d], axis=1) for d in self._DOMAINS}

        # ── Step H: percentile outputs ───────────────────────────────────
        cumulative_out: dict[str, dict] = {'total': self._pct(cum_total)}
        for dom in self._DOMAINS:
            cumulative_out[dom] = self._pct(cum_domain[dom])

        # ── Step H+: row-per-month trajectory (p50 medians) for chart layers
        trajectory = [
            {
                "date":         months[i][:7],
                "total":        int(cumulative_out["total"]["p50"][i]),
                "healthcare":   int(cumulative_out["healthcare"]["p50"][i]),
                "justice":      int(cumulative_out["justice"]["p50"][i]),
                "economic":     int(cumulative_out["economic"]["p50"][i]),
                "childWelfare": int(cumulative_out["child_welfare"]["p50"][i]),
            }
            for i in range(M)
        ]

        # ── Step I: summary scalars (end-of-horizon values) ──────────────
        final_total = cum_total[:, -1]
        p025_f, p50_f, p975_f = np.percentile(final_total, [2.5, 50.0, 97.5])

        med_final = float(p50_f)
        domain_shares: dict[str, float] = {}
        for dom in self._DOMAINS:
            med_dom = float(np.median(cum_domain[dom][:, -1]))
            domain_shares[dom] = round(med_dom / med_final * 100, 2) if med_final > 0 else 0.0

        summary = {
            'total_cost_p025':   round(float(p025_f), 0),
            'total_cost_p50':    round(float(p50_f),  0),
            'total_cost_p975':   round(float(p975_f), 0),
            'domain_shares_pct': domain_shares,
        }

        # ── Step J: metadata ─────────────────────────────────────────────
        runtime = round(time.perf_counter() - t0, 4)

        metadata = {
            'n_simulations':     n_simulations,
            'n_months':          M,
            'n_cost_lines':      K,
            'time_range':        f"{months[0]} → {months[-1]}",
            'runtime_s':         runtime,
            'overrides_applied':          overrides is not None,
            'population_scalers_applied': population_scalers or {},
            'cost_lines_active': [
                {
                    'domain':            p['domain'],
                    'metric':            p['metric'],
                    'mean_cost':         p['mean_cost'],
                    'std_dev':           p['std_dev'],
                    'distribution_type': p['distribution_type'],
                }
                for p in params
            ],
        }

        return {
            'metadata':   metadata,
            'months':     months,
            'cumulative': cumulative_out,
            'summary':    summary,
            'trajectory': trajectory,
        }


# ======================================================================
# Quick validation — run directly to smoke-test the engine
# ======================================================================

def _fmt_trillions(v: float) -> str:
    if abs(v) >= 1e12:
        return f"${v/1e12:.2f}T"
    if abs(v) >= 1e9:
        return f"${v/1e9:.2f}B"
    return f"${v/1e6:.1f}M"


if __name__ == '__main__':
    import sys

    DATA_DIR = os.path.join(os.path.dirname(__file__), 'datasets_cleaned')

    print("=" * 64)
    print("  Cost of Doing Nothing Simulator — Monte Carlo Engine Test")
    print("=" * 64)

    engine = CostProjectionEngine(DATA_DIR)

    # ── Run 1: baseline, 1 000 simulations ──────────────────────────────
    print("\n[1/3]  Baseline run  (N=1 000, seed=42) …")
    baseline = engine.run_simulation(n_simulations=1000, random_seed=42)
    meta     = baseline['metadata']
    summ     = baseline['summary']

    print(f"       Runtime   : {meta['runtime_s']:.3f} s")
    print(f"       Months    : {meta['n_months']}  ({meta['time_range']})")
    print(f"       Cost lines: {meta['n_cost_lines']}")
    print(f"\n  ── Cumulative cost at end of horizon (1999–2032) ──────────")
    print(f"       Lower 95 % CI : {_fmt_trillions(summ['total_cost_p025'])}")
    print(f"       Median        : {_fmt_trillions(summ['total_cost_p50'])}")
    print(f"       Upper 95 % CI : {_fmt_trillions(summ['total_cost_p975'])}")
    print(f"\n  ── Domain shares (median) ─────────────────────────────────")
    for dom, pct in summ['domain_shares_pct'].items():
        print(f"       {dom:<20}: {pct:>6.2f}%")

    # ── Run 2: override ER cost to $5 000 ──────────────────────────────
    print("\n[2/3]  Override run — ER visit cost raised to $5 000 …")
    override_result = engine.run_simulation(
        n_simulations=1000,
        random_seed=42,
        overrides={"healthcare": {"er_visit_overdose": {"mean_cost": 5000}}},
    )
    o_summ = override_result['summary']
    delta  = o_summ['total_cost_p50'] - summ['total_cost_p50']
    print(f"       Median total cost : {_fmt_trillions(o_summ['total_cost_p50'])}")
    print(f"       Δ vs baseline     : {_fmt_trillions(delta)}  (+{delta/summ['total_cost_p50']*100:.1f}%)")

    # ── Run 3: scale test at N=10 000 ───────────────────────────────────
    print("\n[3/3]  Scale test  (N=10 000) …")
    big = engine.run_simulation(n_simulations=10_000, random_seed=0)
    print(f"       Runtime: {big['metadata']['runtime_s']:.3f} s")
    print(f"       Median : {_fmt_trillions(big['summary']['total_cost_p50'])}")

    # ── Export baseline result ───────────────────────────────────────────
    out_path = os.path.join(DATA_DIR, 'simulation_result.json')
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(baseline, fh, indent=2)
    print(f"\nBaseline result exported → {out_path}")
    print("=" * 64)

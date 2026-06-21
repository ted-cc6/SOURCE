"""
state_extractor.py — Step 2 of the "Cost of Doing Nothing" Simulator

Extracts epidemiological population counts from FDA/SOURCE Vensim .tab
output and maps them to cost-triggering event columns that align 1-to-1
with the Step 1 synthetic cost dictionaries.

SOURCE FILES USED
-----------------
1. X8_final_Base.tab  (Raw Results/)
   - Single baseline run, no scenario filtering needed
   - Format: TSV, header row = "Time | 1999 | 1999.06 | ... | 2032"
   - Data rows: variable name (index) | values at each time step
   - Time resolution: 1/16 year ≈ every 23 days
   - Loading pattern confirmed from OSM Results Processing.ipynb:
       pd.read_csv(sep='\t', index_col=0)
   - Confirmed variable names (lines verified in file):
       HUD by MOUD[Bup/MMT/Viv], HUD no MOUD,
       Rx OUD no heroin by MOUD[Bup/MMT/Viv],
       Rx OUD with heroin by MOUD[Bup/MMT/Viv],
       Rx OUD no PY heroin no MOUD, Rx OUD with PY heroin no MOUD,
       Nondisordered heroin use, Rx misuse no PY heroin,
       Cumulative overdose deaths, Cumulative nonfatal overdoses

2. OSM_Master_CURRENT.mdl  (Vensim Files/)
   - Confirms stock/flow structure
   - Confirms criminal justice (arrest, incarceration) is NOT modeled;
     proxy rates from BJS literature are applied instead.

3. OSM Results Processing.ipynb  (Analysis & Graphing/)
   - Confirms loading pattern and variable name conventions
"""

import os
import json
import numpy as np
import pandas as pd


class StateExtractor:
    """
    Parse a Vensim .tab single-run output file from the FDA/SOURCE model
    and return a monthly time-series DataFrame of cost-triggering event
    counts aligned with the Step 1 cost distribution dictionaries.

    Output columns
    --------------
    er_visit_overdose_count   : Healthcare — ER visits for OD events
    inpatient_rehab_count     : Healthcare — entries into residential treatment
    outpatient_mat_count      : Healthcare — persons in active MOUD (stock)
    police_arrest_count       : Justice   — monthly arrests (proxy)
    incarceration_count       : Justice   — persons incarcerated (proxy stock)
    lost_productivity_count   : Economic  — untreated OUD persons (stock)
    foster_care_risk_count    : Welfare   — children at foster-care risk (proxy)
    """

    # ------------------------------------------------------------------
    # Exact Vensim variable names confirmed in X8_final_Base.tab
    # ------------------------------------------------------------------

    _CUMULATIVE_FATAL    = "Cumulative overdose deaths"
    _CUMULATIVE_NONFATAL = "Cumulative nonfatal overdoses"

    # All MOUD treatment stocks (outpatient MAT)
    _MOUD_VARS = [
        "HUD by MOUD[Bup]",
        "HUD by MOUD[MMT]",
        "HUD by MOUD[Viv]",
        "Rx OUD no heroin by MOUD[Bup]",
        "Rx OUD no heroin by MOUD[MMT]",
        "Rx OUD no heroin by MOUD[Viv]",
        "Rx OUD with heroin by MOUD[Bup]",
        "Rx OUD with heroin by MOUD[MMT]",
        "Rx OUD with heroin by MOUD[Viv]",
    ]

    # All untreated active OUD/misuse stocks
    _UNTREATED_VARS = [
        "HUD no MOUD",                      # heroin use disorder, not in treatment
        "Rx OUD no PY heroin no MOUD",      # Rx OUD (no heroin), untreated
        "Rx OUD with PY heroin no MOUD",    # Rx OUD (with heroin), untreated
        "Nondisordered heroin use",          # NDHU — heroin users without full OUD
        "Rx misuse no PY heroin",           # Rx misuse (pre-OUD), untreated
    ]

    # ------------------------------------------------------------------
    # Proxy rates for states NOT modeled in SOURCE
    # (Criminal Justice / Child Welfare)
    # Sources:
    #   BJS Drug Use and Crime Report 2022 → arrest & incarceration rates
    #   Child Welfare Information Gateway 2021 → foster care prevalence
    #   Timko et al. (2016) → MOUD 12-month retention ~70% → exit ~30%/yr
    #   CDC MMWR 2022 → ER reach rate for fatal ODs
    # ------------------------------------------------------------------

    ANNUAL_ARREST_RATE       = 0.15   # 15% of untreated OUD: annual CJ contact
    INCARCERATION_STOCK_RATE = 0.04   # 4%  of untreated OUD: incarcerated at any time
    FOSTER_CARE_RATE         = 0.12   # 12% proxy: children at foster-care risk
    MOUD_ANNUAL_EXIT_RATE    = 0.30   # 30% annual MOUD churn (dropout/completion)
    INPATIENT_ENTRY_FRACTION = 0.35   # 35% of new MOUD entrants used inpatient first
    ER_REACH_RATE_FATAL      = 0.70   # 70% of fatal ODs reach the ER

    # ------------------------------------------------------------------
    # Constructor
    # ------------------------------------------------------------------

    def __init__(self, tab_filepath: str):
        """
        Parameters
        ----------
        tab_filepath : str
            Path to a Vensim .tab single-run output file.
            Tested against X8_final_Base.tab format.
        """
        if not os.path.isfile(tab_filepath):
            raise FileNotFoundError(f"Tab file not found: {tab_filepath}")
        self.tab_filepath = tab_filepath
        self._raw: pd.DataFrame | None = None

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load_raw(self) -> pd.DataFrame:
        """
        Load the .tab file into a DataFrame.

        File layout
        -----------
        Header row : Time | 1999 | 1999.06 | 1999.12 | ... | 2032
        Data rows  : <VariableName> | val | val | ...

        After loading:
          df.index   = Vensim variable names  (str)
          df.columns = fractional-year labels (str: '1999', '1999.06', ...)
        """
        if self._raw is not None:
            return self._raw

        df = pd.read_csv(
            self.tab_filepath,
            sep='\t',
            index_col=0,         # variable name column → index
            header=0,
            low_memory=False,
            on_bad_lines='skip',
        )
        # Normalise whitespace in index and column labels
        df.index   = df.index.astype(str).str.strip()
        df.columns = df.columns.astype(str).str.strip()
        self._raw  = df
        return df

    @staticmethod
    def _fractional_years_to_datetimes(col_labels: pd.Index) -> pd.DatetimeIndex:
        """
        Convert fractional-year column labels ('1999', '1999.06', ...) to
        a DatetimeIndex.  Each label is parsed as a float, split into year
        and fractional-year, then converted to an approximate calendar date.
        """
        stamps = []
        for label in col_labels:
            try:
                yf = float(label)
            except ValueError:
                stamps.append(pd.NaT)
                continue
            year     = int(yf)
            day_off  = (yf - year) * 365.25
            ts       = pd.Timestamp(year=year, month=1, day=1) + pd.Timedelta(days=day_off)
            stamps.append(ts)
        return pd.DatetimeIndex(stamps)

    def _get_series(self, raw: pd.DataFrame, var_name: str) -> pd.Series:
        """
        Return a numeric Series for one Vensim variable.
        Emits a warning and returns zeros if the variable is missing.
        """
        if var_name in raw.index:
            return pd.to_numeric(raw.loc[var_name], errors='coerce').fillna(0.0)
        print(f"  [WARNING] Variable not found in .tab file: '{var_name}' → substituting zeros.")
        return pd.Series(0.0, index=raw.columns)

    def _sum_series(self, raw: pd.DataFrame, var_names: list) -> pd.Series:
        """Sum multiple Vensim variable rows, ignoring missing ones."""
        total = pd.Series(0.0, index=raw.columns)
        for name in var_names:
            total = total + self._get_series(raw, name)
        return total

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract(
        self,
        start_year: float = 1999.0,
        end_year:   float = 2032.0,
    ) -> pd.DataFrame:
        """
        Extract and map SOURCE model outputs to cost-triggering event counts.

        Parameters
        ----------
        start_year : float
            First simulation year to include (e.g. 1999.0).
        end_year   : float
            Last simulation year to include  (e.g. 2032.0).

        Returns
        -------
        pd.DataFrame
            Monthly DatetimeIndex (freq='MS'), columns:
              er_visit_overdose_count
              inpatient_rehab_count
              outpatient_mat_count
              police_arrest_count
              incarceration_count
              lost_productivity_count
              foster_care_risk_count
        """
        raw = self._load_raw()

        # ── 1. Filter to requested time window ─────────────────────────
        col_floats = pd.to_numeric(raw.columns, errors='coerce')
        time_mask  = (col_floats >= start_year) & (col_floats <= end_year)
        raw_w      = raw.loc[:, time_mask]
        t_vals     = col_floats[time_mask].values       # float years array

        # ── 2. Extract Vensim variables ─────────────────────────────────
        cumul_fatal    = self._get_series(raw_w, self._CUMULATIVE_FATAL).values.astype(float)
        cumul_nonfatal = self._get_series(raw_w, self._CUMULATIVE_NONFATAL).values.astype(float)
        moud_total     = self._sum_series(raw_w, self._MOUD_VARS).values.astype(float)
        untreated_oud  = self._sum_series(raw_w, self._UNTREATED_VARS).values.astype(float)

        # ── 3. Derive flows from cumulative stocks ──────────────────────
        # diff on cumulative → events per sub-annual step (clip to 0: no negative events)
        fatal_flow    = np.maximum(0.0, np.diff(cumul_fatal,    prepend=cumul_fatal[0]))
        nonfatal_flow = np.maximum(0.0, np.diff(cumul_nonfatal, prepend=cumul_nonfatal[0]))

        # ── 4. Derive MOUD inpatient-entry proxy ───────────────────────
        # Per step: exits = stock × annual_exit_rate × Δt_years
        # Per step: entries = max(0, ΔMOUD) + exits  (stock change + exits = entries)
        dt_years  = np.concatenate([[t_vals[1] - t_vals[0]], np.diff(t_vals)])
        moud_exits   = moud_total * self.MOUD_ANNUAL_EXIT_RATE * dt_years
        moud_net_chg = np.diff(moud_total, prepend=moud_total[0])
        moud_entries = np.maximum(0.0, moud_net_chg) + moud_exits

        # ── 5. Build sub-annual DataFrame with DatetimeIndex ───────────
        dt_idx = self._fractional_years_to_datetimes(raw_w.columns)

        sub = pd.DataFrame({
            "_fatal_flow":    fatal_flow,
            "_nonfatal_flow": nonfatal_flow,
            "_moud_entries":  moud_entries,
            "_moud_total":    moud_total,
            "_untreated_oud": untreated_oud,
        }, index=dt_idx)

        # Clean duplicates and NaTs introduced by floating-point rounding
        sub = sub[~sub.index.isna()]
        sub = sub[~sub.index.duplicated(keep="first")]
        sub = sub.sort_index()

        # ── 6. Resample to monthly ──────────────────────────────────────
        # Flows → sum within month; Stocks → mean within month
        monthly_flows  = sub[["_fatal_flow", "_nonfatal_flow", "_moud_entries"]].resample("MS").sum()
        monthly_stocks = sub[["_moud_total", "_untreated_oud"]].resample("MS").mean()
        monthly        = monthly_flows.join(monthly_stocks).ffill().fillna(0.0)

        # ── 7. Map to output schema ─────────────────────────────────────
        out = pd.DataFrame(index=monthly.index)
        out.index.name = "month"

        # --- Healthcare ---
        # Every nonfatal OD = 1 ER visit; 70% of fatal ODs reach the ER
        out["er_visit_overdose_count"] = (
            monthly["_nonfatal_flow"]
            + monthly["_fatal_flow"] * self.ER_REACH_RATE_FATAL
        ).clip(lower=0.0)

        # 35% of new MOUD entrants are assumed to have used inpatient first
        out["inpatient_rehab_count"] = (
            monthly["_moud_entries"] * self.INPATIENT_ENTRY_FRACTION
        ).clip(lower=0.0)

        # Active MOUD persons (stock) → ongoing outpatient cost
        out["outpatient_mat_count"] = monthly["_moud_total"].clip(lower=0.0)

        # --- Justice (proxy — not modeled in SOURCE) ---
        # Annual arrest rate / 12 → monthly new arrests from untreated OUD pool
        out["police_arrest_count"] = (
            monthly["_untreated_oud"] * self.ANNUAL_ARREST_RATE / 12
        ).clip(lower=0.0)

        # Incarceration stock: fraction of untreated OUD residing in prison at any time
        out["incarceration_count"] = (
            monthly["_untreated_oud"] * self.INCARCERATION_STOCK_RATE
        ).clip(lower=0.0)

        # --- Economic ---
        # Every untreated OUD person = 1 unit of lost productivity
        out["lost_productivity_count"] = monthly["_untreated_oud"].clip(lower=0.0)

        # --- Child Welfare (proxy) ---
        # 12% of untreated OUD parents estimated to have children at foster-care risk
        out["foster_care_risk_count"] = (
            monthly["_untreated_oud"] * self.FOSTER_CARE_RATE
        ).clip(lower=0.0)

        return out.round(1)

    def summary(self, df: pd.DataFrame) -> None:
        """Print a quick sanity-check summary of an extracted DataFrame."""
        print(f"\n{'─' * 60}")
        print(f"  StateExtractor — Output Summary")
        print(f"{'─' * 60}")
        print(f"  Time range : {df.index[0].date()} → {df.index[-1].date()}")
        print(f"  Rows       : {len(df):,}  (monthly steps)")
        print(f"  Columns    : {list(df.columns)}")
        print(f"\n  Peak values (across all months):")
        for col in df.columns:
            print(f"    {col:<35} {df[col].max():>12,.0f}")
        print(f"\n  Cumulative totals (sum across all months):")
        for col in df.columns:
            print(f"    {col:<35} {df[col].sum():>12,.0f}")
        print(f"{'─' * 60}\n")


# ──────────────────────────────────────────────────────────────────────
# Quick test — run directly to validate against the baseline file
# ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    BASE_TAB = os.path.join(
        "Publication Figures & Results Summary",
        "Raw Results",
        "X8_final_Base.tab",
    )

    print(f"Loading: {BASE_TAB}")
    extractor = StateExtractor(BASE_TAB)

    # Extract full historical + projection range
    df = extractor.extract(start_year=1999.0, end_year=2032.0)
    extractor.summary(df)

    # Spot-check: first 6 months and last 6 months
    print("First 6 months:")
    print(df.head(6).to_string())
    print("\nLast 6 months (projection):")
    print(df.tail(6).to_string())

    # Export for use by downstream Monte Carlo engine
    out_path = os.path.join("datasets_cleaned", "state_timeseries.csv")
    df.to_csv(out_path)
    print(f"\nExported monthly time-series → {out_path}")

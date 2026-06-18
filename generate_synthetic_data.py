"""
generate_synthetic_data.py

Generates foundational synthetic cost distribution files for the
"Cost of Doing Nothing" OUD Simulator.

All figures are US national averages (approx. 2020-2025), grounded in
published sources: SAMHSA, BJS, RAND, AHRQ/MEPS, BLS, AFCARS federal reports.

Distributions:
  - "normal"     : for costs that are relatively symmetric around a mean
                   (e.g., government-set rates, per diem fees)
  - "log-normal" : for costs that are right-skewed (e.g., medical bills,
                   legal proceedings where outliers drive the tail)
  std_dev is calibrated so that the coefficient of variation (CV = SD/mean)
  reflects real-world variability documented in the literature.
"""

import os
import json

OUTPUT_DIR = "synthetic_data"

# ---------------------------------------------------------------------------
# 1. HEALTHCARE COSTS  (simulating MEPS / AHRQ / SAMHSA data)
# ---------------------------------------------------------------------------
healthcare_costs = {
    "_metadata": {
        "domain": "Healthcare",
        "currency": "USD",
        "reference_year": 2022,
        "primary_sources": [
            "AHRQ Medical Expenditure Panel Survey (MEPS)",
            "SAMHSA National Survey of Substance Abuse Treatment Services (N-SSATS)",
            "Florence et al. (2021) - Updated Economic Burden of OUD, MMWR"
        ]
    },
    "er_visit_overdose": {
        "mean_cost": 3200,
        "std_dev": 1100,
        "distribution_type": "log-normal",
        "unit": "USD per visit",
        "source_rationale": (
            "AHRQ/HCUP data reports mean hospital costs for opioid overdose ER visits "
            "at $2,700-$3,800; log-normal reflects right skew from ICU admissions and "
            "multi-day holds driving the upper tail."
        )
    },
    "inpatient_rehab_30_days": {
        "mean_cost": 19500,
        "std_dev": 6500,
        "distribution_type": "log-normal",
        "unit": "USD per 30-day episode",
        "source_rationale": (
            "SAMHSA N-SSATS and NIDA report residential 30-day treatment running "
            "$14,000-$27,000 depending on facility type and state; log-normal captures "
            "the wide spread between public and private facilities."
        )
    },
    "outpatient_medication_annual": {
        "mean_cost": 6800,
        "std_dev": 2000,
        "distribution_type": "normal",
        "unit": "USD per patient per year",
        "source_rationale": (
            "Methadone maintenance averages $6,500-$9,000/year and buprenorphine "
            "office-based treatment $4,500-$7,500/year per SAMHSA; normal distribution "
            "reflects relatively standardized dosing protocols and state-regulated fee schedules."
        )
    }
}

# ---------------------------------------------------------------------------
# 2. CRIMINAL JUSTICE COSTS  (simulating BJS / RAND data)
# ---------------------------------------------------------------------------
justice_costs = {
    "_metadata": {
        "domain": "Criminal Justice",
        "currency": "USD",
        "reference_year": 2022,
        "primary_sources": [
            "Bureau of Justice Statistics (BJS) - Prisoners Series",
            "RAND Drug Policy Research Center - Cost of Crime estimates",
            "Vera Institute of Justice - Price of Prisons (2020 update)"
        ]
    },
    "police_arrest": {
        "mean_cost": 1800,
        "std_dev": 500,
        "distribution_type": "normal",
        "unit": "USD per arrest event",
        "source_rationale": (
            "RAND and BJS studies estimate per-arrest costs (officer time, booking, "
            "processing) at $1,400-$2,500 for drug offenses; normal distribution reflects "
            "fairly uniform municipal police department cost structures."
        )
    },
    "court_processing": {
        "mean_cost": 11500,
        "std_dev": 4000,
        "distribution_type": "log-normal",
        "unit": "USD per case adjudicated",
        "source_rationale": (
            "Full adjudication costs including prosecution, public defense, and judge/court "
            "time run $8,000-$18,000 per BJS and RAND for drug offenses; log-normal captures "
            "the long tail from complex multi-hearing cases versus simple guilty pleas."
        )
    },
    "incarceration_annual": {
        "mean_cost": 39000,
        "std_dev": 9000,
        "distribution_type": "normal",
        "unit": "USD per inmate per year",
        "source_rationale": (
            "Vera Institute's 2020 update reports state prison annual costs averaging "
            "$35,000-$45,000 nationally (range: $25k in low-cost states to $60k+ in CA/NY); "
            "normal distribution reflects relatively symmetric variation around a state-set "
            "per diem rate."
        )
    }
}

# ---------------------------------------------------------------------------
# 3. ECONOMIC COSTS  (simulating BLS / CDC economic burden data)
# ---------------------------------------------------------------------------
economic_costs = {
    "_metadata": {
        "domain": "Economic / Labor",
        "currency": "USD",
        "reference_year": 2022,
        "primary_sources": [
            "Bureau of Labor Statistics (BLS) - Occupational Employment & Wage Statistics",
            "Florence et al. (2021) - Economic Burden of OUD, MMWR",
            "SSA Annual Statistical Report on SSDI/SSI (2022)"
        ]
    },
    "lost_productivity_annual": {
        "mean_cost": 33500,
        "std_dev": 10500,
        "distribution_type": "log-normal",
        "unit": "USD per person per year",
        "source_rationale": (
            "BLS median wage for workers in lower-quartile occupations (service, manual "
            "labor) most associated with severe OUD is ~$32,000-$36,000; Florence et al. "
            "use a human-capital approach anchoring to this range; log-normal reflects "
            "heterogeneity in pre-illness employment history."
        )
    },
    "unemployment_disability_annual": {
        "mean_cost": 14200,
        "std_dev": 3200,
        "distribution_type": "normal",
        "unit": "USD per recipient per year",
        "source_rationale": (
            "SSA data shows average SSDI benefit of ~$1,100/month ($13,200/year) plus "
            "state supplemental payments; normal distribution reflects the bounded, "
            "government-set nature of disability payment schedules."
        )
    }
}

# ---------------------------------------------------------------------------
# 4. CHILD WELFARE COSTS  (simulating AFCARS / HHS data)
# ---------------------------------------------------------------------------
child_welfare_costs = {
    "_metadata": {
        "domain": "Child Welfare",
        "currency": "USD",
        "reference_year": 2022,
        "primary_sources": [
            "AFCARS (Adoption and Foster Care Analysis and Reporting System) - HHS",
            "Child Welfare Information Gateway - Foster Care Cost Reports (2021)",
            "GAO-21-303 - Foster Care: HHS Should Improve Oversight"
        ]
    },
    "foster_care_annual": {
        "mean_cost": 37000,
        "std_dev": 10000,
        "distribution_type": "log-normal",
        "unit": "USD per child per year",
        "source_rationale": (
            "HHS/AFCARS federal and state combined costs (placement, caseworker, "
            "administrative, services) average $33,000-$43,000 per child annually; "
            "log-normal reflects wide variation between kinship placements (~$20k) "
            "and specialized therapeutic foster care (~$60k+)."
        )
    }
}

# ---------------------------------------------------------------------------
# WRITE FILES
# ---------------------------------------------------------------------------

files_to_write = {
    "healthcare_costs.json": healthcare_costs,
    "justice_costs.json":    justice_costs,
    "economic_costs.json":   economic_costs,
    "child_welfare_costs.json": child_welfare_costs,
}

os.makedirs(OUTPUT_DIR, exist_ok=True)

for filename, data in files_to_write.items():
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  Written: {filepath}")

print(f"\nDone. {len(files_to_write)} files written to '{OUTPUT_DIR}/'")

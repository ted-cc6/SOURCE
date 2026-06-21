"""
setup_rag.py -- One-time initialization script for the Policy Architect RAG engine.

Populates a local ChromaDB vector store with synthetic historical OUD
intervention precedents. Run this script once before starting the FastAPI
server. It is safe to re-run: upsert() replaces existing records by ID
rather than raising a duplicate error.

Usage:
    python setup_rag.py
"""

import os

import chromadb
import pandas as pd

# Resolve the database path relative to this file so the script works
# regardless of the working directory it is launched from.
_HERE = os.path.dirname(os.path.abspath(__file__))
CHROMA_DB_PATH = os.path.join(_HERE, "chroma_db")
COLLECTION_NAME = "oud_precedents"


# ---------------------------------------------------------------------------
# Historical intervention dataset
# ---------------------------------------------------------------------------

INTERVENTIONS: list[dict] = [
    {
        "id": "anchor-ed-ri-2016",
        "title": "Rhode Island AnchorED Program",
        "summary": (
            "The AnchorED initiative embedded addiction medicine consultants "
            "in hospital emergency departments to initiate buprenorphine "
            "treatment for patients presenting with opioid use disorder, "
            "creating a direct bridge from acute care to outpatient services."
        ),
        "impact": (
            "A 2018 JAMA Psychiatry study found that patients who received "
            "MOUD in the ED were 1.5 times more likely to engage in addiction "
            "treatment at 30 days. Rhode Island reported a 6.3% reduction in "
            "overdose deaths in the first year of statewide adoption."
        ),
        "jurisdiction": "Rhode Island",
        "year": 2016,
        "source": "JAMA Psychiatry (2018); Rhode Island Department of Health",
    },
    {
        "id": "cahoots-eugene-or-1989",
        "title": "CAHOOTS Crisis Assistance Program",
        "summary": (
            "Crisis Assistance Helping Out On The Streets pairs trained crisis "
            "workers with medics to respond to non-violent mental health, "
            "substance use, and welfare calls in Eugene, Oregon, diverting "
            "those calls away from sworn law enforcement."
        ),
        "impact": (
            "CAHOOTS handles approximately 17% of Eugene Police Department "
            "call volume annually, diverting over 24,000 calls per year from "
            "law enforcement at a cost-per-call substantially lower than "
            "traditional police dispatch."
        ),
        "jurisdiction": "Eugene, Oregon",
        "year": 1989,
        "source": "White Bird Clinic; Journal of Substance Abuse Treatment",
    },
    {
        "id": "project-dawn-ohio-2012",
        "title": "Project DAWN (Deaths Avoided With Naloxone)",
        "summary": (
            "Ohio's Project DAWN is a statewide community-based naloxone "
            "distribution program that trains laypeople, first responders, "
            "and family members to administer naloxone and respond to opioid "
            "overdoses outside of clinical settings."
        ),
        "impact": (
            "Between 2012 and 2018, Ohio DAWN sites distributed over 100,000 "
            "naloxone kits and documented more than 11,000 overdose reversals, "
            "establishing a scalable and replicable model for community-driven "
            "overdose prevention."
        ),
        "jurisdiction": "Ohio (statewide)",
        "year": 2012,
        "source": "Ohio Department of Health; American Journal of Public Health",
    },
    {
        "id": "lead-seattle-wa-2011",
        "title": "Law Enforcement Assisted Diversion (LEAD)",
        "summary": (
            "LEAD enables police officers in Seattle to redirect low-level "
            "drug offenders to community-based social services, case managers, "
            "and harm reduction resources at the point of contact, bypassing "
            "the criminal justice system entirely."
        ),
        "impact": (
            "A peer-reviewed evaluation found that LEAD participants were 58% "
            "less likely to be arrested post-enrollment, with meaningfully "
            "lower per-person criminal justice costs compared to traditional "
            "prosecution pathways."
        ),
        "jurisdiction": "Seattle, Washington",
        "year": 2011,
        "source": "University of Washington; Drug and Alcohol Dependence (2017)",
    },
    {
        "id": "ssp-scott-county-in-2015",
        "title": "Indiana Scott County Syringe Services Program",
        "summary": (
            "Following a historic HIV outbreak linked to injection drug use, "
            "Indiana launched an emergency syringe services program in rural "
            "Scott County providing clean supplies, HIV testing, naloxone "
            "kits, and referrals to medication-assisted treatment providers."
        ),
        "impact": (
            "The SSP contributed to a 90% reduction in new HIV diagnoses in "
            "Scott County within two years and became a foundational case study "
            "for rural harm reduction policy in states with historically "
            "restrictive syringe exchange laws."
        ),
        "jurisdiction": "Scott County, Indiana",
        "year": 2015,
        "source": "CDC MMWR (2016); New England Journal of Medicine",
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_dataframe() -> pd.DataFrame:
    """Return the interventions as a typed Pandas DataFrame."""
    df = pd.DataFrame(INTERVENTIONS)
    # The document column is what ChromaDB embeds. Combining all descriptive
    # fields gives the embedding model the richest semantic signal per record.
    df["document"] = df.apply(
        lambda row: f"{row['title']}. {row['summary']} {row['impact']}",
        axis=1,
    )
    return df


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print(f"[setup_rag] Connecting to ChromaDB at: {CHROMA_DB_PATH}")
    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)

    # get_or_create_collection is idempotent: safe on first run and re-runs.
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
    print(f"[setup_rag] Collection '{COLLECTION_NAME}' ready.")

    df = _build_dataframe()
    print(f"[setup_rag] Upserting {len(df)} documents ...")

    # Only the columns that belong in metadata (not the derived document text)
    metadata_cols = ["title", "summary", "impact", "jurisdiction", "year", "source"]

    collection.upsert(
        ids=df["id"].tolist(),
        documents=df["document"].tolist(),
        metadatas=df[metadata_cols].to_dict("records"),
    )

    final_count = collection.count()
    print(f"[setup_rag] Done. Collection now contains {final_count} document(s).")
    print("[setup_rag] You can now start the FastAPI server.")


if __name__ == "__main__":
    main()

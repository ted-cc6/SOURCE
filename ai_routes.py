"""
ai_routes.py -- FastAPI router for all Gemini-powered AI endpoints.

Provides five endpoints:
  POST /api/generate-summary    -- migrated from LM Studio (executive summary)
  POST /api/generate-persona    -- migrated from LM Studio (case study narrative)
  POST /api/search-precedents   -- historical OUD intervention precedents
  POST /api/draft-policy        -- structured legislative text block
  POST /api/project-impact      -- qualitative community outcome narrative

Call init_gemini() from your app lifespan AFTER load_dotenv() so the
environment variable is available before the SDK is configured.
"""

import json
import os
from typing import Any, Optional

import chromadb
import google.generativeai as genai
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Module-level state -- populated by init_gemini() during app startup
# ---------------------------------------------------------------------------

_model: Optional[genai.GenerativeModel] = None

# ChromaDB path constants -- resolved relative to this file so they work
# regardless of where uvicorn is launched from.
_CHROMA_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")
_COLLECTION_NAME = "oud_precedents"


def init_gemini() -> None:
    """
    Configure the Gemini client and instantiate the shared model.
    Must be called after load_dotenv() resolves GEMINI_API_KEY.
    Raises RuntimeError if the key is absent so the app refuses to start
    rather than failing silently on the first request.
    """
    global _model
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. "
            "Populate the .env file in the backend root and restart the server."
        )
    genai.configure(api_key=api_key)
    _model = genai.GenerativeModel("gemini-1.5-flash")
    print("[startup] Gemini client ready (gemini-1.5-flash).")


def _get_model() -> genai.GenerativeModel:
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail="Gemini client is not initialised. The server may still be starting.",
        )
    return _model


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api", tags=["AI"])


# ---------------------------------------------------------------------------
# Shared Pydantic models
# ---------------------------------------------------------------------------

class SummaryRequest(BaseModel):
    """Accepts the full /simulate response body directly -- no reshaping needed."""
    total_cost_p50: float = Field(
        description="Median cumulative total cost in USD (summary.total_cost_p50).",
    )
    domain_shares_pct: dict[str, float] = Field(
        description="Per-domain share of median total cost (summary.domain_shares_pct).",
    )
    equity_distribution: dict[str, dict[str, float]] = Field(
        description="Demographic cost breakdown from /simulate (equity_distribution).",
    )
    population_scalers_applied: dict[str, float] = Field(
        default_factory=dict,
        description="Scalers used in this run. Empty dict means baseline.",
    )


class PersonaRequest(BaseModel):
    domain: str = Field(
        description="Cost domain to focus on.",
        examples=["Child Welfare"],
    )
    income_bracket: str = Field(
        description="Income bracket of the hypothetical subject.",
        examples=["Below $30k"],
    )
    intervention_applied: Optional[str] = Field(
        default=None,
        description="Active policy context, or None for baseline.",
        examples=["Expanded MAT Access"],
    )


class PrecedentSearchRequest(BaseModel):
    query: str = Field(
        description="Natural language query describing the intervention type to search for.",
        examples=["needle exchange programs Indiana rural counties"],
        min_length=5,
    )
    max_results: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of precedent records to return.",
    )


class PrecedentRecord(BaseModel):
    title: str
    jurisdiction: str
    year: int
    outcome_summary: str
    source_reference: str


class PrecedentSearchResponse(BaseModel):
    query: str
    records: list[PrecedentRecord]


class RAGPrecedentRecord(BaseModel):
    """One result record returned by the local ChromaDB similarity search."""
    title: str
    summary: str
    impact: str


class RAGPrecedentSearchResponse(BaseModel):
    query: str
    records: list[RAGPrecedentRecord]


class PolicyDraftRequest(BaseModel):
    focus_area: str = Field(
        description="The policy domain to target.",
        examples=["Harm Reduction"],
    )
    ambition_level: str = Field(
        description="Scale of the proposed reform.",
        examples=["Aggressive Overhaul", "Incremental Reform", "Pilot Program"],
    )
    state_tracking_data: dict[str, Any] = Field(
        description="Current simulation state data to ground the policy language.",
    )


class PolicyDraftResponse(BaseModel):
    focus_area: str
    ambition_level: str
    title: str
    summary: str
    provisions: list[str]
    fiscal_note: str


class ImpactProjectionRequest(BaseModel):
    simulation_outcomes: dict[str, Any] = Field(
        description="Monte Carlo outcome matrices from the simulation engine.",
    )
    community_focus: Optional[str] = Field(
        default=None,
        description="Optional demographic or geographic lens for the narrative.",
        examples=["rural low-income households"],
    )


class ImpactProjectionResponse(BaseModel):
    narrative: str
    key_themes: list[str]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _fmt_cost(v: float) -> str:
    if abs(v) >= 1e12:
        return f"${v / 1e12:.2f} trillion"
    if abs(v) >= 1e9:
        return f"${v / 1e9:.2f} billion"
    return f"${v:,.0f}"


async def _generate(
    prompt: str,
    temperature: float = 0.7,
    max_output_tokens: int = 500,
    response_mime_type: Optional[str] = None,
) -> str:
    """
    Calls Gemini and returns the raw text content.

    Pass response_mime_type="application/json" to activate Gemini's native JSON
    mode (requires google-generativeai >= 0.5). In JSON mode the model outputs
    syntactically valid JSON without markdown fences, so _strip_fences() becomes
    a no-op safety net rather than a required step.
    """
    model = _get_model()

    # Build config kwargs dynamically so older SDK versions that do not yet
    # recognise response_mime_type still receive a valid GenerationConfig.
    config_kwargs: dict = {
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
    }
    if response_mime_type:
        config_kwargs["response_mime_type"] = response_mime_type

    config = genai.types.GenerationConfig(**config_kwargs)

    try:
        response = await model.generate_content_async(prompt, generation_config=config)
        text = response.text  # raises ValueError when all candidates are blocked
        return text.strip()
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Gemini blocked this prompt (safety filter): {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API error ({type(exc).__name__}): {exc}",
        )


def _strip_fences(raw: str) -> str:
    """Remove markdown code fences that Gemini sometimes wraps around JSON."""
    text = raw.strip()
    if text.startswith("```"):
        # Drop the opening fence line and the closing fence
        lines = text.splitlines()
        # Skip first line (```json or ```) and last line (```)
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        text = "\n".join(inner).strip()
    return text


# ---------------------------------------------------------------------------
# Migrated endpoints (LM Studio -> Gemini)
# ---------------------------------------------------------------------------

@router.post(
    "/generate-summary",
    summary="AI executive summary of simulation results",
    response_description='{"executive_summary": "<3-sentence summary>"}',
)
async def generate_summary(request: SummaryRequest):
    """
    Sends simulation metrics to Gemini and returns a 3-sentence executive
    summary suitable for a county health director.

    Designed to accept the /simulate response body directly.
    """
    cost_str = _fmt_cost(request.total_cost_p50)

    top_domain = max(request.domain_shares_pct, key=request.domain_shares_pct.get)
    top_pct = request.domain_shares_pct[top_domain]
    domain_str = f"{top_domain.replace('_', ' ').title()} ({top_pct:.1f}% of total)"

    if request.population_scalers_applied:
        policy_str = "; ".join(
            f"{col.replace('_count', '').replace('_', ' ')} scaled to {mult:.2f}x"
            for col, mult in request.population_scalers_applied.items()
        )
    else:
        policy_str = "Baseline -- no intervention applied"

    income = request.equity_distribution.get("income_bracket", {})
    if income:
        top_bracket = max(income, key=income.get)
        bracket_str = (
            f"{top_bracket.replace('_', ' ')} households "
            f"({_fmt_cost(income[top_bracket])})"
        )
    else:
        bracket_str = "unknown"

    prompt = (
        "You are an expert public health policy analyst. "
        "Review the following simulation data for Opioid Use Disorder costs "
        "over a 33-year horizon (1999 to 2032). "
        f"Median Total Cost: {cost_str}. "
        f"Highest Cost Domain: {domain_str}. "
        f"Policy Applied: {policy_str}. "
        f"Most Impacted Income Bracket: {bracket_str}. "
        "Write a strict 3-sentence executive summary for a county health director "
        "explaining the financial and social impact of this specific scenario. "
        "Be precise with dollar figures and domain names."
    )

    text = await _generate(prompt, temperature=0.7, max_output_tokens=350)
    return {"executive_summary": text}


@router.post(
    "/generate-persona",
    summary="Generate a hypothetical 150-word personal case study",
    response_description='{"persona_narrative": "<150-word human story>"}',
)
async def generate_persona(request: PersonaRequest):
    """
    Returns a ~150-word hypothetical case study about an individual or
    family navigating OUD costs within the specified domain and income bracket.
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
        "Do not be melodramatic. Do not use bullet points."
    )

    text = await _generate(prompt, temperature=0.8, max_output_tokens=400)
    return {"persona_narrative": text}


# ---------------------------------------------------------------------------
# New Phase 1 endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/search-precedents",
    response_model=RAGPrecedentSearchResponse,
    summary="Search historical OUD intervention precedents via local RAG database",
)
async def search_precedents(request: PrecedentSearchRequest):
    """
    Queries the local ChromaDB vector store for historical US OUD policy
    precedents semantically similar to the user's query.

    Prerequisite: run setup_rag.py once to populate the vector store before
    calling this endpoint.
    """
    # Open the persistent store and retrieve the collection on each request.
    # ChromaDB's PersistentClient is backed by SQLite, so this is a cheap
    # file-open, not a network round-trip. For higher concurrency, promote
    # these to a module-level singleton initialised in the app lifespan.
    try:
        client = chromadb.PersistentClient(path=_CHROMA_DB_PATH)
        collection = client.get_collection(name=_COLLECTION_NAME)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                f"RAG database is not available at '{_CHROMA_DB_PATH}'. "
                f"Run 'python setup_rag.py' to initialise it. Detail: {exc}"
            ),
        )

    total_docs = collection.count()
    if total_docs == 0:
        return RAGPrecedentSearchResponse(query=request.query, records=[])

    # Cap n_results to the actual number of stored documents to avoid a
    # ChromaDB error when the requested count exceeds the collection size.
    n_results = min(request.max_results, total_docs)

    try:
        results = collection.query(
            query_texts=[request.query],
            n_results=n_results,
            include=["metadatas"],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"ChromaDB similarity search failed: {exc}",
        )

    # results["metadatas"] is a list-of-lists because ChromaDB supports batch
    # queries. Index 0 selects the results for our single query string.
    raw_records: list[dict] = results["metadatas"][0]

    records = [
        RAGPrecedentRecord(
            title=r["title"],
            summary=r["summary"],
            impact=r["impact"],
        )
        for r in raw_records
    ]

    return RAGPrecedentSearchResponse(query=request.query, records=records)


@router.post(
    "/draft-policy",
    response_model=PolicyDraftResponse,
    summary="Draft a formal government resolution for an OUD policy",
)
async def draft_policy(request: PolicyDraftRequest):
    """
    Uses a senior legislative drafter persona and Gemini's native JSON mode
    to produce a formally structured government resolution grounded in the
    active simulation cost data.

    The prompt enforces a strict four-key schema: title, summary, provisions,
    fiscal_note. A second JSON parse layer validates key presence before
    constructing the Pydantic response so malformed output is caught early
    with a descriptive 502 rather than a silent 500.
    """
    # Format simulation cost figures into readable dollar strings so Gemini
    # has concrete anchors rather than raw floating-point scientific notation.
    raw_cost = request.state_tracking_data.get("total_cost_p50")
    cost_str = _fmt_cost(raw_cost) if isinstance(raw_cost, (int, float)) else "not provided"

    domain_shares = request.state_tracking_data.get("domain_shares_pct", {})
    domain_str = (
        ", ".join(
            f"{k.replace('_', ' ').title()}: {v * 100:.1f}%"
            for k, v in domain_shares.items()
        )
        if domain_shares
        else "not provided"
    )

    prompt = (
        "You are a Senior Legislative Drafter with 20 years of experience crafting "
        "state-level public health legislation for the Indiana General Assembly. "
        "Your output is always formal, authoritative, precise, and structured in the "
        "style of actual Indiana state legislative documents.\n\n"
        "Draft a formal government resolution based on the following directive:\n"
        f"- Policy Focus Area: {request.focus_area}\n"
        f"- Reform Ambition Level: {request.ambition_level}\n"
        f"- Projected Total OUD Cost (simulation median): {cost_str}\n"
        f"- Cost Distribution by Domain: {domain_str}\n\n"
        "CRITICAL OUTPUT RULE: Respond with ONLY a single valid JSON object. "
        "Do not include markdown code fences, explanatory prose, or any text "
        "outside the JSON object itself. Gemini JSON mode is active.\n\n"
        "The JSON object must contain EXACTLY these four keys and no others:\n"
        "{\n"
        '  "title": '
        '"A formal bill title in the format: Resolution [3-digit number]: '
        'The [Descriptive Policy Name] Act",\n'
        '  "summary": '
        '"Two formal paragraphs totaling 130 to 160 words. Paragraph one states the '
        "legislative intent and problem scope. Paragraph two states the policy mechanism "
        'and expected outcome. Separate paragraphs with a single newline character.",\n'
        '  "provisions": [\n'
        '    "3 to 4 strings. Each string is one specific, actionable policy execution '
        "step naming the responsible agency, funding stream, or enforcement mechanism. "
        'Begin each provision with a numbered label such as: Section 1."\n'
        "  ],\n"
        '  "fiscal_note": '
        '"One formal sentence stating the estimated upfront appropriation and the '
        'projected long-term economic return or net savings to the state."\n'
        "}"
    )

    raw = await _generate(
        prompt,
        temperature=0.3,
        max_output_tokens=1000,
        response_mime_type="application/json",
    )

    try:
        data = json.loads(_strip_fences(raw))

        # Validate all required keys are present before constructing the model.
        missing = [k for k in ("title", "summary", "provisions", "fiscal_note") if k not in data]
        if missing:
            raise KeyError(f"Missing required keys: {missing}")

        # provisions must be a non-empty list of strings.
        if not isinstance(data["provisions"], list) or not data["provisions"]:
            raise TypeError("provisions must be a non-empty list")

        return PolicyDraftResponse(
            focus_area=request.focus_area,
            ambition_level=request.ambition_level,
            title=data["title"],
            summary=data["summary"],
            provisions=data["provisions"],
            fiscal_note=data["fiscal_note"],
        )
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Gemini returned an invalid response for the policy draft: {exc}. "
                f"Raw preview: {raw[:400]}"
            ),
        )


@router.post(
    "/project-impact",
    response_model=ImpactProjectionResponse,
    summary="Generate a 150-word community success story from simulation outcome matrices",
)
async def project_impact(request: ImpactProjectionRequest):
    """
    Uses an empathetic public health journalist persona to translate cold
    macroeconomic simulation figures into a grounded, 150-word success story.

    The narrative explicitly shifts framing from tragedy to strategy realization:
    it shows a specific Indiana family or individual before and after a policy
    intervention takes effect. Gemini's JSON mode enforces the two-key schema
    (narrative, key_themes) and a second validation layer ensures key_themes
    contains exactly 3 entries before the response is returned.
    """
    # Extract and format the headline cost figure for the prompt context.
    raw_total = request.simulation_outcomes.get("total_cost_p50")
    total_str = _fmt_cost(raw_total) if isinstance(raw_total, (int, float)) else "not provided"

    domain_shares = request.simulation_outcomes.get("domain_shares_pct", {})
    top_domain = (
        max(domain_shares, key=domain_shares.get).replace("_", " ").title()
        if domain_shares
        else "Healthcare"
    )

    community = request.community_focus or "Indiana communities"

    prompt = (
        "You are an empathetic public health journalist who specializes in translating "
        "macroeconomic health data into vivid, grounded human stories for general audiences. "
        "You write with warmth, specificity, and quiet optimism.\n\n"
        "You have been given the following simulation data for Indiana's Opioid Use "
        "Disorder (OUD) cost projection:\n"
        f"- Median projected total OUD cost: {total_str}\n"
        f"- Highest-burden cost domain: {top_domain}\n"
        f"- Community focus: {community}\n\n"
        "Write a 150-word qualitative SUCCESS STORY. The story MUST:\n"
        "1. Center on a specific, named individual or family in Indiana (invent a "
        "realistic first name and county).\n"
        "2. Show a clear BEFORE state: the hardship caused by untreated OUD.\n"
        "3. Show a clear AFTER state: how an active policy intervention (such as "
        "expanded MAT access, a diversion program, or naloxone distribution) "
        "successfully changed their trajectory.\n"
        "4. Reference at least one concrete, measurable detail drawn from the "
        "simulation data (a dollar figure, a domain, or a cost reduction).\n"
        "5. End on a note of measurable community-level hope, not just individual relief.\n"
        "6. Use grounded, vivid language. Avoid melodrama, cliches, and vague generalities.\n\n"
        "CRITICAL OUTPUT RULE: Respond with ONLY a single valid JSON object. "
        "Do not include markdown code fences or any text outside the JSON. "
        "Gemini JSON mode is active.\n\n"
        "The JSON object must contain EXACTLY these two keys and no others:\n"
        "{\n"
        '  "narrative": "The 150-word success story (target word count: 145 to 160 words)",\n'
        '  "key_themes": [\n'
        '    "EXACTLY 3 short string tags summarizing the core themes, '
        "written as title-case noun phrases (e.g., 'Family Stability', "
        "'Workforce Re-entry', 'Treatment Access')\"\n"
        "  ]\n"
        "}"
    )

    raw = await _generate(
        prompt,
        temperature=0.65,
        max_output_tokens=600,
        response_mime_type="application/json",
    )

    try:
        data = json.loads(_strip_fences(raw))

        missing = [k for k in ("narrative", "key_themes") if k not in data]
        if missing:
            raise KeyError(f"Missing required keys: {missing}")

        if not isinstance(data["key_themes"], list) or not data["key_themes"]:
            raise TypeError("key_themes must be a non-empty list")

        # Trim to exactly 3 themes in case Gemini returns more despite instructions.
        themes = data["key_themes"][:3]

        return ImpactProjectionResponse(
            narrative=data["narrative"],
            key_themes=themes,
        )
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Gemini returned an invalid response for the impact projection: {exc}. "
                f"Raw preview: {raw[:400]}"
            ),
        )

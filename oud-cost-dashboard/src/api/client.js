// src/api/client.js
//
// Thin fetch wrappers around the FastAPI backend defined in main.py and ai_routes.py.
// Every function throws an Error with a readable message on failure so components
// can render the detail string directly without extra parsing.

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (networkErr) {
    throw new Error(
      `Could not reach the API at ${BASE_URL}. Is "python main.py" running? (${networkErr.message})`
    );
  }

  if (!res.ok) {
    let detail = `Request to ${path} failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // response was not JSON, keep the generic message
    }
    throw new Error(detail);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Simulation engine
// ---------------------------------------------------------------------------

export function getHealth() {
  return request('/health');
}

export function getBaseline() {
  return request('/baseline');
}

export function postSimulate(params) {
  return request('/simulate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ---------------------------------------------------------------------------
// Narrative AI endpoints (Phase 1, migrated from LM Studio to Gemini)
// NOTE: paths updated from /generate_summary to /api/generate-summary to match
// the new ai_routes.py router prefix introduced in Phase 1.
// ---------------------------------------------------------------------------

export function postGenerateSummary(simResult) {
  return request('/api/generate-summary', {
    method: 'POST',
    body: JSON.stringify({
      total_cost_p50: simResult.summary.total_cost_p50,
      domain_shares_pct: simResult.summary.domain_shares_pct,
      equity_distribution: simResult.equity_distribution,
      population_scalers_applied: simResult.metadata.population_scalers_applied || {},
    }),
  });
}

export function postGeneratePersona(params) {
  return request('/api/generate-persona', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ---------------------------------------------------------------------------
// Policy Architect AI endpoints (Phase 2, ChromaDB RAG + Gemini)
// ---------------------------------------------------------------------------

export function postSearchPrecedents(query, maxResults = 3) {
  return request('/api/search-precedents', {
    method: 'POST',
    body: JSON.stringify({ query, max_results: maxResults }),
  });
}

export function postDraftPolicy(focusArea, ambitionLevel, stateTrackingData) {
  return request('/api/draft-policy', {
    method: 'POST',
    body: JSON.stringify({
      focus_area: focusArea,
      ambition_level: ambitionLevel,
      state_tracking_data: stateTrackingData ?? {},
    }),
  });
}

export function postProjectImpact(simulationOutcomes, communityFocus) {
  return request('/api/project-impact', {
    method: 'POST',
    body: JSON.stringify({
      simulation_outcomes: simulationOutcomes ?? {},
      ...(communityFocus ? { community_focus: communityFocus } : {}),
    }),
  });
}

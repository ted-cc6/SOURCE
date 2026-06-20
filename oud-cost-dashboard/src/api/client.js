// src/api/client.js
//
// Thin fetch wrappers around the FastAPI backend defined in main.py.
// Every function throws an Error with a readable message on failure —
// components catch these and render the message directly, since the
// backend already returns descriptive `detail` strings (e.g. for the
// LM Studio connection errors on /generate_summary and /generate_persona).

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
      // response wasn't JSON — keep the generic message
    }
    throw new Error(detail);
  }

  return res.json();
}

export function getHealth() {
  return request('/health');
}

export function getBaseline() {
  return request('/baseline');
}

/**
 * @param {Object} params
 * @param {number} params.n_simulations
 * @param {Object} [params.population_scalers] - e.g. { outpatient_mat_count: 1.2 }
 * @param {Object} [params.overrides] - nested cost overrides, see main.py SimulationRequest
 * @param {number} [params.random_seed]
 */
export function postSimulate(params) {
  return request('/simulate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Pipe a /simulate response directly in — only the four fields below are read.
 * @param {Object} simResult - full response from postSimulate / getBaseline
 */
export function postGenerateSummary(simResult) {
  return request('/generate_summary', {
    method: 'POST',
    body: JSON.stringify({
      total_cost_p50: simResult.summary.total_cost_p50,
      domain_shares_pct: simResult.summary.domain_shares_pct,
      equity_distribution: simResult.equity_distribution,
      population_scalers_applied: simResult.metadata.population_scalers_applied || {},
    }),
  });
}

/**
 * @param {Object} params
 * @param {string} params.domain
 * @param {string} params.income_bracket
 * @param {string} [params.intervention_applied]
 */
export function postGeneratePersona(params) {
  return request('/generate_persona', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

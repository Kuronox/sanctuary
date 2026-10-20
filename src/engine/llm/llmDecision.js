// Politica de decision LLM (Experimento V3-LLM). Implementa la MISMA
// interfaz que decision.js: decide(world, agent) -> { action, rationale },
// pero es asincrona porque involucra una llamada de red real.
//
// El World Engine (world.js) no sabe nada de DeepSeek, presupuesto, reintentos
// ni fallback: solo le pregunta a este modulo "decide", y siempre recibe de
// vuelta una accion valida — si el LLM no participa esta vez (espaciado,
// presupuesto agotado, error, respuesta invalida) el fallback es la MISMA
// politica determinista existente (decision.js), nunca una accion inventada.
import { decide as decideDeterministic, actionTarget, expectedOutcome } from "../decision.js";
import { listCandidateActions } from "../actions.js";
import { buildFilteredWorldView } from "./filteredWorldView.js";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.js";
import { callDeepSeek, hasApiKey, DEEPSEEK_MODEL, DEEPSEEK_MAX_OUTPUT_TOKENS } from "./deepseekClient.js";
import * as budget from "./budget.js";
import { appendLlmDecision } from "../store.js";

// Espaciado minimo entre consultas reales al LLM para un mismo agente.
// Con 24 ticks/dia y un espaciado promedio de 12 ticks (mas la puerta de
// probabilidad de abajo), el objetivo es ~2 decisiones LLM por agente por
// dia (seccion 13 del encargo), no una en cada tick.
const MIN_TICKS_BETWEEN_LLM_CALLS = 8;
const CALL_PROBABILITY_WHEN_ELIGIBLE = 1 / 10; // ajustado junto al espaciado minimo para promediar ~2/dia
const MIN_CANDIDATES_FOR_REAL_CHOICE = 3; // con 1-2 candidatos no hay eleccion real que valga una llamada

let authBroken = false; // se activa tras el primer error de autenticacion: evita seguir gastando llamadas de red contra una key invalida

// Hash determinista (no consume el RNG del mundo) para decidir, por
// agente y tick, si esta consulta cae dentro de la ventana de llamada.
// Que un agente LLM sea consultado o no NUNCA debe alterar el stream de
// world.rng que usan los 65 agentes deterministas — de lo contrario la
// unica variable experimental (la politica) dejaria de ser la unica
// diferencia entre corridas.
function stableHash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000003) / 1000003;
}

function shouldConsultLLM(world, agent, candidateCount) {
  if (candidateCount < MIN_CANDIDATES_FOR_REAL_CHOICE) return false;
  const last = agent.lastLlmConsultTick;
  if (last != null && world.time.tick - last < MIN_TICKS_BETWEEN_LLM_CALLS) return false;
  return stableHash01(`${agent.id}:${world.time.tick}`) < CALL_PROBABILITY_WHEN_ELIGIBLE;
}

async function attemptOnce({ world, agent, view, candidates }) {
  const userPrompt = buildUserPrompt(view);
  const res = await callDeepSeek({ systemPrompt: SYSTEM_PROMPT, userPrompt });
  if (!res.ok) return { ok: false, res };

  let parsed;
  try {
    parsed = JSON.parse(res.content);
  } catch {
    return { ok: false, res: { ...res, errorType: "invalid_json" } };
  }
  const idx = Number(parsed.indice);
  if (!Number.isInteger(idx) || idx < 1 || idx > candidates.length || typeof parsed.razon !== "string") {
    return { ok: false, res: { ...res, errorType: "invalid_action" } };
  }
  return { ok: true, res, choice: candidates[idx - 1], reason: parsed.razon.slice(0, 240).replace(/\s+/g, " ").trim() };
}

const TRANSIENT_ERRORS = new Set(["timeout", "network_error", "server_error", "rate_limit"]);

export async function decide(world, agent) {
  const det = decideDeterministic(world, agent);

  // Chequeo barato (sin construir el FilteredWorldView todavia): solo el
  // conteo de acciones candidatas, igual que ya calcula decision.js por
  // dentro. Esto decide si ESTE tick amerita siquiera considerar al LLM.
  const candidateCount = listCandidateActions(world, agent).length;
  if (!shouldConsultLLM(world, agent, candidateCount)) {
    return det; // espaciado/trivialidad: este tick no amerita una consulta real
  }
  agent.lastLlmConsultTick = world.time.tick;

  const logBase = {
    tick: world.time.tick,
    day: world.time.day,
    agentId: agent.id,
    agentName: agent.name,
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
    location: agent.location,
  };

  // A partir de aqui SI se considera una consulta real: se registra pase lo
  // que pase (exito o fallback), incluida la ausencia de API key — asi el
  // reporte puede calcular que porcentaje de las decisiones "elegibles"
  // termino en fallback y por que (seccion 16 del encargo).
  if (!hasApiKey() || authBroken) {
    budget.recordAttempt({ tick: world.time.tick, fallback: true });
    appendLlmDecision({
      ...logBase,
      availableActions: null,
      selectedAction: det.action.type,
      arguments: det.action.data || {},
      reason: null,
      inputTokens: 0, outputTokens: 0, cachedTokens: 0,
      estimatedCost: 0, cumulativeCost: budget.getSummary().cumulativeCostUsd,
      latencyMs: 0, fallback: true, fallbackReason: hasApiKey() ? "auth_broken" : "missing_api_key",
    });
    return det;
  }

  const { view, candidates } = buildFilteredWorldView(world, agent);
  const promptCharLength = SYSTEM_PROMPT.length + JSON.stringify(view).length;
  logBase.availableActions = candidates.map((c, i) => ({ indice: i + 1, tipo: c.type }));

  if (!budget.canAttemptCall(promptCharLength, DEEPSEEK_MAX_OUTPUT_TOKENS)) {
    budget.recordAttempt({ tick: world.time.tick, fallback: true });
    appendLlmDecision({
      ...logBase,
      selectedAction: det.action.type,
      arguments: det.action.data || {},
      reason: null,
      inputTokens: 0, outputTokens: 0, cachedTokens: 0,
      estimatedCost: 0, cumulativeCost: budget.getSummary().cumulativeCostUsd,
      latencyMs: 0, fallback: true, fallbackReason: "budget_hard_limit",
    });
    return det;
  }

  let attempt = await attemptOnce({ world, agent, view, candidates });
  let usedRetry = false;
  if (!attempt.ok && (TRANSIENT_ERRORS.has(attempt.res.errorType) || attempt.res.errorType === "invalid_json" || attempt.res.errorType === "invalid_action")) {
    usedRetry = true;
    attempt = await attemptOnce({ world, agent, view, candidates });
  }

  if (!attempt.ok) {
    if (attempt.res.errorType === "auth_error") authBroken = true;
    budget.recordAttempt({ tick: world.time.tick, fallback: true });
    appendLlmDecision({
      ...logBase,
      selectedAction: det.action.type,
      arguments: det.action.data || {},
      reason: null,
      inputTokens: 0, outputTokens: 0, cachedTokens: 0,
      estimatedCost: 0, cumulativeCost: budget.getSummary().cumulativeCostUsd,
      latencyMs: attempt.res.latencyMs || 0,
      fallback: true, fallbackReason: `${attempt.res.errorType}${usedRetry ? "_after_retry" : ""}`,
    });
    return det;
  }

  const cost = budget.recordAttempt({ tick: world.time.tick, usage: attempt.res.usage, fallback: false });
  const usage = attempt.res.usage || {};
  appendLlmDecision({
    ...logBase,
    selectedAction: attempt.choice.type,
    arguments: attempt.choice.data || {},
    reason: attempt.reason,
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.prompt_cache_hit_tokens ?? null,
    estimatedCost: cost,
    cumulativeCost: budget.getSummary().cumulativeCostUsd,
    latencyMs: attempt.res.latencyMs,
    fallback: false, fallbackReason: null,
  });

  const rationale = {
    goal: agent.goals[0]?.goal,
    situation: det.rationale.situation,
    relevantKnowledge: det.rationale.relevantKnowledge,
    availableActions: candidates.slice(0, 6).map((c) => ({ type: c.type, target: null, score: null })),
    selectedAction: attempt.choice.type,
    target: actionTarget(attempt.choice),
    reasons: [attempt.reason],
    expectedOutcome: expectedOutcome(attempt.choice.type),
    source: "llm",
  };
  // Step 15 rev. 4, Fase A: la observacion describe las candidatas que puntuo la politica determinista
  return { action: attempt.choice, rationale, observation: det.observation };
}

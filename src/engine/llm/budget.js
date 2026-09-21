// Presupuesto experimental para llamadas a DeepSeek (Experimento V3-LLM,
// seccion 12 del encargo). El HARD LIMIT se hace cumplir en codigo, no
// depende de que el modelo "se porte bien" ni de que el prompt lo respete.
//
// Estrategia de dos pasos, no solo "revisar despues de llamar":
//   1) ANTES de llamar: se estima el costo del PEOR CASO posible de esa
//      llamada (tarifa de hora pico, prompt entero como cache-miss) y se
//      rechaza la llamada si sumarlo al acumulado (mas un margen de
//      seguridad) superaria el HARD_LIMIT. Esto es lo que evita "una
//      llamada cuyo costo todavia no fue contabilizado" empuje el gasto
//      por encima del limite.
//   2) DESPUES de llamar: se usa el "usage" REAL que devuelve la API
//      (tokens de entrada/salida/cache) para registrar el costo exacto en
//      el acumulado, reemplazando la estimacion.
//
// El estado se persiste en disco (data_runtime/llm_budget.json) porque la
// simulacion se corre en multiples invocaciones de `npm run sim` que
// retoman el estado guardado — el presupuesto debe sobrevivir entre ellas
// igual que el estado del mundo.

import { loadLlmBudget, saveLlmBudget } from "../store.js";

export const SOFT_LIMIT_USD = 0.5;
export const HARD_LIMIT_USD = 1.0;
const SAFETY_MARGIN_USD = 0.02; // colchon para no cruzar el hard limit por una llamada aun no contabilizada

// Tarifas oficiales de DeepSeek para el modelo deepseek-flash, USD por 1M
// de tokens (fuente: api-docs.deepseek.com/quick_start/pricing). Hora pico:
// 01:00-04:00 y 06:00-10:00 UTC, lunes a viernes; el resto es tarifa fuera
// de pico (mitad de precio). No se modela el calendario de feriados chinos
// (fuera de alcance de este experimento, documentado en el reporte).
const PRICING = {
  peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
  offpeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
};

export function isPeakHoursUtc(now = new Date()) {
  const day = now.getUTCDay(); // 0=domingo .. 6=sabado
  if (day === 0 || day === 6) return false;
  const hour = now.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

function pricingNow(now = new Date()) {
  return isPeakHoursUtc(now) ? PRICING.peak : PRICING.offpeak;
}

// Costo real a partir del "usage" que devuelve la API.
export function computeCostUsd(usage, now = new Date()) {
  if (!usage) return 0;
  const p = pricingNow(now);
  const cacheHit = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.prompt_cache_hit_tokens ?? 0;
  const promptTotal = usage.prompt_tokens ?? 0;
  const cacheMiss = usage.prompt_tokens_details?.prompt_cache_miss_tokens ?? Math.max(0, promptTotal - cacheHit);
  const completion = usage.completion_tokens ?? 0;
  return (cacheHit / 1e6) * p.cacheHit + (cacheMiss / 1e6) * p.cacheMiss + (completion / 1e6) * p.output;
}

// Estimacion PESIMISTA (peor caso) para el chequeo previo a la llamada:
// todo el prompt como cache-miss, a tarifa de hora pico, usando el limite
// maximo de tokens de salida que se le pide al modelo.
export function estimateWorstCaseCostUsd(promptCharLength, maxOutputTokens) {
  const estimatedPromptTokens = Math.ceil(promptCharLength / 3.2); // estimacion conservadora (sobreestima tokens reales)
  return (estimatedPromptTokens / 1e6) * PRICING.peak.cacheMiss + (maxOutputTokens / 1e6) * PRICING.peak.output;
}

let state = null;

function defaultState() {
  return {
    cumulativeCostUsd: 0,
    totalCalls: 0,
    successfulCalls: 0,
    fallbackCalls: 0,
    softLimitCrossedAtTick: null,
    hardLimitReachedAtTick: null,
    lastUpdatedTick: null,
  };
}

export function load() {
  state = loadLlmBudget() || defaultState();
  return state;
}

function ensureLoaded() {
  if (!state) load();
  return state;
}

export function save() {
  if (!state) return;
  saveLlmBudget(state);
}

// true si HAY margen para intentar la llamada (peor caso incluido). No
// consume presupuesto por si mismo: solo lo consulta.
export function canAttemptCall(promptCharLength, maxOutputTokens) {
  const s = ensureLoaded();
  const worstCase = estimateWorstCaseCostUsd(promptCharLength, maxOutputTokens);
  return s.cumulativeCostUsd + worstCase + SAFETY_MARGIN_USD <= HARD_LIMIT_USD;
}

export function recordAttempt({ tick, usage, fallback, now = new Date() }) {
  const s = ensureLoaded();
  s.totalCalls += 1;
  s.lastUpdatedTick = tick;
  if (fallback) {
    s.fallbackCalls += 1;
  } else {
    s.successfulCalls += 1;
    const cost = computeCostUsd(usage, now);
    const wasBelowSoft = s.cumulativeCostUsd < SOFT_LIMIT_USD;
    s.cumulativeCostUsd += cost;
    if (wasBelowSoft && s.cumulativeCostUsd >= SOFT_LIMIT_USD && s.softLimitCrossedAtTick == null) {
      s.softLimitCrossedAtTick = tick;
    }
    if (s.cumulativeCostUsd >= HARD_LIMIT_USD && s.hardLimitReachedAtTick == null) {
      s.hardLimitReachedAtTick = tick;
    }
    return cost;
  }
  return 0;
}

export function getSummary() {
  const s = ensureLoaded();
  return { ...s };
}

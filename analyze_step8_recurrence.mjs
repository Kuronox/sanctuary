// STEP 8 — ¿La mortalidad compone? Análisis de recurrencia por permutación.
//
// Lee los 5 estados finales (data_runtime_step8_{a..e}/state.json), y para
// cada seed corre un null model de permutación (ver docs/REPORT_STEP8_RECURRENCIA.md
// para la justificación completa del diseño): se fija la lista real de
// (tick, cause) de deathHistory de esa seed, y se reasigna al azar QUE agente
// recibe cada evento, procesando en orden cronológico y respetando el techo
// de 3 asignaciones por agente (elegibilidad temporal — nunca una "4ta
// muerte" ni dos eventos al mismo agente en el mismo tick).
//
// Solo lee data_runtime_step8_*/state.json. No modifica nada. No es parte
// del motor (src/engine/) — es una herramienta de análisis externa, igual
// que score_sim.mjs / analyze_work.mjs ya existentes en el repo.

import fs from "node:fs";
import { makeRng } from "./src/engine/rng.js";

const SEEDS = ["a", "b", "c", "d", "e"];
const REPLICATES = 10000;
const ANALYSIS_RNG_SEED = 1337; // seed fijo de la propia herramienta de analisis, no de la simulacion

function loadSeed(label) {
  const path = `data_runtime_step8_${label}/state.json`;
  const s = JSON.parse(fs.readFileSync(path, "utf-8"));
  const agents = Object.values(s.agents);
  const events = [];
  for (const a of agents) {
    for (const d of a.deathHistory || []) events.push({ agentId: a.id, tick: d.tick, cause: d.cause });
  }
  events.sort((x, y) => x.tick - y.tick);
  const agentIds = agents.map((a) => a.id);
  const weights = {};
  for (const a of agents) weights[a.id] = 0.05 + (a.personality.riskTolerance || 0) + (a.personality.greed || 0);
  return { label, seedNumber: s.seedNumber, events, agentIds, weights };
}

function weightedPick(pool, weights, rng) {
  const total = pool.reduce((sum, id) => sum + weights[id], 0);
  let r = rng() * total;
  for (const id of pool) {
    r -= weights[id];
    if (r <= 0) return id;
  }
  return pool[pool.length - 1];
}

// Una replica: reasigna cada evento (en orden cronologico) a un agente
// elegible del pool (quien ya acumulo 3 asignaciones en ESTA replica queda
// afuera, igual que el techo real de lives). Devuelve conteos de recurrencia
// y los deltas de tick entre asignaciones consecutivas al mismo agente.
function oneReplica(events, agentIds, weights, weighted, rng) {
  const assignedCount = new Map();
  const lastTick = new Map();
  const deltas = [];
  let i = 0;
  while (i < events.length) {
    let j = i;
    while (j < events.length && events[j].tick === events[i].tick) j++;
    let pool = agentIds.filter((id) => (assignedCount.get(id) || 0) < 3);
    for (let k = i; k < j; k++) {
      if (pool.length === 0) break; // no deberia pasar con 70 agentes y <=43 eventos
      const idx = weighted
        ? pool.indexOf(weightedPick(pool, weights, rng))
        : Math.floor(rng() * pool.length);
      const chosen = pool[idx];
      pool.splice(idx, 1);
      const prev = assignedCount.get(chosen) || 0;
      assignedCount.set(chosen, prev + 1);
      if (prev >= 1) deltas.push(events[k].tick - lastTick.get(chosen));
      lastTick.set(chosen, events[k].tick);
    }
    i = j;
  }
  const counts = [...assignedCount.values()];
  return {
    countGE2: counts.filter((c) => c >= 2).length,
    countGE3: counts.filter((c) => c >= 3).length,
    deltas,
  };
}

function permutationNull(events, agentIds, weights, weighted, replicates, rng) {
  const countGE2s = [];
  const countGE3s = [];
  const allDeltas = [];
  for (let r = 0; r < replicates; r++) {
    const rep = oneReplica(events, agentIds, weights, weighted, rng);
    countGE2s.push(rep.countGE2);
    countGE3s.push(rep.countGE3);
    for (const d of rep.deltas) allDeltas.push(d);
  }
  return { countGE2s, countGE3s, allDeltas };
}

function percentileOf(value, sortedArr) {
  // fraccion de la distribucion nula <= value
  let lo = 0, hi = sortedArr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedArr[mid] <= value) lo = mid + 1; else hi = mid;
  }
  return (lo / sortedArr.length) * 100;
}

function observedStats(events) {
  const byAgent = new Map();
  for (const e of events) {
    if (!byAgent.has(e.agentId)) byAgent.set(e.agentId, []);
    byAgent.get(e.agentId).push(e.tick);
  }
  let ge2 = 0, ge3 = 0;
  const deltas = [];
  for (const ticks of byAgent.values()) {
    ticks.sort((a, b) => a - b);
    if (ticks.length >= 2) ge2++;
    if (ticks.length >= 3) ge3++;
    for (let i = 1; i < ticks.length; i++) deltas.push(ticks[i] - ticks[i - 1]);
  }
  return { ge2, ge3, deltas, agentsWithDeaths: byAgent.size };
}

function summarizeDeltas(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { n: sorted.length, min: sorted[0], p25: p(0.25), median: p(0.5), p75: p(0.75), max: sorted[sorted.length - 1] };
}

// ---------------------------------------------------------------------------

const rng = makeRng(ANALYSIS_RNG_SEED);
const seeds = SEEDS.map(loadSeed);

console.log("=== STEP 8: recurrencia de muerte, 5 seeds, 600 dias c/u ===\n");

const causeViews = ["all", "hambre", "combate"];
const report = { perSeed: [], aggregate: {} };

for (const seed of seeds) {
  console.log(`--- seed ${seed.label} (seedNumber=${seed.seedNumber}) ---`);
  const seedReport = { label: seed.label, seedNumber: seed.seedNumber, views: {} };
  for (const cause of causeViews) {
    const events = cause === "all" ? seed.events : seed.events.filter((e) => e.cause === cause);
    if (events.length === 0) { console.log(`  [${cause}] sin eventos`); continue; }
    const obs = observedStats(events);
    const nullUniform = permutationNull(events, seed.agentIds, seed.weights, false, REPLICATES, rng);
    const nullWeighted = permutationNull(events, seed.agentIds, seed.weights, true, REPLICATES, rng);
    const sortedGE2Uniform = [...nullUniform.countGE2s].sort((a, b) => a - b);
    const sortedGE2Weighted = [...nullWeighted.countGE2s].sort((a, b) => a - b);
    const pctUniform = percentileOf(obs.ge2, sortedGE2Uniform);
    const pctWeighted = percentileOf(obs.ge2, sortedGE2Weighted);
    const nullDeltaSummaryUniform = summarizeDeltas(nullUniform.allDeltas);
    const obsDeltaSummary = summarizeDeltas(obs.deltas);
    console.log(`  [${cause}] eventos=${events.length} agentesConMuerte=${obs.agentsWithDeaths} obs>=2=${obs.ge2} obs>=3=${obs.ge3}`);
    console.log(`    percentil obs>=2 en null uniforme: ${pctUniform.toFixed(1)} | en null ponderado: ${pctWeighted.toFixed(1)}`);
    console.log(`    delta-ticks observados:`, obsDeltaSummary);
    console.log(`    delta-ticks null (uniforme, pooled):`, nullDeltaSummaryUniform);
    let medianPct = null, eachPct = [];
    if (obsDeltaSummary && nullUniform.allDeltas.length) {
      const sortedNullDeltas = [...nullUniform.allDeltas].sort((a, b) => a - b);
      medianPct = percentileOf(obsDeltaSummary.median, sortedNullDeltas);
      eachPct = obs.deltas.map((d) => Math.round(percentileOf(d, sortedNullDeltas) * 10) / 10);
      console.log(`    percentil de la MEDIANA observada dentro de la nula (uniforme): ${medianPct.toFixed(1)}`);
      console.log(`    percentil de CADA delta observado dentro de la nula: [${eachPct.join(", ")}]`);
    }
    seedReport.views[cause] = { events: events.length, obs, pctUniform, pctWeighted, obsDeltaSummary, nullDeltaSummaryUniform, medianPct, eachPct };
  }
  report.perSeed.push(seedReport);
  console.log("");
}

// Consistencia entre seeds (criterio operativo aprobado: >=4/5, no umbral universal)
console.log("=== consistencia entre seeds (vista 'all', umbral operativo: percentil>=95 en AMBOS nulls) ===");
let consistentCount = 0;
for (const s of report.perSeed) {
  const v = s.views.all;
  if (!v) continue;
  const flagged = v.pctUniform >= 95 && v.pctWeighted >= 95;
  if (flagged) consistentCount++;
  console.log(`  seed ${s.label}: pctUniform=${v.pctUniform.toFixed(1)} pctWeighted=${v.pctWeighted.toFixed(1)} -> ${flagged ? "SEÑAL" : "sin señal"}`);
}
console.log(`  total con señal: ${consistentCount}/5`);

fs.writeFileSync("data_runtime_step8_analysis.json", JSON.stringify(report, null, 2), "utf-8");
console.log("\nReporte completo guardado en data_runtime_step8_analysis.json");

// Step 9.6 — Seguimiento de cadenas causales después de una decisión Tipo A
// Usa los datos existentes del Step 9.5 (no corre nuevas simulaciones).
// Ventana: 48 ticks post-divergencia por caso.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SEEDS = [
  { label: "a", dir: "data_runtime_step95_a" },
  { label: "b", dir: "data_runtime_step95_b" },
  { label: "c", dir: "data_runtime_step95_c" },
];
const WINDOW = 48;

async function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  const lines = [];
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }
  return lines;
}

function loadAgentPersonalities(stateFile) {
  if (!fs.existsSync(stateFile)) return {};
  const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
  const map = {};
  for (const [id, agent] of Object.entries(state.agents || {})) {
    map[id] = {
      riskTolerance: agent.personality?.riskTolerance ?? 0.5,
      name: agent.name || id,
    };
  }
  return map;
}

// Clasificar consecuencias a partir de eventos en la ventana
function classifyConsequences(events) {
  const types = new Set();
  for (const e of events) {
    const t = e.type;
    if (t === "travel_start" || t === "travel_end") types.add("location");
    else if (t === "work" || t === "trade_sell" || t === "trade_buy" || t === "gather" || t === "craft") types.add("economy");
    else if (t === "talk" || t === "help") types.add("relationship");
    else if (t === "combat_win" || t === "combat_loss" || t === "party_combat_win" || t === "party_combat_loss") types.add("combat");
    else if (t === "rebirth") types.add("death");
    else if (t === "eat" || t === "rest" || t === "rest_inn" || t === "heal") types.add("needs");
  }
  return types.size > 0 ? [...types] : ["none"];
}

// Determinar clasificación causal
// DIRECTAMENTE_ATRIBUIBLE: la acción real es travel y hay travel_start/end en ventana
//   OR la acción real produce un evento económico inmediato (work/trade)
// CONSISTENT_WITH: hay secuencia plausible pero no aislable
// NOT_DETERMINABLE: no hay eventos observables que conecten
function causality(tipoA, windowDecisions, windowEvents) {
  const realType = tipoA.cf.realWinner.type;
  const hasTravelEvent = windowEvents.some(e => e.type === "travel_start" || e.type === "travel_end");
  const hasEconomyEvent = windowEvents.some(e => ["work", "trade_sell", "trade_buy", "gather", "craft"].includes(e.type));
  const hasAnyEvent = windowEvents.length > 0;
  const hasCfInWindow = windowDecisions.some(d => d.cf && (d.cf.cfType === "A" || d.cf.cfType === "B"));

  // Directamente atribuible solo cuando la consecuencia es la acción elegida en sí misma
  if (realType === "travel" && hasTravelEvent) return "DIRECTAMENTE_ATRIBUIBLE";
  if ((realType === "work" || realType === "trade_sell" || realType === "trade_buy") && hasEconomyEvent) return "DIRECTAMENTE_ATRIBUIBLE";

  // Consistent: hay eventos o decisiones posteriores, cadena plausible
  if (hasCfInWindow || (hasAnyEvent && windowDecisions.length > 0)) return "CONSISTENT_WITH";

  // Sin datos suficientes
  if (!hasAnyEvent && windowDecisions.length === 0) return "NOT_DETERMINABLE";
  return "CONSISTENT_WITH";
}

// Chain depth: D0=divergencia, D1=primer evento, D2=primera decisión posterior
function chainDepth(windowDecisions, windowEvents) {
  if (windowDecisions.length === 0 && windowEvents.length === 0) return 0;
  if (windowDecisions.length === 0) return 1; // solo D1 (evento)
  // D2 existe si hay decisión posterior
  const cfInWindow = windowDecisions.some(d => d.cf && (d.cf.cfType === "A" || d.cf.cfType === "B"));
  return cfInWindow ? 3 : 2; // depth>=2 si hay decisión posterior; depth>=3 si esa decisión también activó penalty
}

async function analyzeSeed(label, dir) {
  const decisionsFile = path.resolve(__dirname, dir, "decisions.jsonl");
  const eventsFile = path.resolve(__dirname, dir, "events.jsonl");
  const stateFile = path.resolve(__dirname, dir, "state.json");

  const decLines = await readLines(decisionsFile);
  const evLines = await readLines(eventsFile);

  const allDecisions = decLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const allEvents = evLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const personalities = loadAgentPersonalities(stateFile);

  const tipoAList = allDecisions.filter(r => r.cf && r.cf.cfType === "A");

  // Índice: decisiones por agente y tick (para búsqueda eficiente)
  const decByAgent = {};
  for (const d of allDecisions) {
    if (!decByAgent[d.agentId]) decByAgent[d.agentId] = [];
    decByAgent[d.agentId].push(d);
  }
  // Índice: eventos por agente y tick
  const evByAgent = {};
  for (const e of allEvents) {
    const aid = e.actorId;
    if (aid) {
      if (!evByAgent[aid]) evByAgent[aid] = [];
      evByAgent[aid].push(e);
    }
  }

  const cases = [];

  for (const ta of tipoAList) {
    const { agentId, tick } = ta;
    const pers = personalities[agentId] || { riskTolerance: 0.5, name: agentId };

    // Ventana de decisiones: tick+1 hasta tick+48 (excluyendo el tick de divergencia)
    const windowDec = (decByAgent[agentId] || [])
      .filter(d => d.tick > tick && d.tick <= tick + WINDOW);
    // Ventana de eventos: tick hasta tick+48
    const windowEv = (evByAgent[agentId] || [])
      .filter(e => e.tick > tick && e.tick <= tick + WINDOW);

    const consequences = classifyConsequences(windowEv);
    const causal = causality(ta, windowDec, windowEv);
    const depth = chainDepth(windowDec, windowEv);

    // Fase de simulación
    const phase = tick < 2400 ? "early" : tick < 4800 ? "mid" : "late";

    // Margen: cfScore del cfWinner minus score del realWinner
    const margin = (ta.cf.cfWinner.cfScore || 0) - (ta.cf.realWinner.score || 0);

    cases.push({
      seed: label,
      agentId,
      agentName: pers.name,
      tick,
      phase,
      riskTolerance: pers.riskTolerance,
      realType: ta.cf.realWinner.type,
      realTo: ta.cf.realWinner.to || null,
      cfType: ta.cf.cfWinner.type,
      cfTo: ta.cf.cfWinner.to || null,
      penalty: +ta.cf.penaltyApplied.toFixed(4),
      realScore: ta.cf.realWinner.score,
      cfScore: ta.cf.cfWinner.cfScore,
      margin: +margin.toFixed(3),
      windowDecCount: windowDec.length,
      windowEvCount: windowEv.length,
      windowCfActivations: windowDec.filter(d => d.cf).length,
      consequences,
      causality: causal,
      chainDepth: depth,
    });
  }

  return { label, dir, tipoACount: tipoAList.length, cases };
}

function computeMetrics(cases) {
  const total = cases.length;
  if (total === 0) return null;

  // Immediate State Divergence: casos con consecuencias no "none"
  const withConsequence = cases.filter(c => !c.consequences.includes("none")).length;
  const stateDivRate = total > 0 ? withConsequence / total : 0;

  // Subsequent Decision Divergence
  const withDecisions = cases.filter(c => c.windowDecCount > 0).length;
  const withCfActivation = cases.filter(c => c.windowCfActivations > 0).length;
  const subDecRate = total > 0 ? withDecisions / total : 0;
  const subCfRate = total > 0 ? withCfActivation / total : 0;

  // Consequence type distribution
  const consTypes = {};
  for (const c of cases) {
    for (const t of c.consequences) consTypes[t] = (consTypes[t] || 0) + 1;
  }

  // Chain depth distribution
  const depthDist = { 0: 0, 1: 0, 2: 0, "3+": 0 };
  for (const c of cases) {
    if (c.chainDepth >= 3) depthDist["3+"]++;
    else depthDist[c.chainDepth]++;
  }

  // Causality distribution
  const causalDist = { DIRECTAMENTE_ATRIBUIBLE: 0, CONSISTENT_WITH: 0, NOT_DETERMINABLE: 0 };
  for (const c of cases) causalDist[c.causality]++;

  // By action type
  const byRealType = {};
  for (const c of cases) {
    if (!byRealType[c.realType]) byRealType[c.realType] = { count: 0, withConsequence: 0, direct: 0 };
    byRealType[c.realType].count++;
    if (!c.consequences.includes("none")) byRealType[c.realType].withConsequence++;
    if (c.causality === "DIRECTAMENTE_ATRIBUIBLE") byRealType[c.realType].direct++;
  }

  return {
    total, withConsequence, stateDivRate: +stateDivRate.toFixed(3),
    withDecisions, withCfActivation, subDecRate: +subDecRate.toFixed(3), subCfRate: +subCfRate.toFixed(3),
    consTypes, depthDist, causalDist, byRealType,
    chainGe2Count: cases.filter(c => c.chainDepth >= 2).length,
  };
}

// Seleccionar casos representativos para el reporte
function selectRepresentativeCases(allCases) {
  const selected = [];
  const seeds = [...new Set(allCases.map(c => c.seed))];

  // Al menos un caso de cada seed
  for (const seed of seeds) {
    const seedCases = allCases.filter(c => c.seed === seed);
    if (seedCases.length) selected.push(seedCases[0]);
  }

  // Al menos un DIRECTAMENTE_ATRIBUIBLE (travel)
  const direct = allCases.find(c => c.causality === "DIRECTAMENTE_ATRIBUIBLE" && !selected.includes(c));
  if (direct) selected.push(direct);

  // Al menos uno con chain depth >= 3
  const deepChain = allCases.find(c => c.chainDepth >= 3 && !selected.includes(c));
  if (deepChain) selected.push(deepChain);

  // Al menos uno NOT_DETERMINABLE
  const notDet = allCases.find(c => c.causality === "NOT_DETERMINABLE" && !selected.includes(c));
  if (notDet) selected.push(notDet);

  // Limitar a 8
  return selected.slice(0, 8);
}

async function main() {
  const allResults = [];
  for (const { label, dir } of SEEDS) {
    console.log(`\nAnalizando seed ${label}...`);
    const result = await analyzeSeed(label, dir);
    console.log(`  ${result.tipoACount} Tipo A encontrados`);
    allResults.push(result);
  }

  const allCases = allResults.flatMap(r => r.cases);
  const metrics = computeMetrics(allCases);
  const representativeCases = selectRepresentativeCases(allCases);

  console.log("\n=== MÉTRICAS STEP 9.6 ===");
  console.log(`Total Tipo A analizados: ${metrics.total}`);
  console.log(`Immediate State Divergence Rate: ${(metrics.stateDivRate * 100).toFixed(1)}% (${metrics.withConsequence}/${metrics.total})`);
  console.log(`Subsequent Decision Rate: ${(metrics.subDecRate * 100).toFixed(1)}% (agentes con ≥1 decisión en ventana)`);
  console.log(`Subsequent CF Activation Rate: ${(metrics.subCfRate * 100).toFixed(1)}% (agentes con ≥1 decisión con penalty en ventana)`);
  console.log(`Cadenas depth>=2: ${metrics.chainGe2Count}`);
  console.log("Causalidad:", JSON.stringify(metrics.causalDist));
  console.log("Consecuencias:", JSON.stringify(metrics.consTypes));
  console.log("Chain depth dist:", JSON.stringify(metrics.depthDist));

  const output = {
    generated: new Date().toISOString(),
    window: WINDOW,
    metrics,
    seeds: allResults.map(r => ({ label: r.label, tipoACount: r.tipoACount })),
    representativeCases,
    allCases,
  };

  const outFile = path.resolve(__dirname, "data_runtime_step96_analysis.json");
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nGuardado en ${outFile}`);
}

main().catch(console.error);

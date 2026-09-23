// Step 9.5 — Análisis contrafactual de decisiones
// Lee decisions.jsonl de las 3 seeds y calcula:
// - DDR: Decision Divergence Rate (Tipo A / total con cf)
// - CHR: Contrafactual Hit Rate (decisiones con cf / total)
// - Breakdown por tipo de acción real
// - Breakdown por riskTolerance del agente
// - Distribución del margen para Tipo A
// - Evolución temporal (early / mid / late)

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

async function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  const lines = [];
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }
  return lines;
}

function parseDecisions(lines) {
  const rows = [];
  for (const line of lines) {
    try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return rows;
}

// Leer state.json para obtener riskTolerance por agentId
function loadAgentPersonalities(stateFile) {
  if (!fs.existsSync(stateFile)) return {};
  const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
  const map = {};
  for (const [id, agent] of Object.entries(state.agents || {})) {
    map[id] = agent.personality?.riskTolerance ?? 0.5;
  }
  return map;
}

// Buckets de riskTolerance: bajo [0, 0.33), medio [0.33, 0.67), alto [0.67, 1]
function rtBucket(rt) {
  if (rt < 0.33) return "bajo";
  if (rt < 0.67) return "medio";
  return "alto";
}

function buildSeedStats(rows, personalities, maxTick) {
  let total = 0, withCf = 0, typeA = 0, typeB = 0;

  const byActionType = {}; // { [realWinnerType]: { cfCount, typeA } }
  const byRtBucket = { bajo: { cfCount: 0, typeA: 0 }, medio: { cfCount: 0, typeA: 0 }, alto: { cfCount: 0, typeA: 0 } };
  const marginsA = []; // cfScore - realScore del candidato contrafactual ganador para Tipo A
  const temporal = { early: { cfCount: 0, typeA: 0 }, mid: { cfCount: 0, typeA: 0 }, late: { cfCount: 0, typeA: 0 } };
  const agentDivergences = {}; // { agentId: typeA count }
  const cfWinnerLocs = {}; // { location: count } para Tipo A

  for (const row of rows) {
    total++;
    if (!row.cf) continue;
    withCf++;

    const isA = row.cf.cfType === "A";
    const isB = row.cf.cfType === "B";
    if (isA) typeA++;
    if (isB) typeB++;

    // Por tipo de acción real
    const rType = row.cf.realWinner?.type || row.selectedAction || "desconocido";
    if (!byActionType[rType]) byActionType[rType] = { cfCount: 0, typeA: 0 };
    byActionType[rType].cfCount++;
    if (isA) byActionType[rType].typeA++;

    // Por riskTolerance
    const rt = personalities[row.agentId] ?? 0.5;
    const bucket = rtBucket(rt);
    byRtBucket[bucket].cfCount++;
    if (isA) byRtBucket[bucket].typeA++;

    // Margen para Tipo A
    if (isA && row.cf.cfWinner && row.cf.realWinner) {
      const margin = row.cf.cfWinner.cfScore - row.cf.realWinner.score;
      marginsA.push(margin);
    }

    // Temporal (early: primeros 2400 ticks, mid: 2400-4800, late: 4800+)
    const tick = row.tick || 0;
    const phase = tick < 2400 ? "early" : tick < 4800 ? "mid" : "late";
    temporal[phase].cfCount++;
    if (isA) temporal[phase].typeA++;

    // Por agente
    const aid = row.agentId;
    if (!agentDivergences[aid]) agentDivergences[aid] = 0;
    if (isA) agentDivergences[aid]++;

    // Zonas cfWinner
    if (isA && row.cf.cfWinner?.to) {
      cfWinnerLocs[row.cf.cfWinner.to] = (cfWinnerLocs[row.cf.cfWinner.to] || 0) + 1;
    }
  }

  const ddr = withCf > 0 ? typeA / withCf : 0;
  const chr = total > 0 ? withCf / total : 0;

  // Top 5 agentes por divergencias
  const topAgents = Object.entries(agentDivergences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, typeA: count, rt: personalities[id] ?? "?" }));

  // Margen estadísticas
  let marginStats = null;
  if (marginsA.length) {
    const sorted = [...marginsA].sort((a, b) => a - b);
    const mean = marginsA.reduce((s, v) => s + v, 0) / marginsA.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    marginStats = { n: marginsA.length, mean: +mean.toFixed(3), median: +median.toFixed(3), p90: +p90.toFixed(3), min: +sorted[0].toFixed(3), max: +sorted[sorted.length - 1].toFixed(3) };
  }

  return {
    total, withCf, typeA, typeB, ddr: +ddr.toFixed(4), chr: +chr.toFixed(4),
    byActionType, byRtBucket, marginStats, temporal, topAgents,
    topCfWinnerLocs: Object.entries(cfWinnerLocs).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([loc, n]) => ({ loc, n })),
  };
}

async function main() {
  const results = {};

  for (const { label, dir } of SEEDS) {
    const decisionsFile = path.resolve(__dirname, dir, "decisions.jsonl");
    const stateFile = path.resolve(__dirname, dir, "state.json");

    console.log(`\nProcesando seed ${label} (${dir})...`);
    const lines = await readLines(decisionsFile);
    const rows = parseDecisions(lines);
    const personalities = loadAgentPersonalities(stateFile);
    const maxTick = rows.reduce((m, r) => Math.max(m, r.tick || 0), 0);

    console.log(`  ${rows.length} decisiones totales (maxTick=${maxTick})`);
    results[label] = buildSeedStats(rows, personalities, maxTick);

    const s = results[label];
    console.log(`  CHR=${(s.chr * 100).toFixed(2)}% (${s.withCf} con cf de ${s.total})`);
    console.log(`  DDR=${(s.ddr * 100).toFixed(2)}% (${s.typeA} TipoA + ${s.typeB} TipoB de ${s.withCf} con cf)`);
    console.log(`  byRtBucket: bajo=${s.byRtBucket.bajo.typeA}/${s.byRtBucket.bajo.cfCount} | medio=${s.byRtBucket.medio.typeA}/${s.byRtBucket.medio.cfCount} | alto=${s.byRtBucket.alto.typeA}/${s.byRtBucket.alto.cfCount}`);
    if (s.marginStats) {
      console.log(`  Margenes TipoA: n=${s.marginStats.n}, media=${s.marginStats.mean}, mediana=${s.marginStats.median}, p90=${s.marginStats.p90}`);
    }
    console.log(`  Temporal: early=${s.temporal.early.typeA}/${s.temporal.early.cfCount} | mid=${s.temporal.mid.typeA}/${s.temporal.mid.cfCount} | late=${s.temporal.late.typeA}/${s.temporal.late.cfCount}`);
  }

  // Resumen cruzado
  const allDDR = Object.values(results).map((r) => r.ddr);
  const allCHR = Object.values(results).map((r) => r.chr);
  const avgDDR = allDDR.reduce((s, v) => s + v, 0) / allDDR.length;
  const avgCHR = allCHR.reduce((s, v) => s + v, 0) / allCHR.length;

  console.log("\n=== RESUMEN CRUZADO ===");
  for (const [label, s] of Object.entries(results)) {
    console.log(`  Seed ${label}: CHR=${(s.chr * 100).toFixed(2)}%, DDR=${(s.ddr * 100).toFixed(2)}%, TipoA=${s.typeA}, TipoB=${s.typeB}`);
  }
  console.log(`  Promedio CHR=${(avgCHR * 100).toFixed(2)}%, DDR=${(avgDDR * 100).toFixed(2)}%`);

  // Selectividad por riskTolerance (esperado: bajo > alto para typeA/cfCount)
  console.log("\n=== SELECTIVIDAD POR RISKTOLERANCE (promedio entre seeds) ===");
  for (const bucket of ["bajo", "medio", "alto"]) {
    const rates = Object.values(results).map((s) => {
      const b = s.byRtBucket[bucket];
      return b.cfCount > 0 ? b.typeA / b.cfCount : 0;
    });
    const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
    console.log(`  rT=${bucket}: DDR promedio=${(avg * 100).toFixed(2)}%`);
  }

  const outFile = path.resolve(__dirname, "data_runtime_step95_analysis.json");
  fs.writeFileSync(outFile, JSON.stringify({ generated: new Date().toISOString(), avgDDR: +avgDDR.toFixed(4), avgCHR: +avgCHR.toFixed(4), seeds: results }, null, 2), "utf-8");
  console.log(`\nResumen guardado en ${outFile}`);
}

main().catch(console.error);

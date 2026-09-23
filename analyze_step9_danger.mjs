// Fase F — Análisis STEP 9: Percepción y Reacción a Eventos del Mundo
import fs from "node:fs";

const SEEDS = ["a", "b", "c"];

function loadJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf-8").trim().split("\n").filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

const results = {};

for (const seed of SEEDS) {
  const dir = `data_runtime_step9_${seed}`;
  const events = loadJsonl(`${dir}/events.jsonl`);
  const decisions = loadJsonl(`${dir}/decisions.jsonl`);
  const state = loadJson(`${dir}/state.json`);

  // Filtrar decisiones de agentes reales (excluir tests: agentes "t1_", "t2_", etc.)
  const realDecisions = decisions.filter(d => d.agentId && d.agentId.startsWith("agent_"));

  // 1) Eventos de peligro por localizacion
  const dangerEvents = events.filter(e => ["combat_loss", "permanent_death"].includes(e.type));
  const dangerByLocation = {};
  for (const e of dangerEvents) {
    dangerByLocation[e.location] = (dangerByLocation[e.location] || 0) + 1;
  }

  // 2) Decisiones donde la penalización disparó (dp > 0 en el log)
  const penaltyDecisions = realDecisions.filter(d =>
    Array.isArray(d.reasons) && d.reasons.some(r => r.includes("penalizacion por peligro"))
  );

  // 3) Separar: ¿penalty fue efectiva (bonus > 0) o solo cosmética (bonus = 0)?
  //    Si las únicas razones son "penalizacion..." y "disposicion general", bonus fue 0.
  const effectivePenalty = penaltyDecisions.filter(d => {
    const nonPenaltyReasons = d.reasons.filter(r => !r.includes("penalizacion") && r !== "disposicion general a viajar/explorar");
    return nonPenaltyReasons.length > 0;
  });
  const cosmeticPenalty = penaltyDecisions.filter(d => {
    const nonPenaltyReasons = d.reasons.filter(r => !r.includes("penalizacion") && r !== "disposicion general a viajar/explorar");
    return nonPenaltyReasons.length === 0;
  });

  // 4) Extraer porcentajes de penalización de las decisiones efectivas
  const penaltyPcts = penaltyDecisions.map(d => {
    const r = d.reasons.find(r => r.includes("penalizacion por peligro"));
    const m = r && r.match(/−(\d+)%/);
    return m ? parseInt(m[1]) : 0;
  }).filter(p => p > 0);

  const maxPct = Math.max(...penaltyPcts, 0);
  const avgPct = penaltyPcts.length ? (penaltyPcts.reduce((s, p) => s + p, 0) / penaltyPcts.length).toFixed(1) : 0;

  // 5) ¿Algún agente con penalización tuvo una decisión de viaje DIFERENTE al destino peligroso?
  //    → Buscar casos donde el agente decidió NO viajar al sitio peligroso.
  //    Esto requiere inferir: buscar agentes que tienen danger knowledge pero eligieron otra acción
  //    siendo que tenían travel disponible. Difícil sin el counterfactual.
  //    Aproximación: mirar si algún agente con knowledge de peligro eligió rest/work en vez de travel.
  const dangerZones = new Set(Object.keys(dangerByLocation).filter(l => dangerByLocation[l] >= 5));

  // 6) Distribución de zonas al final (H1 criterio C — ninguna zona cae a 0)
  const finalAgents = state ? Object.values(state.agents).filter(a => a.alive) : [];
  const byLocation = {};
  for (const a of finalAgents) {
    byLocation[a.location] = (byLocation[a.location] || 0) + 1;
  }

  // 7) riskTolerance diferenciación: de los agentes con penalty, ¿los de alta rT tienen menor penalización?
  //    Necesito el state para riskTolerance de cada agente
  const agentRtMap = {};
  if (state) {
    for (const [id, a] of Object.entries(state.agents)) {
      agentRtMap[id] = a.personality.riskTolerance;
    }
  }

  const penaltyByRt = effectivePenalty.map(d => ({
    agentId: d.agentId,
    rT: agentRtMap[d.agentId] ?? null,
    pct: (() => { const r = d.reasons.find(r => r.includes("penalizacion por peligro")); const m = r && r.match(/−(\d+)%/); return m ? parseInt(m[1]) : 0; })(),
  })).filter(x => x.rT !== null && x.pct > 0);

  // Agrupar por rT alto (>=0.6) vs bajo (<0.4)
  const highRt = penaltyByRt.filter(x => x.rT >= 0.6);
  const lowRt = penaltyByRt.filter(x => x.rT < 0.4);
  const avgHighRt = highRt.length ? (highRt.reduce((s, x) => s + x.pct, 0) / highRt.length).toFixed(1) : "n/a";
  const avgLowRt = lowRt.length ? (lowRt.reduce((s, x) => s + x.pct, 0) / lowRt.length).toFixed(1) : "n/a";

  // 8) Cadena causal: encontrar UN ejemplo trazable (muerte → knowledge → decisión penalizada)
  const causalExample = effectivePenalty.length > 0 ? effectivePenalty.slice(0, 3) : [];

  results[seed] = {
    dangerByLocation,
    dangerZones: [...dangerZones],
    penaltyDecisionsTotal: penaltyDecisions.length,
    effectivePenaltyCount: effectivePenalty.length,
    cosmeticPenaltyCount: cosmeticPenalty.length,
    maxPct, avgPct,
    finalByLocation: byLocation,
    finalAlive: finalAgents.length,
    finalPermanentDeaths: state?.stats?.permanentDeaths ?? 0,
    highRtN: highRt.length, avgHighRt,
    lowRtN: lowRt.length, avgLowRt,
    causalSamples: causalExample.map(d => ({
      agentId: d.agentId,
      tick: d.tick,
      reasons: d.reasons,
      rT: agentRtMap[d.agentId]?.toFixed(2),
    })),
  };
}

// Imprimir resumen estructurado
for (const [seed, r] of Object.entries(results)) {
  console.log(`\n=== SEED ${seed} ===`);
  console.log(`Eventos de peligro (combat_loss + permanent_death):`);
  Object.entries(r.dangerByLocation).sort((a, b) => b[1] - a[1]).forEach(([loc, n]) => console.log(`  ${loc}: ${n}`));
  console.log(`Zonas de peligro activas (≥5 eventos): [${r.dangerZones.join(", ")}]`);
  console.log(`\nDecisiones con penalty en log: ${r.penaltyDecisionsTotal}`);
  console.log(`  Efectivas (bonus > 0): ${r.effectivePenaltyCount}`);
  console.log(`  Cosméticas (bonus = 0): ${r.cosmeticPenaltyCount}`);
  console.log(`  Rango penalización: max=${r.maxPct}%, avg=${r.avgPct}%`);
  console.log(`\nDiferenciación por riskTolerance (efectivas):`);
  console.log(`  Alta rT (≥0.6): n=${r.highRtN}, avg_pct=${r.avgHighRt}%`);
  console.log(`  Baja rT (<0.4): n=${r.lowRtN}, avg_pct=${r.avgLowRt}%`);
  console.log(`\nDistribución final de agentes: ${r.finalAlive} vivos`);
  Object.entries(r.finalByLocation).sort((a, b) => b[1] - a[1]).forEach(([loc, n]) => console.log(`  ${loc}: ${n}`));
  console.log(`Muertes permanentes: ${r.finalPermanentDeaths}`);
  if (r.causalSamples.length > 0) {
    console.log(`\nEjemplos de cadena causal (efectivos):`);
    r.causalSamples.forEach(s => {
      console.log(`  Agent ${s.agentId} (rT=${s.rT}) tick ${s.tick}:`);
      s.reasons.forEach(r => console.log(`    - ${r}`));
    });
  }
}

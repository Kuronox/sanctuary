import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorld, hydrateWorld, serializeWorld, tick, attachEventSink } from "../engine/world.js";
import { createAgent, generateAgentName, generateGoals } from "../engine/entities.js";
import { seedFromString, randInt, pick } from "../engine/rng.js";
import { loadState, saveState, stateExists, ensureRuntimeDir, RUNTIME_DIR } from "../engine/store.js";
import * as prog from "../engine/progression.js";
import { selectLlmCohort } from "../engine/llm/cohort.js";
import * as llmBudget from "../engine/llm/budget.js";
import { hasApiKey } from "../engine/llm/deepseekClient.js";

const SEED_LABEL = "sanctuary-v2";
const LLM_COHORT_SIZE = 5;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../data/world_seed.json"), "utf-8"));

const AGENT_COUNT = 70;
const SEED = seedFromString("sanctuary-v2");

function buildInitialWorld() {
  const world = createWorld(worldSeed, SEED);
  const used = new Set();
  const tier1Jobs = worldSeed.jobs.filter((j) => j.tier === 1);
  const locs = worldSeed.locations.filter((l) => l.governance !== "ninguna");

  for (let i = 0; i < AGENT_COUNT; i++) {
    const flavorBiasDef = pick(world.rng, tier1Jobs); // solo colorea la personalidad; la clase real es "novato"
    const home = locs[randInt(world.rng, 0, locs.length - 1)].id;
    const name = generateAgentName(world.rng, used);
    const id = `agent_${i + 1}`;
    const agent = createAgent({ id, name, flavorBiasDef, homeLocation: home, rng: world.rng });
    agent.stats.maxHealth = prog.maxHealthFor(agent);
    agent.stats.health = agent.stats.maxHealth;
    world.agents[id] = agent;
  }

  // Sujeto de control deliberado (seccion 12 del encargo V2): en vez de
  // esperar a que la cola de la distribucion aleatoria produzca a alguien
  // con perfil criminal, sembramos a UN agente con rasgos extremos a
  // proposito (codicia, ambicion y tolerancia al riesgo altas; empatia y
  // lealtad bajas) para poder observar que hace el mundo con el, sin
  // programar "evil = true" en ningun sitio: sigue pasando por la misma
  // funcion de utilidad que todos los demas.
  const control = world.agents["agent_1"];
  control.personality = { ambition: 0.88, sociability: 0.4, riskTolerance: 0.85, greed: 0.92, loyalty: 0.12, empathy: 0.08 };
  control.goals = generateGoals(world.rng, control.personality);
  control.name = `${control.name} (sujeto de control)`;

  // Experimento V3-LLM: seleccion reproducible de la cohorte de 5 agentes
  // que usaran la politica LLM (Ulra incluida por diseño del experimento,
  // ver seccion 4 del encargo). Se ejecuta UNA sola vez, aqui, al crear el
  // mundo por primera vez — nunca al hidratar un estado ya guardado, para
  // que la asignacion de politica sea estable durante toda la corrida.
  const cohort = selectLlmCohort(world, { seedLabel: SEED_LABEL, count: LLM_COHORT_SIZE, mandatoryId: "agent_1" });
  for (const entry of cohort) {
    world.agents[entry.id].policy = "llm";
  }
  console.log(`Cohorte LLM (${cohort.length} agentes, seed=${SEED_LABEL}:llm-cohort): ${cohort.map((c) => `${c.name} [${c.homeLocation}, rasgo dominante: ${c.dominantTrait}]`).join(" · ")}`);
  fs.writeFileSync(path.join(RUNTIME_DIR, "llm_cohort.json"), JSON.stringify(cohort, null, 2), "utf-8");
  return world;
}

function summarize(world) {
  const agents = Object.values(world.agents);
  const alive = agents.filter((a) => a.alive);
  const byLocation = {};
  const byClass = {};
  for (const a of alive) {
    byLocation[a.location] = (byLocation[a.location] || 0) + 1;
    byClass[a.class] = (byClass[a.class] || 0) + 1;
  }
  const totalGold = alive.reduce((s, a) => s + a.gold, 0);
  const guilds = Object.values(world.guilds).filter((g) => !g.disbanded);
  const imprisoned = alive.filter((a) => a.prison).length;

  console.log(`\n=== Dia ${world.time.day}, hora ${world.time.hour} (tick ${world.time.tick}) ===`);
  const goldArr = alive.map((a) => a.gold).sort((a, b) => a - b);
  const mediana = goldArr[Math.floor(goldArr.length / 2)] ?? 0;
  const goldMax = goldArr[goldArr.length - 1] ?? 0;
  const zeroGold = goldArr.filter((g) => g === 0).length;
  const maint = world.stats?.equipmentMaintenancePaid ?? 0;
  const maintPay = world.stats?.equipmentMaintenancePayments ?? 0;
  console.log(`Agentes vivos: ${alive.length}/${agents.length} | Oro total: ${Math.round(totalGold)} | mediana: ${Math.round(mediana)} | max: ${Math.round(goldMax)} | gold=0: ${zeroGold} | En carcel: ${imprisoned}`);
  if (maint > 0) console.log(`Sink equipamiento: ${Math.round(maint)} oro drenado en ${maintPay} pagos (${(maint / maintPay).toFixed(1)} oro/pago avg)`);
  console.log(`Gremios activos: ${guilds.length}${guilds.length ? " -> " + guilds.map((g) => `${g.name}(${g.members.length},tesoro ${Math.round(g.treasury)})`).join(", ") : ""}`);
  console.log("Distribucion por localizacion:", byLocation);
  console.log("Distribucion por clase:", byClass);
  console.log("Nivel base promedio:", (alive.reduce((s, a) => s + a.progression.baseLevel, 0) / alive.length).toFixed(1));

  const relCounts = { amigo: 0, aliado: 0, conocido: 0, rival: 0, enemigo: 0 };
  for (const a of alive) {
    for (const rel of Object.values(a.relationships)) {
      if (rel.affinity >= 60) relCounts.amigo++;
      else if (rel.affinity >= 20) relCounts.aliado++;
      else if (rel.affinity > -20) relCounts.conocido++;
      else if (rel.affinity > -60) relCounts.rival++;
      else relCounts.enemigo++;
    }
  }
  console.log("Relaciones (conteo direccional):", relCounts);

  const llmAgents = alive.filter((a) => a.policy === "llm");
  if (llmAgents.length) {
    console.log(`Cohorte LLM (${llmAgents.length}): ${llmAgents.map((a) => `${a.name} (${a.class}, oro ${Math.round(a.gold)}, ${a.location})`).join(" · ")}`);
  }
}

async function main() {
  const ticksArg = Number(process.argv[2]) || 24 * 7;
  ensureRuntimeDir();

  if (!hasApiKey()) {
    console.error("DEEPSEEK_API_KEY is not configured — los agentes de la cohorte LLM usaran la politica determinista como fallback en toda esta corrida.");
  }
  llmBudget.load();

  let world;
  if (stateExists()) {
    console.log("Cargando estado existente...");
    world = hydrateWorld(loadState());
  } else {
    console.log(`Creando mundo nuevo con ${AGENT_COUNT} agentes novatos (seed=${SEED})...`);
    world = buildInitialWorld();
  }
  attachEventSink(world);

  console.log(`Avanzando ${ticksArg} ticks (horas de juego)...`);
  for (let i = 0; i < ticksArg; i++) {
    await tick(world);
    if (world.time.tick % 240 === 0) {
      saveState(serializeWorld(world));
      llmBudget.save();
    }
  }
  saveState(serializeWorld(world));
  llmBudget.save();

  summarize(world);
  const budgetSummary = llmBudget.getSummary();
  console.log(`\nPresupuesto LLM: $${budgetSummary.cumulativeCostUsd.toFixed(4)} acumulado (${budgetSummary.successfulCalls} llamadas ok, ${budgetSummary.fallbackCalls} fallback de ${budgetSummary.totalCalls} intentos totales).`);
  console.log(`\nEstado guardado en data_runtime/state.json. Eventos en data_runtime/events.jsonl.`);
}

main();

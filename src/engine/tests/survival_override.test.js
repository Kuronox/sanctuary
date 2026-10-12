// Test: Step 11 — Comer antes que huir, y recuperarse en ciudad segura
// S1. hambre critica + salud baja + comida local -> come, no viaja
// S2. salud baja sin hambre en ciudad segura -> descansa, no viaja
// S3. salud baja en ciudad peligrosa -> sigue huyendo a la vecina mas segura
// S4. hambre critica sin comida local -> sigue viajando a buscarla
// S5. salud baja sin hambre y sin comida local en ciudad segura -> descansa (antes viajaba)
// S6. agente sano -> no hay accion forzada

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8"));

import { createWorld, tick } from "../world.js";
import { createAgent } from "../entities.js";
import { makeRng } from "../rng.js";

// El mercado repone ~0.65 de comida al inicio de cada tick; un stock negativo
// es la forma de que este mundo de un solo agente siga sin comida al decidir.
const NO_FOOD = -5;

async function forcedAction({ location, health, hunger, foodStock }) {
  const world = createWorld(worldSeed, 7);
  const agent = createAgent({ id: "s_1", name: "Agente_s1", flavorBiasDef: null, homeLocation: location, rng: makeRng(42) });
  agent.gold = 50;
  agent.stats.health = health;
  agent.needs.hunger = hunger;
  agent.needs.fatigue = 0.1;
  world.agents[agent.id] = agent;
  if (foodStock != null) world.markets[location].stock.racion_comida = foodStock;
  await tick(world);
  const d = agent.recentDecisions.at(-1);
  return { forced: d.situation === "necesidad critica", action: d.selectedAction, agent };
}

const s1 = await forcedAction({ location: "aldea_tejo", health: 10, hunger: 0.95, foodStock: 20 });
assert.equal(s1.action, "eat");
assert.equal(s1.agent.status, "idle");
assert.ok(s1.agent.needs.hunger < 0.6);
console.log("S1 PASS: hambre critica + salud baja + comida local -> come y se queda");

const s2 = await forcedAction({ location: "aldea_tejo", health: 10, hunger: 0.3, foodStock: 20 });
assert.equal(s2.action, "rest");
assert.ok(s2.agent.stats.health > 10);
console.log(`S2 PASS: debil sin hambre en ciudad segura -> descansa (salud 10 -> ${s2.agent.stats.health})`);

const s3 = await forcedAction({ location: "cruce_fangoso", health: 10, hunger: 0.3, foodStock: 20 });
assert.equal(s3.action, "travel");
console.log("S3 PASS: debil en ciudad peligrosa -> sigue huyendo");

const s4 = await forcedAction({ location: "valdemarca", health: 60, hunger: 0.95, foodStock: NO_FOOD });
assert.equal(s4.action, "travel");
console.log("S4 PASS: hambre critica sin comida local -> viaja a buscarla");

const s5 = await forcedAction({ location: "valdemarca", health: 10, hunger: 0.3, foodStock: NO_FOOD });
assert.equal(s5.action, "rest");
console.log("S5 PASS: debil sin hambre y sin comida local en ciudad segura -> descansa");

const s6 = await forcedAction({ location: "aldea_tejo", health: 60, hunger: 0.3, foodStock: 20 });
assert.equal(s6.forced, false);
console.log(`S6 PASS: agente sano -> decide normalmente (${s6.action})`);

console.log("✓ Todos los tests de survival override (Step 11) PASSED");

// Test: Step 3 Balance — Equipment Maintenance (gold sink)
// Verifica que:
//   T1. el coste se aplica en el tick correcto (multiplo de 24)
//   T2. el coste NO se aplica en ticks intermedios
//   T3. un agente sin equipo no paga
//   T4. un agente con equipo paga 1 gold por slot equipado
//   T5. el gold nunca se vuelve negativo
//   T6. el agente sigue funcionando despues del coste
//   T7. equipment y durability siguen funcionando
//   T8. Step 1 (embezzlement friction) sigue funcionando
//   T9. Step 2 (craft scoring) sigue funcionando

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8"));

import { createWorld } from "../world.js";
import { createAgent } from "../entities.js";
import { execute } from "../actions.js";
import { decide } from "../decision.js";
import { makeRng } from "../rng.js";
import * as economy from "../economy.js";

// ---- helpers ----------------------------------------------------------------

function makeAgent(id, location, overrides = {}) {
  const rng = makeRng(42 + id.charCodeAt(id.length - 1));
  const agent = createAgent({
    id,
    name: `Agente_${id}`,
    flavorBiasDef: worldSeed.jobs.find((j) => j.id === "herrero"),
    homeLocation: location,
    rng,
  });
  agent.location = location;
  agent.gold = 50;
  agent.status = "idle";
  agent.class = "herrero";
  Object.assign(agent, overrides);
  return agent;
}

function makeWorld(seed = 99) {
  const world = createWorld(worldSeed, seed);
  // Tick 23: el siguiente tick (24) debe disparar el mantenimiento
  world.time = { tick: 23, day: 2, hour: 23 };
  return world;
}

// Avanza exactamente N ticks llamando tick() sinteticamente
// (sin usar el loop completo de run.js — evita side-effects de economia/gremios)
async function advanceTicks(world, n) {
  const { tick } = await import("../world.js");
  for (let i = 0; i < n; i++) await tick(world);
}

// ---- T1: coste se aplica en tick multiplo de 24 ----------------------------

{
  const world = makeWorld(1);
  // world.time.tick = 23 → el proximo tick sera 24
  const agent = makeAgent("maint_a", "valdemarca");
  agent.gold = 30;
  agent.equipment.weapon = { itemId: "arma_hierro", durability: 80 };
  world.agents[agent.id] = agent;

  const goldBefore = agent.gold;
  await advanceTicks(world, 1); // tick 24 — debe cobrar
  const paid = goldBefore - agent.gold;
  assert.ok(paid > 0, `T1 FAIL: no se cobro mantenimiento en tick 24 (gold antes=${goldBefore}, despues=${agent.gold})`);
  assert.equal(paid, 1, `T1 FAIL: coste incorrecto — esperado 1 (1 slot), obtenido ${paid}`);
  assert.ok(world.stats.equipmentMaintenancePaid > 0, "T1 FAIL: stats.equipmentMaintenancePaid no se incremento");
  console.log(`T1 PASS: mantenimiento cobrado en tick 24 — gold ${goldBefore} -> ${agent.gold} (paid=${paid})`);
}

// ---- T2: coste NO se aplica en ticks intermedios ----------------------------

{
  const world = makeWorld(2);
  world.time = { tick: 10, day: 1, hour: 10 }; // tick 11-23 no son multiplos de 24
  const agent = makeAgent("maint_b", "valdemarca");
  agent.gold = 30;
  agent.equipment.weapon = { itemId: "arma_hierro", durability: 80 };
  world.agents[agent.id] = agent;

  await advanceTicks(world, 5); // ticks 11-15, ninguno multiplo de 24
  // El gold puede cambiar por otras acciones (comida, posada, etc.) — lo que verificamos
  // es que el sink de mantenimiento especificamente NO se disparo en estos ticks.
  assert.equal(world.stats.equipmentMaintenancePaid, 0, `T2 FAIL: stats.equipmentMaintenancePaid incrementado en ticks no-multiplos`);
  assert.equal(world.stats.equipmentMaintenancePayments, 0, "T2 FAIL: payments incrementado en ticks no-multiplos");
  console.log(`T2 PASS: sink de mantenimiento no disparado en ticks 11-15 (stats.paid=${world.stats.equipmentMaintenancePaid})`);
}

// ---- T3: agente sin equipo no paga ------------------------------------------

{
  const world = makeWorld(3);
  const agent = makeAgent("maint_c", "valdemarca");
  agent.gold = 30;
  agent.equipment.weapon = null;
  agent.equipment.armor = null;
  agent.equipment.tool = null;
  world.agents[agent.id] = agent;

  const paidBefore = world.stats.equipmentMaintenancePaid;
  await advanceTicks(world, 1); // tick 24
  // gold puede cambiar por otras acciones; verificamos solo el sink de mantenimiento
  assert.equal(world.stats.equipmentMaintenancePaid, paidBefore, `T3 FAIL: se cargo mantenimiento a agente sin equipo`);
  console.log(`T3 PASS: agente sin equipo no paga mantenimiento (stats.paid=${world.stats.equipmentMaintenancePaid})`);
}

// ---- T4: agente con equipo paga 1 gold por slot equipado --------------------

{
  const world = makeWorld(4);
  const agent = makeAgent("maint_d", "valdemarca");
  agent.gold = 50;
  agent.equipment.weapon = { itemId: "arma_hierro", durability: 80 };
  agent.equipment.armor = { itemId: "armadura_cuero", durability: 60 };
  agent.equipment.tool = { itemId: "herramienta_recoleccion", durability: 50 };
  world.agents[agent.id] = agent;

  const paidBefore = world.stats.equipmentMaintenancePaid;
  const paysBefore = world.stats.equipmentMaintenancePayments;
  await advanceTicks(world, 1); // tick 24
  const sinkDelta = world.stats.equipmentMaintenancePaid - paidBefore;
  assert.equal(sinkDelta, 3, `T4 FAIL: 3 slots deberian costar 3 gold de sink, obtenido ${sinkDelta}`);
  assert.equal(world.stats.equipmentMaintenancePayments - paysBefore, 1, "T4 FAIL: payments no incremento");
  console.log(`T4 PASS: 3 slots equipados → ${sinkDelta} gold de mantenimiento registrado`);
}

// ---- T5: gold nunca se vuelve negativo --------------------------------------

{
  const world = makeWorld(5);
  const agent = makeAgent("maint_e", "valdemarca");
  agent.gold = 1; // solo 1 gold, tiene 3 slots (coste seria 3, se capea a 1)
  agent.equipment.weapon = { itemId: "arma_hierro", durability: 80 };
  agent.equipment.armor = { itemId: "armadura_cuero", durability: 60 };
  agent.equipment.tool = { itemId: "herramienta_recoleccion", durability: 50 };
  world.agents[agent.id] = agent;

  await advanceTicks(world, 1); // tick 24 — coste max 3, pero solo tiene 1
  assert.ok(agent.gold >= 0, `T5 FAIL: gold negativo (${agent.gold})`);
  // El sink registra solo lo que realmente se cobro (min(gold, slots))
  assert.ok(world.stats.equipmentMaintenancePaid <= 1, `T5 FAIL: sink cobro mas de 1 gold (solo habia 1): ${world.stats.equipmentMaintenancePaid}`);
  console.log(`T5 PASS: gold no negativo — agent.gold=${agent.gold}, sink cobrado=${world.stats.equipmentMaintenancePaid}`);
}

// ---- T6: agente sigue funcionando despues del coste -------------------------

{
  const world = makeWorld(6);
  const agent = makeAgent("maint_f", "valdemarca");
  agent.gold = 5;
  agent.equipment.weapon = { itemId: "arma_hierro", durability: 80 };
  world.agents[agent.id] = agent;

  await advanceTicks(world, 1); // tick 24
  assert.ok(agent.alive, "T6 FAIL: el agente murio despues del coste");
  assert.ok(agent.status !== "dead", "T6 FAIL: estado 'dead' despues del coste");
  const result = decide(world, agent);
  assert.ok(result.action, "T6 FAIL: decide() no devuelve accion despues del coste");
  console.log(`T6 PASS: agente sigue funcionando, accion elegida: ${result.action.type}`);
}

// ---- T7: equipment y durability siguen funcionando --------------------------

{
  const world = makeWorld(7);
  const agent = makeAgent("maint_g", "valdemarca");
  agent.inventory.arma_hierro = 1;
  agent.gold = 30;
  world.agents[agent.id] = agent;

  execute(world, agent, { type: "equip_item", data: { itemId: "arma_hierro", slot: "weapon" } });
  assert.ok(agent.equipment.weapon, "T7 FAIL: equip_item no funciono");
  assert.equal(agent.equipment.weapon.itemId, "arma_hierro", "T7 FAIL: itemId incorrecto");
  const durBefore = agent.equipment.weapon.durability;

  const paidBefore = world.stats.equipmentMaintenancePaid;
  await advanceTicks(world, 1); // tick 24 — cobra mantenimiento
  assert.ok(world.stats.equipmentMaintenancePaid > paidBefore, "T7 FAIL: mantenimiento no cobrado en stats");
  assert.ok(agent.equipment.weapon, "T7 FAIL: weapon desaparecio despues del mantenimiento");
  // durability puede haber cambiado si el agente uso el arma; solo verificamos que existe
  assert.ok(agent.equipment.weapon.durability > 0, "T7 FAIL: durability llego a 0 por el mantenimiento");
  console.log(`T7 PASS: equipment y durability intactos despues del mantenimiento (durability=${agent.equipment.weapon.durability})`);
}

// ---- T8: Step 1 (embezzlement friction) sigue funcionando ------------------

{
  const world = makeWorld(8);
  const malversor = makeAgent("malversor_s3", "cruce_fangoso", {
    personality: { greed: 0.92, loyalty: 0.12, empathy: 0.08, ambition: 0.88, riskTolerance: 0.85, sociability: 0.4 }
  });
  const victima = makeAgent("victima_s3", "cruce_fangoso");
  world.agents[malversor.id] = malversor;
  world.agents[victima.id] = victima;
  world.guilds["guild_S3"] = {
    id: "guild_S3", name: "Gremio_S3", leaderId: "victima_s3",
    members: ["malversor_s3", "victima_s3"], treasury: 50, reputation: 30,
    dues: 0, relations: {}, activeContract: null, contractHistory: [],
    contractCounters: { killsByRank: {}, gathered: {}, crafted: {} },
    disbanded: false, lastReputationEventTick: 0, insolventSince: null,
    claims: [], createdTick: 0,
  };
  malversor.guildId = "guild_S3";
  victima.guildId = "guild_S3";

  execute(world, malversor, { type: "malversar_tesoro" });
  const kVictima = victima.knowledge.filter((k) => k.type === "malversacion_descubierta");
  assert.ok(kVictima.length >= 1, "T8 FAIL: Step 1 roto — no se emitio malversacion_descubierta");
  console.log("T8 PASS: Step 1 (embezzlement friction) intacto");
}

// ---- T9: Step 2 (craft scoring) sigue funcionando --------------------------

{
  const world = makeWorld(9);
  const agent = makeAgent("craft_s3", "valdemarca");
  agent.inventory.mineral_hierro = 5;
  agent.equipment.weapon = null;
  world.agents[agent.id] = agent;

  const result = decide(world, agent);
  const craftAction = result.rationale.availableActions?.find((a) => JSON.stringify(a).includes("arma_hierro"));
  assert.ok(craftAction, "T9 FAIL: craft arma_hierro no aparece en acciones evaluadas");
  console.log(`T9 PASS: Step 2 (craft scoring) intacto — craft score=${craftAction.score?.toFixed(2)}`);
}

console.log("\nTodos los tests de equipment_maintenance pasaron.");

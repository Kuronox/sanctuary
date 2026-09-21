// Test: Step 6 — Mortality & Rebirth
// T1. muerte reduce lives, registra deathHistory, alive sigue true si quedan vidas
// T2. tercera muerte -> lives=0, alive=false
// T3. agente permanentemente muerto no es target ni ejecuta turno
// T4. rebirth resetea gold/inventory/equipment/job, conserva identidad/historia
// T5. muerte de lider dispara sucesion y deja el guild consistente
// T6. muerte del ultimo miembro disuelve el guild
// T7. destino de renacimiento evita el lugar de muerte y, si hay alternativa, lugares donde ya murio
// T8. STEP 7: el hambre sostenida sin poder comer mata (decayNeeds sin floor)

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8"));

import { createWorld, tick } from "../world.js";
import { createAgent, createGuild } from "../entities.js";
import { handleDeath, listCandidateActions } from "../actions.js";
import { makeRng } from "../rng.js";

// ---- helpers ----------------------------------------------------------------

function makeAgent(id, location, overrides = {}) {
  const rng = makeRng(42 + id.charCodeAt(id.length - 1));
  const agent = createAgent({ id, name: `Agente_${id}`, flavorBiasDef: null, homeLocation: location, rng });
  agent.location = location;
  agent.gold = 50;
  agent.status = "idle";
  Object.assign(agent, overrides);
  return agent;
}

function makeWorld(seed) {
  return createWorld(worldSeed, seed);
}

// ---- T1: muerte reduce lives y registra deathHistory ------------------------

{
  const world = makeWorld(601);
  const agent = makeAgent("t1_a", "valdemarca");
  world.agents[agent.id] = agent;

  const livesBefore = agent.lives;
  handleDeath(world, agent, { cause: "combate", killer: "Lobo salvaje" });

  assert.equal(agent.lives, livesBefore - 1, "T1 FAIL: lives no se decremento");
  assert.equal(agent.deathHistory.length, 1, "T1 FAIL: deathHistory no registro la muerte");
  const entry = agent.deathHistory[0];
  assert.equal(entry.cause, "combate", "T1 FAIL: cause incorrecto");
  assert.equal(entry.lifeNumberBefore, livesBefore, "T1 FAIL: lifeNumberBefore incorrecto");
  assert.equal(entry.location, "valdemarca", "T1 FAIL: location incorrecto");
  assert.ok(agent.alive, "T1 FAIL: agente deberia seguir vivo (aun le quedan vidas)");
  console.log(`T1 PASS: muerte registrada, lives ${livesBefore} -> ${agent.lives}, alive=${agent.alive}`);
}

// ---- T2: tercera muerte -> permanente ----------------------------------------

{
  const world = makeWorld(602);
  const agent = makeAgent("t2_a", "valdemarca");
  world.agents[agent.id] = agent;

  handleDeath(world, agent, { cause: "combate" });
  assert.ok(agent.alive, "T2 FAIL: no deberia estar permanentemente muerto tras la 1a muerte");
  handleDeath(world, agent, { cause: "combate" });
  assert.ok(agent.alive, "T2 FAIL: no deberia estar permanentemente muerto tras la 2a muerte");
  handleDeath(world, agent, { cause: "combate" });

  assert.equal(agent.lives, 0, "T2 FAIL: lives deberia ser 0 tras la 3a muerte");
  assert.equal(agent.alive, false, "T2 FAIL: alive deberia ser false tras la 3a muerte");
  assert.equal(agent.deathHistory.length, 3, "T2 FAIL: deberian existir 3 entradas en deathHistory");
  console.log("T2 PASS: tercera muerte deja lives=0, alive=false");
}

// ---- T3: agente permanentemente muerto no es target ni actua ----------------

{
  const world = makeWorld(603);
  const alive = makeAgent("t3_alive", "valdemarca");
  const dead = makeAgent("t3_dead", "valdemarca");
  world.agents[alive.id] = alive;
  world.agents[dead.id] = dead;

  handleDeath(world, dead, { cause: "combate" });
  handleDeath(world, dead, { cause: "combate" });
  handleDeath(world, dead, { cause: "combate" });
  assert.equal(dead.alive, false, "T3 FAIL: setup incorrecto, dead deberia estar permanentemente muerto");

  const actions = listCandidateActions(world, alive);
  const targetsDead = actions.some((a) => a.data && a.data.targetId === dead.id);
  assert.ok(!targetsDead, "T3 FAIL: un agente permanentemente muerto aparece como target valido");

  const decisionsBefore = dead.recentDecisions.length;
  const statusBefore = dead.status;
  await tick(world);
  assert.equal(dead.recentDecisions.length, decisionsBefore, "T3 FAIL: el agente muerto ejecuto un turno (recentDecisions crecio)");
  assert.equal(dead.status, statusBefore, "T3 FAIL: el estado del agente muerto cambio durante un tick");
  console.log("T3 PASS: agente permanentemente muerto no es target y no actua");
}

// ---- T4: rebirth resetea material/profesion, conserva identidad/historia ----

{
  const world = makeWorld(604);
  const agent = makeAgent("t4_a", "valdemarca");
  agent.gold = 77;
  agent.inventory = { mineral_hierro: 5 };
  agent.equipment.weapon = { itemId: "arma_hierro", durability: 50 };
  agent.progression.job = { id: "herrero", level: 4, xp: 30 };
  agent.progression.baseLevel = 6;
  agent.guildsFounded = 2;
  agent.relationships["other_x"] = { affinity: 40, trust: 20, interactions: 3, lastTick: 0, memories: [] };
  agent.memory.push({ tick: 0, summary: "recuerdo de prueba", importance: 0.5 });
  world.agents[agent.id] = agent;

  handleDeath(world, agent, { cause: "combate" }); // lives 3 -> 2, rebirth (no permanente)

  assert.equal(agent.gold, 0, "T4 FAIL: gold deberia resetear a 0");
  assert.deepEqual(agent.inventory, {}, "T4 FAIL: inventory deberia quedar vacio");
  assert.deepEqual(agent.equipment, { weapon: null, armor: null, tool: null }, "T4 FAIL: equipment deberia quedar vacio");
  assert.equal(agent.progression.job.id, "herrero", "T4 FAIL: el job/id debe mantenerse");
  assert.equal(agent.progression.job.level, 1, "T4 FAIL: job.level deberia resetear a 1");
  assert.equal(agent.progression.job.xp, 0, "T4 FAIL: job.xp deberia resetear a 0");
  assert.equal(agent.progression.baseLevel, 6, "T4 FAIL: baseLevel deberia persistir");
  assert.equal(agent.guildsFounded, 2, "T4 FAIL: guildsFounded deberia persistir");
  assert.ok(agent.relationships["other_x"], "T4 FAIL: relationships deberian persistir");
  assert.equal(agent.relationships["other_x"].affinity, 40, "T4 FAIL: el contenido de relationships cambio");
  assert.equal(agent.memory.length, 1, "T4 FAIL: memory deberia persistir");
  assert.equal(agent.status, "idle", "T4 FAIL: status deberia quedar idle");
  assert.equal(agent.activity, null, "T4 FAIL: activity deberia quedar null");
  assert.notEqual(agent.location, "valdemarca", "T4 FAIL: deberia renacer en otro asentamiento");
  assert.equal(agent.stats.health, agent.stats.maxHealth, "T4 FAIL: health deberia quedar en maxHealth");
  console.log(`T4 PASS: rebirth limpio en ${agent.location}, identidad/historia intacta`);
}

// ---- T5: muerte del lider dispara sucesion -----------------------------------

{
  const world = makeWorld(605);
  const leader = makeAgent("t5_leader", "valdemarca");
  const member = makeAgent("t5_member", "valdemarca", {
    personality: { ambition: 0.5, sociability: 0.5, riskTolerance: 0.5, greed: 0.5, loyalty: 0.9, empathy: 0.5 },
  });
  world.agents[leader.id] = leader;
  world.agents[member.id] = member;
  const guild = createGuild({ id: "g_t5", name: "GuildT5", founderId: leader.id, tick: 0 });
  guild.members.push(member.id);
  world.guilds[guild.id] = guild;
  leader.guildId = guild.id;
  member.guildId = guild.id;

  handleDeath(world, leader, { cause: "combate" });

  assert.ok(!guild.members.includes(leader.id), "T5 FAIL: el lider muerto sigue en members");
  assert.equal(guild.members.length, 1, "T5 FAIL: members deberia tener solo al miembro restante");
  assert.equal(guild.leaderId, member.id, "T5 FAIL: sucesion no ocurrio");
  assert.equal(guild.disbanded, false, "T5 FAIL: el guild no deberia disolverse (queda un miembro)");
  assert.equal(leader.guildId, null, "T5 FAIL: guildId del lider muerto deberia quedar null");
  console.log("T5 PASS: sucesion de liderazgo correcta, guild consistente");
}

// ---- T6: muerte del ultimo miembro disuelve el guild -------------------------

{
  const world = makeWorld(606);
  const solo = makeAgent("t6_solo", "valdemarca");
  world.agents[solo.id] = solo;
  const guild = createGuild({ id: "g_t6", name: "GuildT6", founderId: solo.id, tick: 0 });
  world.guilds[guild.id] = guild;
  solo.guildId = guild.id;

  handleDeath(world, solo, { cause: "combate" });

  assert.equal(guild.disbanded, true, "T6 FAIL: el guild deberia disolverse al morir su ultimo miembro");
  console.log("T6 PASS: guild disuelto correctamente");
}

// ---- T7: destino evita el lugar de muerte y muertes previas cuando hay alternativa ----

{
  const world = makeWorld(607);
  const agent = makeAgent("t7_a", "valdemarca"); // conexiones: puerto_grisal, aldea_tejo, bosque_umbrio, colinas_rotas

  world.agents[agent.id] = agent;
  handleDeath(world, agent, { cause: "combate" });
  assert.notEqual(agent.location, "valdemarca", "T7 FAIL: no deberia renacer en el lugar donde murio");
  assert.equal(agent.location, "puerto_grisal", "T7 FAIL: deberia elegir el primer vecino valido en orden fijo");

  // Fuerza una segunda muerte en valdemarca, con una muerte previa ya registrada
  // en el candidato que le tocaria primero (puerto_grisal): debe saltarselo.
  agent.location = "valdemarca";
  agent.deathHistory.push({
    tick: world.time.tick, location: "puerto_grisal", cause: "combate", killer: null,
    lifeNumberBefore: agent.lives, baseLevel: agent.progression.baseLevel, jobId: agent.progression.job.id, guildId: null,
  });
  handleDeath(world, agent, { cause: "combate" });
  assert.notEqual(agent.location, "puerto_grisal", "T7 FAIL: deberia evitar un lugar donde ya murio si existe alternativa");
  assert.equal(agent.location, "aldea_tejo", "T7 FAIL: deberia elegir el siguiente vecino valido en orden fijo");
  console.log(`T7 PASS: destinos ${["puerto_grisal", "aldea_tejo"].join(" -> ")} respetan las exclusiones`);
}

// ---- T8: STEP 7 — hambre sostenida mata --------------------------------------

{
  const world = makeWorld(608);
  const agent = makeAgent("t8_a", "valdemarca");
  agent.stats.health = 3;
  world.agents[agent.id] = agent;

  const livesBefore = agent.lives;
  // Se fuerza hunger=1 antes de cada tick para aislar el mecanismo bajo prueba
  // (el floor de decayNeeds) del comportamiento emergente de decision.js —
  // sin esto, el agente podria comer y nunca llegar a niveles criticos.
  let died = false;
  for (let i = 0; i < 10 && !died; i++) {
    agent.needs.hunger = 1;
    await tick(world);
    if (agent.deathHistory.length > 0) died = true;
  }

  assert.ok(died, "T8 FAIL: el hambre sostenida no produjo ninguna muerte registrada");
  assert.equal(agent.deathHistory[0].cause, "hambre", "T8 FAIL: la muerte no se registro con cause='hambre'");
  assert.equal(agent.deathHistory[0].killer, null, "T8 FAIL: killer deberia ser null en una muerte por hambre");
  assert.equal(agent.lives, livesBefore - 1, "T8 FAIL: lives no se decremento tras la muerte por hambre");
  console.log(`T8 PASS: hambre sostenida mata (cause=${agent.deathHistory[0].cause}, killer=${agent.deathHistory[0].killer}, lives ${livesBefore} -> ${agent.lives})`);
}

console.log("\nTodos los tests de mortality (Step 6) pasaron.");

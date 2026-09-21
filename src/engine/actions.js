import { randInt, chance } from "./rng.js";
import { addKnowledge, addMemory, broadcastLocalEvent, shareRumor, recordPriceObservation } from "./knowledge.js";
import { adjustRelationship, getOrCreateRelationship, createGuild } from "./entities.js";
import { adjustStanding, getStanding, guardStrengthOf, institutionOf } from "./institutions.js";
import * as economy from "./economy.js";
import * as prog from "./progression.js";
import * as guilds from "./guilds.js";

const MIN_GUILD_TENURE_TICKS = 48; // ~2 dias antes de poder reconsiderar irse, salvo que el gremio ya vaya mal
const REJOIN_COOLDOWN_TICKS = 72; // ~3 dias de enfriamiento antes de poder re-unirse al mismo gremio que se abandono
const GUILD_FOUNDING_COOLDOWN_TICKS = 72; // ~3 dias tras salir de CUALQUIER gremio antes de poder fundar uno nuevo
                                            // (Experimento D: sin esto, fundar->extraer->abandonar/ser expulsado->
                                            // refundar era instantaneo y repetible sin limite, ej. Ulra 362/456 fundaciones)

function guildFoundingCost(agent) {
  // costo creciente por cada gremio ya fundado: la primera fundacion sigue
  // costando lo mismo que antes, pero repetir la jugada se encarece en vez
  // de ser gratis la enesima vez.
  return 30 + agent.guildsFounded * 20;
}

// ---------------------------------------------------------------------------
// Unica superficie por la que un agente puede afectar el mundo (seccion 22:
// aislamiento de agentes). V2 anade equipo, instituciones, crimen/carcel,
// grupos temporales y clases — pero el principio no cambia: si no hay un
// handler aqui, no existe como accion posible.
// ---------------------------------------------------------------------------

function locOf(world, id) {
  return world.worldSeed.locations.find((l) => l.id === id);
}

function jobDefOf(world, agent) {
  return prog.jobDef(world.worldSeed, agent.progression.job.id);
}

function agentsAt(world, locationId, excludeId) {
  return Object.values(world.agents).filter(
    (a) => a.alive && a.location === locationId && a.id !== excludeId && a.status !== "traveling"
  );
}

function emit(world, agent, type, summary, data = {}, opts = {}) {
  const event = {
    id: `ev_${world.nextEventId++}`,
    tick: world.time.tick,
    day: world.time.day,
    hour: world.time.hour,
    type,
    actorId: agent ? agent.id : null,
    location: agent ? agent.location : opts.location,
    summary,
    data,
  };
  world.timeline.push(event);
  world.onEvent && world.onEvent(event);
  if (opts.broadcastLocal !== false) {
    broadcastLocalEvent(world, event.location, event, { excludeIds: opts.excludeWitness });
  }
  return event;
}

function knowledgeCap(world, agent) {
  return 60 + prog.jobBonus(world.worldSeed, agent, "knowledgeCapBonus");
}

// ---- Monstruos / caza --------------------------------------------------

function huntPressureFor(world, locationId, family) {
  world.huntPressure[locationId] = world.huntPressure[locationId] || {};
  return world.huntPressure[locationId][family] || 0;
}

function bumpHuntPressure(world, locationId, family) {
  world.huntPressure[locationId] = world.huntPressure[locationId] || {};
  world.huntPressure[locationId][family] = Math.min(1, (world.huntPressure[locationId][family] || 0) + 0.09);
}

// Rangos de monstruo disponibles AHORA en una localizacion: comun casi
// siempre; elite mas probable cuanto mas "presionada" (sobreexplotada) esta
// la zona; jefe con una probabilidad fija minuscula, independiente de la
// presion — un encuentro raro de verdad, no un premio por farmear.
export function availableEncounters(world, locationId) {
  const loc = locOf(world, locationId);
  if (!loc.monsterFamily) return [];
  const pressure = huntPressureFor(world, locationId, loc.monsterFamily);
  const ranks = [{ family: loc.monsterFamily, rank: "comun" }];
  const eliteChance = 0.05 + pressure * 0.5;
  if (chance(world.rng, eliteChance)) ranks.push({ family: loc.monsterFamily, rank: "elite" });
  if (chance(world.rng, 0.004)) ranks.push({ family: loc.monsterFamily, rank: "jefe" });
  return ranks;
}

function monsterDef(world, family, rank) {
  return world.worldSeed.monsters[family]?.[rank];
}

function rollLoot(world, lootTable) {
  const drops = {};
  for (const entry of lootTable || []) {
    if (chance(world.rng, entry.p)) drops[entry.item] = (drops[entry.item] || 0) + entry.qty;
  }
  return drops;
}

// Aplica daño de combate considerando la reduccion de la armadura equipada,
// y desgasta el arma/armadura con el uso — el equipo importa de verdad
// (seccion 8 del encargo V2), no es un bien puramente decorativo.
function applyCombatDamage(world, agent, rawDamage) {
  let dmg = rawDamage;
  const armor = agent.equipment.armor;
  if (armor && armor.durability > 0) {
    const def = economy.goodDef(world.worldSeed, armor.itemId);
    dmg = Math.round(dmg * (1 - (def?.damageReduction || 0)));
  }
  agent.stats.health -= dmg; // Step 6: sin floor — el combate puede matar de verdad
  return dmg;
}

function wearEquipmentFromCombat(world, agent) {
  const weapon = agent.equipment.weapon;
  if (weapon && weapon.durability > 0) {
    weapon.durability -= randInt(world.rng, 1, 3);
    if (weapon.durability <= 0) agent.equipment.weapon = null;
  }
  const armor = agent.equipment.armor;
  if (armor && armor.durability > 0) {
    armor.durability -= randInt(world.rng, 1, 3);
    if (armor.durability <= 0) agent.equipment.armor = null;
  }
}

// ---- Mortalidad y renacimiento (Step 6) ---------------------------------

// Desvincula al agente de su gremio actual reutilizando la misma maquina de
// estados que `leave_guild` (sucesion, disolucion, cooldown de reingreso) —
// pero sin el efecto de afinidad por "abandono voluntario del fundador":
// morir no es una decision social, y section 20 pide no tocar relationships.
function leaveGuildOnDeath(world, agent) {
  const guild = world.guilds[agent.guildId];
  if (guild) {
    const wasLeader = guild.leaderId === agent.id;
    guild.members = guild.members.filter((m) => m !== agent.id);
    if (guild.members.length === 0) {
      guilds.disbandGuild(world, guild, "su ultimo miembro murio");
    } else if (wasLeader) {
      guilds.succeedLeader(world, guild);
    }
    agent.recentGuildDepartures[guild.id] = world.time.tick;
    const entries = Object.entries(agent.recentGuildDepartures);
    if (entries.length > 6) delete agent.recentGuildDepartures[entries.sort((a, b) => a[1] - b[1])[0][0]];
  }
  agent.guildId = null;
  agent.guildMissedDues = 0;
  agent.guildJoinedTick = null;
  agent.lastGuildExitTick = world.time.tick;
}

// Destino de renacimiento: regla causal simple y determinista (seccion 11
// del diseño aprobado) — sin score de seguridad/relaciones/poblacion, para
// no reintroducir el atractor geografico corregido en Step 4. Vecino
// directo del lugar de muerte, en el orden fijo de `worldSeed`, excluyendo
// el propio lugar de muerte y (cuando hay alternativa) lugares donde este
// agente ya murio antes.
function rebirthDestination(world, agent, deathLocationId) {
  const neighbors = (world.adjacency[deathLocationId] || []).map((c) => c.to);
  const notDeathLocation = neighbors.filter((id) => id !== deathLocationId);
  const diedHereBefore = new Set(agent.deathHistory.map((d) => d.location));
  const avoidingPriorDeaths = notDeathLocation.filter((id) => !diedHereBefore.has(id));
  const candidates = avoidingPriorDeaths.length ? avoidingPriorDeaths : notDeathLocation;
  return candidates[0] ?? deathLocationId; // sin vecinos: no hay alternativa real
}

// Unico punto de entrada cuando el combate deja health <= 0 (ver
// resolveSoloFight/resolvePartyFight). No se llama desde ningun otro lado:
// STEP 6 es mortalidad solo por combate, decayNeeds() sigue con su propio
// floor de hambre intacto.
export function handleDeath(world, agent, { cause, killer }) {
  const deathLocation = agent.location;
  const livesBefore = agent.lives;
  agent.lives -= 1;

  world.stats.deaths += 1;
  world.stats.goldLostToDeath += agent.gold;
  world.stats.equipmentLostToDeath += ["weapon", "armor", "tool"].filter((s) => agent.equipment[s] != null).length;
  world.stats.inventoryLostToDeath += Object.values(agent.inventory).reduce((sum, qty) => sum + qty, 0);

  agent.deathHistory.push({
    tick: world.time.tick,
    location: deathLocation,
    cause,
    killer: killer || null,
    lifeNumberBefore: livesBefore,
    baseLevel: agent.progression.baseLevel,
    jobId: agent.progression.job.id,
    guildId: agent.guildId,
  });

  if (agent.lives <= 0) {
    agent.alive = false;
    world.stats.permanentDeaths += 1;
    emit(world, agent, "permanent_death", `${agent.name} muere permanentemente en ${locOf(world, deathLocation).name}.`, { cause, killer: killer || null });
    return;
  }

  leaveGuildOnDeath(world, agent);

  agent.needs = { hunger: 0.2, fatigue: 0.2, social: 0.3 };
  agent.gold = 0;
  agent.inventory = {};
  agent.equipment = { weapon: null, armor: null, tool: null };
  agent.progression.job.level = 1;
  agent.progression.job.xp = 0;
  agent.progression.trial = null;
  agent.status = "idle";
  agent.activity = null;
  agent.pendingInvites = [];
  agent.prison = null;
  agent.recentDecisions = [];

  const destination = rebirthDestination(world, agent, deathLocation);
  agent.location = destination;
  agent.stats.maxHealth = prog.maxHealthFor(agent);
  agent.stats.health = agent.stats.maxHealth;

  emit(world, agent, "rebirth", `rebirth: ${agent.name} -> ${locOf(world, destination).name}`, { fromLocation: deathLocation, toLocation: destination, livesRemaining: agent.lives });
}

function resolveSoloFight(world, agent, family, rank) {
  const def = monsterDef(world, family, rank);
  const jobDef = jobDefOf(world, agent);
  let agentPower = prog.effectiveCombatPower(world.worldSeed, agent) + randInt(world.rng, -3, 5);
  agentPower -= prog.underleveledPenalty(agent, def.minBaseLevel);
  if (def.partyRecommended) agentPower *= 0.55; // enfrentarlo solo, en desventaja severa
  const monsterPower = def.power + randInt(world.rng, -2, 4);

  bumpHuntPressure(world, agent.location, family);
  prog.recordCounter(agent, rank === "comun" ? "killsComun" : rank === "elite" ? "killsElite" : "killsJefe", 1);

  wearEquipmentFromCombat(world, agent);
  if (agentPower >= monsterPower) {
    // Step 6: el daño se aplica y se comprueba la muerte ANTES de repartir
    // oro/botin/xp — un golpe final en una victoria no debe dejar recompensa.
    const dmg = applyCombatDamage(world, agent, randInt(world.rng, 2, 15));
    if (agent.stats.health <= 0) {
      handleDeath(world, agent, { cause: "combate", killer: def.name });
      return null;
    }
    const goldWon = randInt(world.rng, def.goldMin, def.goldMax);
    agent.gold += goldWon;
    const drops = rollLoot(world, def.loot);
    for (const [item, qty] of Object.entries(drops)) agent.inventory[item] = (agent.inventory[item] || 0) + qty;
    prog.addJobXp(agent, Math.round(def.power * 1.4), world.time.tick, world);
    prog.addBaseXp(agent, Math.round(def.power * 0.5));
    addMemory(agent, { summary: `Vencio a un ${def.name}`, importance: rank === "comun" ? 0.35 : 0.7, tags: ["combate", "victoria", rank] }, world.time.tick);
    if (agent.guildId) guilds.recordGuildCounter(world.guilds[agent.guildId], "kill", rank, 1);
    const lootTxt = Object.keys(drops).length ? ` (botin: ${Object.entries(drops).map(([k, v]) => `${k}x${v}`).join(", ")})` : "";
    return emit(world, agent, "combat_win", `${agent.name} vence a un ${def.name} y gana ${goldWon} de oro${lootTxt}.`, { family, rank, goldWon, dmg, drops });
  } else {
    const dmg = applyCombatDamage(world, agent, randInt(world.rng, 15, 40));
    if (agent.stats.health <= 0) {
      handleDeath(world, agent, { cause: "combate", killer: def.name });
      return null;
    }
    const goldLost = Math.min(agent.gold, randInt(world.rng, 0, 5));
    agent.gold -= goldLost;
    if (agent.stats.health <= 15) agent.status = "incapacitated";
    addMemory(agent, { summary: `Fue derrotado por un ${def.name}`, importance: rank === "comun" ? 0.5 : 0.85, tags: ["combate", "derrota", rank] }, world.time.tick);
    return emit(world, agent, "combat_loss", `${agent.name} es derrotado por un ${def.name} y pierde ${dmg} de salud.`, { family, rank, dmg, goldLost });
  }
}

export function resolvePartyFight(world, agentA, agentB, family, rank) {
  const def = monsterDef(world, family, rank);
  if (!def) return null;
  if (agentA.location !== agentB.location || agentA.location !== agentA.__inviteLocation) {
    // el objetivo ya no esta donde se propuso (alguien se movio entretanto)
    return null;
  }
  const powerA = prog.effectiveCombatPower(world.worldSeed, agentA);
  const powerB = prog.effectiveCombatPower(world.worldSeed, agentB);
  let combined = powerA + powerB + Math.min(powerA, powerB) * 0.15 + randInt(world.rng, -3, 6);
  const hasCaballero = agentA.progression.job.id === "caballero" || agentB.progression.job.id === "caballero";
  const monsterPower = def.power + randInt(world.rng, -2, 4);

  for (const a of [agentA, agentB]) {
    bumpHuntPressure(world, a.location, family);
    prog.recordCounter(a, rank === "comun" ? "killsComun" : rank === "elite" ? "killsElite" : "killsJefe", 1);
  }

  const win = combined >= monsterPower;
  const shareA = powerA / Math.max(1, powerA + powerB);
  const shareB = 1 - shareA;
  const minShare = 0.25;
  const splitA = Math.max(minShare, shareA);
  const splitB = Math.max(minShare, shareB);
  const norm = splitA + splitB;

  if (win) {
    const goldWon = randInt(world.rng, def.goldMin, def.goldMax);
    const drops = rollLoot(world, def.loot);
    const share = { [agentA.id]: Math.round(goldWon * (splitA / norm)), [agentB.id]: Math.round(goldWon * (splitB / norm)) };
    const dmgFactor = hasCaballero ? 0.55 : 0.8;
    // Step 6: el daño (que puede matar incluso en una victoria) se aplica
    // ANTES de repartir oro/botin/xp — quien muere con el golpe final no
    // recibe recompensa; el superviviente sigue procesandose normal.
    const survivors = [];
    for (const a of [agentA, agentB]) {
      wearEquipmentFromCombat(world, a);
      applyCombatDamage(world, a, Math.round(randInt(world.rng, 1, 10) * dmgFactor));
      if (a.stats.health <= 0) {
        handleDeath(world, a, { cause: "combate", killer: def.name });
        continue;
      }
      survivors.push(a);
      a.gold += share[a.id];
      prog.addJobXp(a, Math.round(def.power * 1.1), world.time.tick, world);
      prog.addBaseXp(a, Math.round(def.power * 0.5));
      if (a.guildId) guilds.recordGuildCounter(world.guilds[a.guildId], "kill", rank, 1);
    }
    const items = Object.entries(drops);
    items.forEach(([item, qty], i) => {
      const recipient = i % 2 === 0 ? agentA : agentB;
      if (survivors.includes(recipient)) recipient.inventory[item] = (recipient.inventory[item] || 0) + qty;
    });
    if (survivors.length === 2) {
      adjustRelationship(agentA, agentB.id, world.time.tick, { affinityDelta: 12, trustDelta: 10, note: `vencieron juntos a un ${def.name}`, weight: 3 });
      adjustRelationship(agentB, agentA.id, world.time.tick, { affinityDelta: 12, trustDelta: 10, note: `vencieron juntos a un ${def.name}`, weight: 3 });
    }
    if (survivors.length === 0) return null;
    return emit(world, survivors[0], "party_combat_win", `${agentA.name} y ${agentB.name} vencen juntos a un ${def.name} (${goldWon} de oro repartido).`, { family, rank, goldWon, partnerId: agentB.id });
  } else {
    const dmgFactor = hasCaballero ? 0.5 : 0.7;
    const survivors = [];
    for (const a of [agentA, agentB]) {
      wearEquipmentFromCombat(world, a);
      applyCombatDamage(world, a, Math.round(randInt(world.rng, 15, 40) * dmgFactor));
      if (a.stats.health <= 0) {
        handleDeath(world, a, { cause: "combate", killer: def.name });
        continue;
      }
      if (a.stats.health <= 15) a.status = "incapacitated";
      survivors.push(a);
    }
    if (survivors.length === 2) {
      adjustRelationship(agentA, agentB.id, world.time.tick, { affinityDelta: 4, trustDelta: 6, note: `lo intentaron juntos contra un ${def.name} y perdieron`, weight: 2 });
      adjustRelationship(agentB, agentA.id, world.time.tick, { affinityDelta: 4, trustDelta: 6, note: `lo intentaron juntos contra un ${def.name} y perdieron`, weight: 2 });
    }
    if (survivors.length === 0) return null;
    return emit(world, survivors[0], "party_combat_loss", `${agentA.name} y ${agentB.name} son derrotados juntos por un ${def.name}.`, { family, rank, partnerId: agentB.id });
  }
}

// ---- Generacion de candidatos de accion --------------------------------

export function listCandidateActions(world, agent) {
  const actions = [];
  const loc = locOf(world, agent.location);
  const market = world.markets[agent.location];
  const jobDef = jobDefOf(world, agent);
  const institution = loc.institution;

  actions.push({ type: "rest" });

  const foodStock = market.stock.racion_comida || 0;
  const foodPrice = economy.priceAt(world.worldSeed, world.markets, agent.location, "racion_comida");
  if ((agent.inventory.racion_comida || 0) > 0 || (foodStock > 0.5 && foodPrice <= agent.gold)) {
    actions.push({ type: "eat" });
  }
  if (market.settled && agent.gold >= 4 + loc.safety * 6) {
    actions.push({ type: "rest_inn" });
  }
  if ((agent.inventory.pocion_curativa || 0) > 0 && agent.stats.health < agent.stats.maxHealth * 0.7) {
    actions.push({ type: "use_potion" });
  }

  for (const conn of loc.connections) {
    actions.push({ type: "travel", data: { to: conn.to, hours: conn.hours } });
  }

  actions.push({ type: "work" });
  if ((loc.resources || []).length) actions.push({ type: "gather" });

  // Un novato SI puede intentar craftear/curar (con menos gracia, sin
  // perAJobLevel bonus) — de otro modo la prueba de clase de herrero/
  // curandero seria irrealizable (exigirian ya pertenecer a la clase que
  // se supone que la prueba habilita). Un novato demuestra su aptitud
  // antes de que se le reconozca el titulo.
  if (["novato", "herrero", "maestro_artesano"].includes(agent.class)) {
    if ((agent.inventory.mineral_hierro || 0) >= 3) actions.push({ type: "craft", data: { good: "arma_hierro" } });
    if ((agent.inventory.cuero || 0) >= 3) actions.push({ type: "craft", data: { good: "armadura_cuero" } });
    if ((agent.inventory.madera || 0) >= 2 && (agent.inventory.piedra || 0) >= 1) actions.push({ type: "craft", data: { good: "herramienta_recoleccion" } });
  }
  if (["novato", "curandero", "sanador_mayor"].includes(agent.class) && (agent.inventory.hierbas_medicinales || 0) >= 2) {
    actions.push({ type: "craft", data: { good: "pocion_curativa" } });
  }

  for (const [slot, itemCategory] of [["weapon", "equipo_arma"], ["armor", "equipo_armadura"], ["tool", "equipo_herramienta"]]) {
    const owned = Object.keys(agent.inventory).find((id) => {
      const def = economy.goodDef(world.worldSeed, id);
      return def && def.category === itemCategory && agent.inventory[id] > 0;
    });
    if (owned && (!agent.equipment[slot] || agent.equipment[slot].itemId !== owned)) {
      actions.push({ type: "equip_item", data: { itemId: owned, slot } });
    }
  }
  for (const slot of ["weapon", "armor", "tool"]) {
    const eq = agent.equipment[slot];
    if (eq) {
      const def = economy.goodDef(world.worldSeed, eq.itemId);
      if (def && eq.durability < def.durability * 0.5 && institution?.repairs && agent.gold >= 1) {
        actions.push({ type: "repair_item", data: { slot } });
      }
    }
  }

  for (const good of world.worldSeed.goods) {
    if ((agent.inventory[good.id] || 0) > 0 && good.category !== "equipo_arma" && good.category !== "equipo_armadura" && good.category !== "equipo_herramienta") {
      actions.push({ type: "trade_sell", data: { good: good.id, qty: agent.inventory[good.id] } });
    } else if ((agent.inventory[good.id] || 0) > 0 && agent.equipment.weapon?.itemId !== good.id && agent.equipment.armor?.itemId !== good.id && agent.equipment.tool?.itemId !== good.id) {
      actions.push({ type: "trade_sell", data: { good: good.id, qty: agent.inventory[good.id] } });
    }
    const stock = market.stock[good.id] || 0;
    const price = economy.priceAt(world.worldSeed, world.markets, agent.location, good.id);
    if (stock > 3 && agent.gold >= price * 1.05) {
      actions.push({ type: "trade_buy", data: { good: good.id, qty: 1 } });
    }
  }

  const encounters = availableEncounters(world, agent.location);
  for (const enc of encounters) {
    if (agent.stats.health > 20) actions.push({ type: "fight_monster", data: enc });
  }
  const dangerousEncounter = encounters.find((e) => e.rank === "elite" || e.rank === "jefe");
  if (dangerousEncounter && agent.stats.health > 30 && !agent.pendingInvites.length) {
    const allies = agentsAt(world, agent.location, agent.id)
      .filter((a) => (agent.relationships[a.id]?.affinity || 0) > 5)
      .sort((a, b) => prog.effectiveCombatPower(world.worldSeed, b) - prog.effectiveCombatPower(world.worldSeed, a));
    if (allies[0]) actions.push({ type: "proponer_grupo", data: { targetId: allies[0].id, family: dangerousEncounter.family, rank: dangerousEncounter.rank } });
  }

  const others = agentsAt(world, agent.location, agent.id);
  for (const other of others.slice(0, 5)) {
    actions.push({ type: "talk", data: { targetId: other.id } });
    if (agent.gold > 10 || Object.keys(agent.inventory).length) actions.push({ type: "help_agent", data: { targetId: other.id } });
    actions.push({ type: "steal", data: { targetId: other.id } });
    if (other.stats.health < other.stats.maxHealth * 0.6) {
      actions.push({ type: "curar_aliado", data: { targetId: other.id } });
    }
  }

  if (!agent.guildId) {
    const exitCooldownPassed = agent.lastGuildExitTick === null || world.time.tick - agent.lastGuildExitTick >= GUILD_FOUNDING_COOLDOWN_TICKS;
    if (exitCooldownPassed && agent.gold >= guildFoundingCost(agent)) actions.push({ type: "create_guild" });
  }
  if (!agent.guildId) {
    // Instancias concretas y realistas: solo gremios que el agente podria
    // razonablemente conocer (alguien de ahi presente, tiene relacion con
    // su lider, o su reputacion ya es publica) — no la lista completa de
    // gremios del mundo. decision.js compara estas instancias entre si Y
    // contra seguir independiente; no hay una accion generica "join_guild".
    const localsHere = agentsAt(world, agent.location, agent.id);
    let offered = 0;
    for (const guild of Object.values(world.guilds)) {
      if (offered >= 4) break;
      if (guild.disbanded) continue;
      // Enfriamiento antes de re-unirse al mismo gremio que se acaba de
      // abandonar: sin esto, "salir" y "entrar" pueden alternar cada tick
      // por puro ruido si ambos puntajes quedan muy cerca (se vio jugando
      // la simulacion: un agente con lealtad moderada, no extrema, oscilo
      // 179 veces en 30 dias entre el mismo gremio).
      const leftRecently = agent.recentGuildDepartures[guild.id] && world.time.tick - agent.recentGuildDepartures[guild.id] < REJOIN_COOLDOWN_TICKS;
      if (leftRecently) continue;
      const leaderRel = agent.relationships[guild.leaderId];
      const knowsSomeoneHere = localsHere.some((a) => a.guildId === guild.id);
      const isKnownGuild = guild.reputation > 25;
      if (knowsSomeoneHere || (leaderRel && leaderRel.affinity > 0) || isKnownGuild) {
        actions.push({ type: "join_guild", data: { guildId: guild.id } });
        offered += 1;
      }
    }
  }
  if (agent.guildId) {
    const guild = world.guilds[agent.guildId];
    const isLeader = guild && guild.leaderId === agent.id;
    // Un miembro no reconsidera irse el mismo dia que se unio salvo que el
    // gremio ya de señales claras de ir mal (reputacion hundida o sin
    // fondos) — sin este minimo de permanencia, unirse y salir compiten
    // tick a tick por ruido puro, no por un cambio real de circunstancias.
    const tenure = agent.guildJoinedTick != null ? world.time.tick - agent.guildJoinedTick : Infinity;
    const guildInTrouble = guild && (guild.reputation < -30 || guild.treasury <= 0);
    if (tenure >= MIN_GUILD_TENURE_TICKS || guildInTrouble) {
      actions.push({ type: "leave_guild" });
    }
    if (guild && agent.gold >= 5) actions.push({ type: "aportar_gremio" });
    // Malversar solo tiene sentido si hay a alguien mas a quien traicionar:
    // un fundador solitario "malversando" su propio tesoro no es un crimen,
    // es sacar su propio dinero, y sin nadie que pueda ser testigo nunca
    // habria riesgo real — eso abria un ciclo fundar-vaciar-abandonar gratis.
    if (guild && guild.treasury >= 10 && guild.members.length > 1) actions.push({ type: "malversar_tesoro" });

    if (isLeader && !guild.activeContract) {
      const openContracts = world.guildContracts.filter((c) => c.status === "open");
      for (const c of openContracts.slice(0, 5)) {
        actions.push({ type: "accept_guild_contract", data: { contractId: c.id } });
      }
    }
    if (world.guildWar) {
      const participating = guild.id in world.guildWar.participants;
      if (isLeader && !participating && world.time.tick <= world.guildWar.declarationDeadline && guild.treasury >= world.worldSeed.guildWar.commitmentCost) {
        actions.push({ type: "declarar_guerra_gremios" });
      }
      if (participating && world.time.tick <= world.guildWar.resolveTick) {
        actions.push({ type: "contribuir_guerra_gremios" });
      }
    }
  }

  for (const opp of world.opportunities) {
    if (opp.status === "open" && opp.originLocation === agent.location) {
      actions.push({ type: "accept_job", data: { oppId: opp.id } });
    }
  }

  if (institution && institution.trains.includes(agent.class)) {
    const fee = 6 + agent.progression.job.level * 2;
    if (agent.gold >= fee) actions.push({ type: "train" });
  }
  if (institution) {
    for (const target of prog.nextClassOptions(world.worldSeed, agent)) {
      if (target.requirement.standingInstitution && target.requirement.standingInstitution !== institution.id) continue;
      if (!prog.meetsRequirement(world.worldSeed, agent, target)) continue;
      const status = prog.trialStatus(agent, target);
      if (!agent.progression.trial || agent.progression.trial.targetJobId !== target.id) {
        actions.push({ type: "iniciar_prueba_clase", data: { jobId: target.id } });
      } else if (status.done) {
        actions.push({ type: "cambiar_clase", data: { jobId: target.id } });
      }
    }
  } else {
    // pruebas que no requieren institucion (novato -> tier1)
    for (const target of prog.nextClassOptions(world.worldSeed, agent)) {
      if (target.requirement.standingInstitution) continue;
      if (!prog.meetsRequirement(world.worldSeed, agent, target)) continue;
      const status = prog.trialStatus(agent, target);
      if (!agent.progression.trial || agent.progression.trial.targetJobId !== target.id) {
        actions.push({ type: "iniciar_prueba_clase", data: { jobId: target.id } });
      } else if (status.done) {
        actions.push({ type: "cambiar_clase", data: { jobId: target.id } });
      }
    }
  }
  // pruebas tier1->tier2 tambien deben evaluarse aunque el agente no este
  // fisicamente en la institucion en este instante de generar candidatos,
  // siempre que ya haya cumplido el requisito en algun momento pasado.
  if (!institution) {
    for (const target of prog.nextClassOptions(world.worldSeed, agent)) {
      if (!target.requirement.standingInstitution) continue;
      if (!prog.meetsRequirement(world.worldSeed, agent, target)) continue;
      const status = prog.trialStatus(agent, target);
      if (agent.progression.trial && agent.progression.trial.targetJobId === target.id && status.done) {
        actions.push({ type: "cambiar_clase", data: { jobId: target.id } });
      }
    }
  }

  return actions;
}

// ---- Ejecucion -----------------------------------------------------------

export function execute(world, agent, action) {
  const fn = HANDLERS[action.type];
  if (!fn) throw new Error(`Accion desconocida: ${action.type}`);
  return fn(world, agent, action.data || {});
}

const HANDLERS = {
  rest(world, agent) {
    agent.needs.fatigue = Math.max(0, agent.needs.fatigue - 0.4);
    const loc = locOf(world, agent.location);
    if (agent.stats.health < agent.stats.maxHealth) {
      agent.stats.health = Math.min(agent.stats.maxHealth, agent.stats.health + 5 * loc.safety);
    }
    return emit(world, agent, "rest", `${agent.name} descansa en ${loc.name}.`, {}, { broadcastLocal: false });
  },

  rest_inn(world, agent) {
    const loc = locOf(world, agent.location);
    const cost = Math.round(4 + loc.safety * 6);
    agent.gold -= cost;
    agent.needs.fatigue = 0;
    agent.stats.health = Math.min(agent.stats.maxHealth, agent.stats.health + 20);
    return emit(world, agent, "rest_inn", `${agent.name} se aloja en una posada de ${loc.name} por ${cost} de oro y descansa bien.`, { cost }, { broadcastLocal: false });
  },

  eat(world, agent) {
    if ((agent.inventory.racion_comida || 0) > 0) {
      agent.inventory.racion_comida -= 1;
    } else {
      const res = economy.buy(world.worldSeed, world.markets, agent.location, "racion_comida", 1);
      if (!res) return emit(world, agent, "eat_failed", `${agent.name} no encuentra comida en el mercado.`, {}, { broadcastLocal: false });
      agent.gold = Math.max(0, agent.gold - res.totalCost);
    }
    agent.needs.hunger = Math.max(0, agent.needs.hunger - 0.5);
    return emit(world, agent, "eat", `${agent.name} come.`, {}, { broadcastLocal: false });
  },

  use_potion(world, agent) {
    agent.inventory.pocion_curativa -= 1;
    const def = economy.goodDef(world.worldSeed, "pocion_curativa");
    const bonus = 1 + prog.jobBonus(world.worldSeed, agent, "healBonus");
    const heal = Math.round(def.healAmount * bonus);
    agent.stats.health = Math.min(agent.stats.maxHealth, agent.stats.health + heal);
    return emit(world, agent, "use_potion", `${agent.name} bebe una pocion curativa y recupera ${heal} de salud.`, { heal }, { broadcastLocal: false });
  },

  curar_aliado(world, agent, { targetId }) {
    const target = world.agents[targetId];
    if (!target || !target.alive) return null;
    const bonus = 1 + prog.jobBonus(world.worldSeed, agent, "healBonus");
    const baseHeal = agent.class === "sanador_mayor" ? 25 : agent.class === "curandero" ? 14 : 7;
    const heal = Math.round(baseHeal * bonus);
    target.stats.health = Math.min(target.stats.maxHealth, target.stats.health + heal);
    prog.recordCounter(agent, "heals", 1);
    prog.addJobXp(agent, 6, world.time.tick, world);
    adjustRelationship(target, agent.id, world.time.tick, { affinityDelta: 10, trustDelta: 12, note: `${agent.name} lo curo`, weight: 2 });
    adjustRelationship(agent, targetId, world.time.tick, { affinityDelta: 4, note: "curo a alguien" });
    return emit(world, agent, "heal", `${agent.name} cura a ${target.name} (+${heal} salud).`, { targetId, heal });
  },

  travel(world, agent, { to, hours }) {
    agent.status = "traveling";
    agent.activity = { type: "travel", remainingTicks: hours, data: { to } };
    return emit(world, agent, "travel_start", `${agent.name} parte hacia ${locOf(world, to).name}.`);
  },

  work(world, agent) {
    const loc = locOf(world, agent.location);
    let income = randInt(world.rng, 2, 6);
    const jobDef = jobDefOf(world, agent);
    let summary = `${agent.name} trabaja en ${loc.name}.`;
    if (agent.class === "comerciante" || agent.class === "mercader_de_ruta") {
      income = randInt(world.rng, 4, 12);
      summary = `${agent.name} comercia en ${loc.name} y gana ${income} de oro.`;
    } else if (agent.class === "herrero" || agent.class === "maestro_artesano") {
      income = randInt(world.rng, 2, 6);
      summary = `${agent.name} trabaja la fragua en ${loc.name}.`;
    } else if (agent.class === "curandero" || agent.class === "sanador_mayor") {
      income = randInt(world.rng, 3, 7);
      summary = `${agent.name} atiende enfermos en ${loc.name}.`;
    } else if (agent.class === "erudito" || agent.class === "archivista") {
      income = randInt(world.rng, 2, 5);
      summary = `${agent.name} investiga y vende conocimiento en ${loc.name}.`;
      if (chance(world.rng, 0.35)) {
        addKnowledge(agent, { fact: `Se dice que ${loc.name} ha visto movimiento inusual ultimamente`, type: "deduccion", source: "deducido", confidence: 0.6 }, world.time.tick, knowledgeCap(world, agent));
      }
    }
    const workBonus = loc.workBonus?.[agent.class] ?? 1.0;
    if (workBonus !== 1.0) income = Math.round(income * workBonus);
    agent.gold += income;
    agent.needs.fatigue = Math.min(1, agent.needs.fatigue + 0.15);
    prog.addJobXp(agent, 5, world.time.tick, world);
    prog.addBaseXp(agent, 1);
    // Ejercer el propio oficio regularmente en la ciudad de la institucion
    // que lo reconoce construye reputacion local de a poco. Sin esto,
    // "entrenar" (rara) era la unica via a la posicion institucional y el
    // tier 2 resultaba practicamente inalcanzable (visto en la validacion
    // de 300 dias: standing quedaba vacio en todos los agentes).
    if (loc.institution && loc.institution.trains.includes(agent.class)) {
      adjustStanding(agent, loc.institution.id, 0.3);
    }
    return emit(world, agent, "work", summary, { income });
  },

  gather(world, agent) {
    const loc = locOf(world, agent.location);
    if (!loc.resources || !loc.resources.length) return emit(world, agent, "gather_failed", `${agent.name} no encuentra nada que recolectar.`, {}, { broadcastLocal: false });
    const resource = loc.resources[randInt(world.rng, 0, loc.resources.length - 1)];
    let qty = randInt(world.rng, 1, 3);
    const tool = agent.equipment.tool;
    if (tool && tool.durability > 0) {
      const toolDef = economy.goodDef(world.worldSeed, tool.itemId);
      if (chance(world.rng, toolDef.gatherBonus + prog.jobBonus(world.worldSeed, agent, "gatherBonus"))) qty += 1;
      tool.durability -= randInt(world.rng, 1, 3);
      if (tool.durability <= 0) agent.equipment.tool = null;
    }
    // El gremio que gano el control de esta localizacion en la ultima
    // disputa da a sus miembros un plus de recoleccion aqui mientras dure.
    const warBonus = world.guildWarBonus;
    if (warBonus && warBonus.guildId === agent.guildId && warBonus.locationId === agent.location && world.time.tick < warBonus.expiresTick) {
      if (chance(world.rng, world.worldSeed.guildWar.gatherBonus)) qty += 1;
    }
    agent.inventory[resource] = (agent.inventory[resource] || 0) + qty;
    agent.needs.fatigue = Math.min(1, agent.needs.fatigue + 0.2);
    prog.addJobXp(agent, 2, world.time.tick, world);
    if (agent.guildId) guilds.recordGuildCounter(world.guilds[agent.guildId], "gather", resource, qty);
    return emit(world, agent, "gather", `${agent.name} recolecta ${qty} de ${resource} en ${loc.name}.`, { resource, qty }, { broadcastLocal: false });
  },

  craft(world, agent, { good }) {
    const def = economy.goodDef(world.worldSeed, good);
    for (const [mat, qty] of Object.entries(def.craftedFrom)) agent.inventory[mat] -= qty;
    let qty = 1;
    if (chance(world.rng, prog.jobBonus(world.worldSeed, agent, "craftBonus"))) qty += 1;
    agent.inventory[good] = (agent.inventory[good] || 0) + qty;
    agent.needs.fatigue = Math.min(1, agent.needs.fatigue + 0.15);
    prog.recordCounter(agent, "crafts", 1);
    prog.addJobXp(agent, 8, world.time.tick, world);
    if (agent.guildId) guilds.recordGuildCounter(world.guilds[agent.guildId], "craft", good, qty);
    return emit(world, agent, "craft", `${agent.name} fabrica ${def.name}${qty > 1 ? ` x${qty}` : ""}.`, { good, qty }, { broadcastLocal: false });
  },

  equip_item(world, agent, { itemId, slot }) {
    const def = economy.goodDef(world.worldSeed, itemId);
    agent.inventory[itemId] -= 1;
    const previous = agent.equipment[slot];
    if (previous) agent.inventory[previous.itemId] = (agent.inventory[previous.itemId] || 0) + 1;
    agent.equipment[slot] = { itemId, durability: def.durability };
    return emit(world, agent, "equip", `${agent.name} equipa ${def.name}.`, { slot, itemId }, { broadcastLocal: false });
  },

  repair_item(world, agent, { slot }) {
    const eq = agent.equipment[slot];
    const def = economy.goodDef(world.worldSeed, eq.itemId);
    const discount = prog.jobBonus(world.worldSeed, agent, "repairDiscount");
    const cost = economy.repairCost(world.worldSeed, eq.itemId, def.durability - eq.durability, discount);
    agent.gold = Math.max(0, agent.gold - cost);
    eq.durability = def.durability;
    return emit(world, agent, "repair", `${agent.name} repara su ${def.name} por ${cost} de oro.`, { slot, cost }, { broadcastLocal: false });
  },

  trade_buy(world, agent, { good, qty }) {
    let discount = prog.jobBonus(world.worldSeed, agent, "taxDiscount");
    const warBonus = world.guildWarBonus;
    if (warBonus && warBonus.guildId === agent.guildId && warBonus.locationId === agent.location && world.time.tick < warBonus.expiresTick) {
      discount += world.worldSeed.guildWar.taxDiscount;
    }
    const res = economy.buy(world.worldSeed, world.markets, agent.location, good, qty, discount);
    if (!res) return emit(world, agent, "trade_failed", `${agent.name} no pudo comprar ${good}.`, {}, { broadcastLocal: false });
    agent.gold = Math.max(0, agent.gold - res.totalCost);
    agent.inventory[good] = (agent.inventory[good] || 0) + res.qty;
    prog.recordCounter(agent, "trades", 1);
    prog.addJobXp(agent, 1, world.time.tick, world);
    recordPriceObservation(agent, good, agent.location, res.unitPrice, world.time.tick, knowledgeCap(world, agent));
    return emit(world, agent, "trade_buy", `${agent.name} compra ${res.qty} de ${good} por ${res.totalCost} de oro (impuesto: ${res.tax}).`, res);
  },

  trade_sell(world, agent, { good, qty }) {
    const actualQty = Math.min(qty, agent.inventory[good] || 0);
    if (actualQty <= 0) return emit(world, agent, "trade_failed", `${agent.name} no tiene ${good} para vender.`, {}, { broadcastLocal: false });
    const res = economy.sell(world.worldSeed, world.markets, agent.location, good, actualQty);
    if (!res) return emit(world, agent, "trade_failed", `${agent.name} quiso vender ${good} pero el mercado de ${agent.location} no tiene fondos.`, {}, { broadcastLocal: false });
    agent.inventory[good] -= res.qty;
    agent.gold += res.totalGain;
    prog.recordCounter(agent, "trades", 1);
    prog.addJobXp(agent, 1, world.time.tick, world);
    recordPriceObservation(agent, good, agent.location, res.unitPrice, world.time.tick, knowledgeCap(world, agent));
    const note = res.reserveExhausted ? " (el mercado se quedo corto de fondos)" : "";
    return emit(world, agent, "trade_sell", `${agent.name} vende ${res.qty} de ${good} por ${res.totalGain} de oro${note}.`, res);
  },

  fight_monster(world, agent, { family, rank }) {
    return resolveSoloFight(world, agent, family, rank);
  },

  proponer_grupo(world, agent, { targetId, family, rank }) {
    const target = world.agents[targetId];
    if (!target || !target.alive) return null;
    if (target.pendingInvites.length) return emit(world, agent, "party_propose_busy", `${agent.name} quiere pedir ayuda a ${target.name}, pero ya tiene otra propuesta pendiente.`, {}, { broadcastLocal: false });
    agent.__inviteLocation = agent.location;
    target.pendingInvites.push({ fromId: agent.id, family, rank, location: agent.location, issuedTick: world.time.tick, expiresTick: world.time.tick + 6 });
    return emit(world, agent, "party_proposed", `${agent.name} le pide a ${target.name} que se una para enfrentar a un enemigo peligroso.`, { targetId, family, rank });
  },

  talk(world, agent, { targetId }) {
    const target = world.agents[targetId];
    if (!target || !target.alive) return null;
    adjustRelationship(agent, targetId, world.time.tick, { affinityDelta: randInt(world.rng, 1, 4), trustDelta: 1, note: "conversacion", weight: 0.5 });
    adjustRelationship(target, agent.id, world.time.tick, { affinityDelta: randInt(world.rng, 1, 4), trustDelta: 1, note: "conversacion", weight: 0.5 });
    agent.needs.social = Math.max(0, agent.needs.social - 0.3);
    target.needs.social = Math.max(0, target.needs.social - 0.15);
    const shared = shareRumor(world.rng, agent, target, world.time.tick);
    const summary = shared ? `${agent.name} conversa con ${target.name} y comparte un rumor.` : `${agent.name} conversa con ${target.name}.`;
    return emit(world, agent, "talk", summary, { targetId, shared: !!shared }, { broadcastLocal: false });
  },

  help_agent(world, agent, { targetId }) {
    const target = world.agents[targetId];
    if (!target || !target.alive) return null;
    const amount = Math.min(agent.gold, randInt(world.rng, 3, 10));
    agent.gold -= amount;
    target.gold += amount;
    adjustRelationship(agent, targetId, world.time.tick, { affinityDelta: 5, note: "ayudo", weight: 1.5 });
    adjustRelationship(target, agent.id, world.time.tick, { affinityDelta: 20, trustDelta: 15, note: `${agent.name} le ayudo con oro`, weight: 1.5 });
    return emit(world, agent, "help", `${agent.name} ayuda a ${target.name} con ${amount} de oro.`, { targetId, amount });
  },

  steal(world, agent, { targetId }) {
    const target = world.agents[targetId];
    if (!target || !target.alive || target.gold <= 0) return null;
    const stealthBase = ["picaro", "asesino", "contrabandista"].includes(agent.class) ? 0.65 : 0.3;
    const stealth = stealthBase + prog.jobBonus(world.worldSeed, agent, "stealthBonus");
    const guardStrength = guardStrengthOf(world.worldSeed, agent.location);
    const witnesses = agentsAt(world, agent.location, agent.id);
    const witnessed = witnesses.length > 1 || chance(world.rng, 0.5);
    const success = chance(world.rng, stealth);

    if (success) {
      const amount = Math.min(target.gold, randInt(world.rng, 3, 15));
      target.gold -= amount;
      agent.gold += amount;
      prog.recordCounter(agent, "stealSuccess", 1);
      // Robar con exito ahora progresa de verdad (antes solo alimentaba la
      // prueba de clase, nunca el nivel de oficio: se podia DESBLOQUEAR una
      // clase criminal robando, pero practicar el crimen despues de eso no
      // volvia a nadie mejor criminal). El monto en juego y el riesgo del
      // lugar escalan la XP, igual que el poder del monstruo escala la XP
      // de un combate — asaltar una bolsa grande bajo la nariz de la
      // guardia de una capital vale mas que sacarle unas monedas a alguien
      // en un pueblo sin ley. Un robo fallido no da XP, igual que perder un
      // combate no la da: el precedente ya existente en el sistema.
      prog.addJobXp(agent, Math.round(amount * 0.7 + guardStrength * 12), world.time.tick, world);
      prog.addBaseXp(agent, Math.round(amount * 0.2));
      let arrested = false;
      if (witnessed && chance(world.rng, guardStrength)) {
        arrested = true;
        arrest(world, agent, "robo (con exito, pero visto por la guardia)");
      }
      if (witnessed || chance(world.rng, 0.5)) {
        adjustRelationship(target, agent.id, world.time.tick, { affinityDelta: -50, trustDelta: -40, note: "le robaron", weight: 3 });
        addKnowledge(target, { fact: `${agent.name} le robo ${amount} de oro`, type: "crimen", source: "observado", confidence: 1 }, world.time.tick, knowledgeCap(world, target));
        addMemory(target, { summary: `${agent.name} le robo`, importance: 0.8, tags: ["traicion", "robo"] }, world.time.tick);
      }
      const inst = institutionOf(world.worldSeed, agent.location);
      if (inst && witnessed) adjustStanding(agent, inst.id, -8);
      return emit(world, agent, "theft", `${agent.name} roba ${amount} de oro a ${target.name}.${arrested ? " La guardia lo atrapa despues." : ""}`, { targetId, amount, witnessed, arrested });
    } else {
      adjustRelationship(target, agent.id, world.time.tick, { affinityDelta: -60, trustDelta: -50, note: "intento robarle", weight: 3 });
      adjustRelationship(agent, targetId, world.time.tick, { affinityDelta: -15, note: "objetivo alertado, riesgo alto de repetir", weight: 1 });
      let arrested = false;
      if (witnessed && chance(world.rng, guardStrength * 1.3)) {
        arrested = true;
        arrest(world, agent, "intento de robo");
      }
      return emit(world, agent, "theft_failed", `${agent.name} intenta robar a ${target.name} y es descubierto.${arrested ? " La guardia lo arresta." : ""}`, { targetId, arrested });
    }
  },

  create_guild(world, agent) {
    const cost = guildFoundingCost(agent);
    agent.gold -= cost;
    agent.guildsFounded += 1;
    const id = `guild_${world.nextGuildId++}`;
    const name = `${agent.name.split(" ")[0]}${["Company", "Hermandad", "Compañia", "Circulo"][randInt(world.rng, 0, 3)]}`;
    const guild = createGuild({ id, name, founderId: agent.id, tick: world.time.tick });
    guild.treasury = cost;
    world.guilds[id] = guild;
    agent.guildId = id;
    return emit(world, agent, "guild_founded", `${agent.name} funda el gremio ${name}.`, { guildId: id });
  },

  join_guild(world, agent, { guildId }) {
    const guild = world.guilds[guildId];
    if (!guild || guild.disbanded) return null;
    agent.guildId = guildId;
    agent.guildJoinedTick = world.time.tick;
    guild.members.push(agent.id);
    return emit(world, agent, "guild_joined", `${agent.name} se une al gremio ${guild.name}.`, { guildId });
  },

  leave_guild(world, agent) {
    const guild = world.guilds[agent.guildId];
    if (guild) {
      const wasLeader = guild.leaderId === agent.id;
      const wasFounder = guild.founderId === agent.id;
      guild.members = guild.members.filter((m) => m !== agent.id);
      if (guild.members.length === 0) {
        guilds.disbandGuild(world, guild, "su ultimo miembro se fue");
      } else {
        if (wasFounder) {
          // el fundador que se va pierde afinidad con quienes se quedan,
          // sea o no el lider en ese momento.
          for (const memberId of guild.members) {
            const member = world.agents[memberId];
            if (member) adjustRelationship(member, agent.id, world.time.tick, { affinityDelta: -20, trustDelta: -15, note: `${agent.name} abandono el gremio que fundo`, weight: 2 });
          }
        }
        // El gremio sobrevive a la salida de su fundador si hay condiciones
        // (miembros restantes) para ello; si quien se va es el LIDER actual
        // (fundador o no), el gremio no queda sin cabeza: sucesion minima.
        if (wasLeader) guilds.succeedLeader(world, guild);
      }
    }
    const summary = `${agent.name} abandona el gremio ${guild ? guild.name : ""}.`;
    if (guild) {
      agent.recentGuildDepartures[guild.id] = world.time.tick;
      const entries = Object.entries(agent.recentGuildDepartures);
      if (entries.length > 6) delete agent.recentGuildDepartures[entries.sort((a, b) => a[1] - b[1])[0][0]];
    }
    agent.guildId = null;
    agent.guildMissedDues = 0;
    agent.guildJoinedTick = null;
    agent.lastGuildExitTick = world.time.tick;
    return emit(world, agent, "guild_left", summary, {});
  },

  aportar_gremio(world, agent) {
    const guild = world.guilds[agent.guildId];
    if (!guild) return null;
    const amount = Math.min(agent.gold, randInt(world.rng, 5, 15));
    agent.gold -= amount;
    guild.treasury += amount;
    return emit(world, agent, "guild_contribution", `${agent.name} aporta ${amount} de oro al tesoro de ${guild.name}.`, { amount }, { broadcastLocal: false });
  },

  malversar_tesoro(world, agent) {
    const guild = world.guilds[agent.guildId];
    if (!guild) return null;
    const amount = Math.min(guild.treasury, randInt(world.rng, 5, Math.max(6, Math.round(guild.treasury * 0.4))));
    guild.treasury -= amount;
    agent.gold += amount;
    const witnesses = agentsAt(world, agent.location, agent.id).filter((a) => a.guildId === guild.id);
    const caught = witnesses.length > 0;
    let expelled = false;
    if (caught) {
      for (const w of witnesses) {
        adjustRelationship(w, agent.id, world.time.tick, { affinityDelta: -70, trustDelta: -60, note: `${agent.name} malverso el tesoro del gremio`, weight: 4 });
        addKnowledge(w, { fact: `${agent.name} malverso ${amount} de oro del tesoro de ${guild.name}`, type: "traicion", source: "observado", confidence: 1 }, world.time.tick, knowledgeCap(world, w));
      }
      guilds.adjustGuildReputation(guild, -6, world.time.tick);
      guilds.expelMember(world, guild, agent, "fue descubierto malversando el tesoro");
      expelled = true;
    }
    const ev = emit(world, agent, "guild_embezzle", `${agent.name} malversa ${amount} de oro del tesoro de ${guild.name}.${caught ? " Lo ven hacerlo y lo expulsan." : ""}`, { amount, caught, expelled });
    if (caught) {
      // Propagar el descubrimiento a TODOS los presentes (no solo miembros del gremio),
      // usando el sistema local existente. Los agentes del gremio ya recibieron la
      // traicion directamente arriba; los no-miembros presentes aprenden via este evento.
      // shareRumor puede propagarlo a otros lugares con confianza decreciente.
      broadcastLocalEvent(world, agent.location, {
        id: `ev_${world.nextEventId++}`,
        tick: world.time.tick,
        day: world.time.day,
        hour: world.time.hour,
        type: "malversacion_descubierta",
        actorId: agent.id,
        location: agent.location,
        summary: `${agent.name} fue descubierto malversando el tesoro de ${guild.name} y expulsado.`,
        data: {},
      });
    }
    return ev;
  },

  accept_guild_contract(world, agent, { contractId }) {
    const guild = world.guilds[agent.guildId];
    const contract = world.guildContracts.find((c) => c.id === contractId);
    if (!guild || !contract || contract.status !== "open" || guild.leaderId !== agent.id || guild.activeContract) return null;
    guilds.acceptGuildContract(world, guild, contract);
    return emit(world, agent, "guild_contract_accepted", `${agent.name}, como lider de ${guild.name}, compromete al gremio con un encargo: ${contract.description}.`, { contractId });
  },

  declarar_guerra_gremios(world, agent) {
    const guild = world.guilds[agent.guildId];
    const war = world.guildWar;
    if (!guild || !war || guild.leaderId !== agent.id || guild.id in war.participants) return null;
    const cost = world.worldSeed.guildWar.commitmentCost;
    guild.treasury -= cost;
    war.participants[guild.id] = 0;
    return emit(world, agent, "guild_war_declared", `${agent.name} compromete a ${guild.name} en la disputa por ${locOf(world, war.locationId).name} (${cost} de oro de preparacion).`, { locationId: war.locationId });
  },

  contribuir_guerra_gremios(world, agent) {
    const guild = world.guilds[agent.guildId];
    const war = world.guildWar;
    if (!guild || !war || !(guild.id in war.participants)) return null;
    const power = prog.effectiveCombatPower(world.worldSeed, agent);
    war.participants[guild.id] += power;
    agent.needs.fatigue = Math.min(1, agent.needs.fatigue + 0.2);
    return emit(world, agent, "guild_war_contribution", `${agent.name} aporta a la preparacion de ${guild.name} para la disputa por ${locOf(world, war.locationId).name} (poder ${power}).`, { power }, { broadcastLocal: false });
  },

  accept_job(world, agent, { oppId }) {
    const opp = world.opportunities.find((j) => j.id === oppId);
    if (!opp || opp.status !== "open") return null;
    opp.status = "accepted";
    opp.acceptedBy = agent.id;
    agent.committedJob = oppId;
    return emit(world, agent, "job_accepted", `${agent.name} acepta: ${opp.description}.`, { oppId });
  },

  train(world, agent) {
    const inst = institutionOf(world.worldSeed, agent.location);
    const fee = 6 + agent.progression.job.level * 2;
    agent.gold -= fee;
    const xpGain = 10 + agent.progression.job.level * 2;
    prog.addJobXp(agent, xpGain, world.time.tick, world);
    adjustStanding(agent, inst.id, 4);
    // si hay un instructor cualificado presente (alto nivel en el mismo
    // oficio), se lleva una comision — la pericia se vuelve economicamente
    // relevante de verdad (seccion 9 del encargo V2).
    const instructor = agentsAt(world, agent.location, agent.id).find(
      (a) => a.class === agent.class && a.progression.job.level >= 10
    );
    let instructorNote = "";
    if (instructor) {
      const cut = Math.round(fee * 0.5);
      instructor.gold += cut;
      adjustRelationship(agent, instructor.id, world.time.tick, { affinityDelta: 6, note: `${instructor.name} lo entreno`, weight: 1 });
      instructorNote = ` ${instructor.name} cobra una comision de instructor (${cut}).`;
    }
    return emit(world, agent, "train", `${agent.name} entrena en ${inst.name} por ${fee} de oro (+${xpGain} XP de oficio).${instructorNote}`, { fee, xpGain }, { broadcastLocal: false });
  },

  iniciar_prueba_clase(world, agent, { jobId }) {
    const target = prog.jobDef(world.worldSeed, jobId);
    prog.startTrial(agent, target);
    return emit(world, agent, "trial_started", `${agent.name} inicia la prueba para convertirse en ${target.name}.`, { jobId });
  },

  cambiar_clase(world, agent, { jobId }) {
    const target = prog.jobDef(world.worldSeed, jobId);
    const previousName = jobDefOf(world, agent).name;
    prog.applyClassChange(world.worldSeed, agent, target, world.time.tick);
    return emit(world, agent, "class_change", `${agent.name} completa su prueba y pasa de ${previousName} a ${target.name}.`, { from: previousName, to: target.name, jobId });
  },
};

export function arrest(world, agent, reason) {
  const loc = locOf(world, agent.location);
  let fine = Math.min(agent.gold, randInt(world.rng, 5, 20));
  // Proteccion de gremio: si el gremio tiene fondos y no esta ya desprestigiado,
  // cubre parte de la multa de uno de los suyos — un beneficio concreto de
  // pertenecer, pagado por la propia institucion, no por el motor.
  let bailedBy = null;
  const guild = agent.guildId ? world.guilds[agent.guildId] : null;
  if (guild && guild.reputation > -20 && guild.treasury > 5) {
    const bail = Math.min(guild.treasury, Math.round(fine * 0.5));
    if (bail > 0) {
      guild.treasury -= bail;
      fine -= bail;
      bailedBy = guild.name;
    }
  }
  agent.gold -= fine;
  const sentence = randInt(world.rng, 18, 48);
  agent.status = "imprisoned";
  agent.activity = null;
  agent.prison = { locationId: agent.location, releaseTick: world.time.tick + sentence, reason };
  const inst = institutionOf(world.worldSeed, agent.location);
  if (inst) adjustStanding(agent, inst.id, -25);
  addMemory(agent, { summary: `Fue arrestado en ${loc.name} por ${reason}`, importance: 0.9, tags: ["crimen", "carcel"] }, world.time.tick);
  const bailTxt = bailedBy ? ` ${bailedBy} paga parte de su multa.` : "";
  return emit(world, agent, "arrest", `${agent.name} es arrestado en ${loc.name} por ${reason} (multa ${fine}, ${sentence} horas de carcel).${bailTxt}`, { fine, sentence, reason, bailedBy });
}

export { emit, locOf, agentsAt, jobDefOf };

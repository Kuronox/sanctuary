// ---------------------------------------------------------------------------
// GREMIOS COMO INSTITUCIONES PERSISTENTES (Experimento A)
//
// V2 tenia gremios que eran, en la practica, una decision individual:
// fundar -> entrar -> salir -> el gremio desaparece en cuanto se queda sin
// gente. Este modulo los convierte en instituciones con recursos, cuotas,
// encargos propios, reputacion, sucesion de liderazgo y relaciones con
// otros gremios derivadas de eventos reales (no asignadas a mano).
//
// Principio de diseño (heredado de V2, seccion "decisiones por instancia"):
// nada de esto obliga a nadie. Cada regla de aqui solo cambia la PUNTUACION
// de opciones concretas que ya compiten contra todo lo demas en
// decision.js — si a un agente no le conviene, no ocurre.
// ---------------------------------------------------------------------------

import { randInt, chance } from "./rng.js";

const DUES_INTERVAL_TICKS = 168; // 1 vez por semana de juego
const MAX_MISSED_DUES = 3;
const REPUTATION_DECAY_AFTER_TICKS = 240;

export function initGuildContractCounters() {
  return { killsByRank: { comun: 0, elite: 0, jefe: 0 }, gathered: {}, crafted: {} };
}

export function recordGuildCounter(guild, kind, key, qty = 1) {
  if (!guild) return;
  if (kind === "kill") guild.contractCounters.killsByRank[key] = (guild.contractCounters.killsByRank[key] || 0) + qty;
  if (kind === "gather") guild.contractCounters.gathered[key] = (guild.contractCounters.gathered[key] || 0) + qty;
  if (kind === "craft") guild.contractCounters.crafted[key] = (guild.contractCounters.crafted[key] || 0) + qty;
}

function contractProgress(guild, contract) {
  const c = guild.contractCounters;
  const start = contract.startCounters;
  if (contract.type === "caza_gremial") {
    const now = (c.killsByRank[contract.rank] || 0);
    const then = (start.killsByRank[contract.rank] || 0);
    return now - then;
  }
  if (contract.type === "recoleccion_gremial") {
    return (c.gathered[contract.good] || 0) - (start.gathered[contract.good] || 0);
  }
  if (contract.type === "fabricacion_gremial") {
    return (c.crafted[contract.good] || 0) - (start.crafted[contract.good] || 0);
  }
  return 0;
}

export function acceptGuildContract(world, guild, contract) {
  contract.status = "accepted";
  contract.guildId = guild.id;
  contract.acceptedTick = world.time.tick;
  contract.startCounters = JSON.parse(JSON.stringify(guild.contractCounters));
  guild.activeContract = contract.id;
}

// Se revisa una vez por tick para todos los gremios con contrato activo:
// exito si se alcanzo el objetivo, fracaso si vencio el plazo sin lograrlo.
export function tickGuildContracts(world) {
  for (const contract of world.guildContracts) {
    if (contract.status !== "accepted") continue;
    const guild = world.guilds[contract.guildId];
    if (!guild || guild.disbanded) { contract.status = "abandonado"; continue; }
    const have = contractProgress(guild, contract);
    if (have >= contract.count) {
      contract.status = "completado";
      guild.activeContract = null;
      guild.treasury += contract.reward;
      adjustGuildReputation(guild, contract.reputationOnSuccess, world.time.tick);
      guild.contractHistory.push({ id: contract.id, type: contract.type, outcome: "exito", tick: world.time.tick, reward: contract.reward });
      trimHistory(guild.contractHistory);
      pushWorldEvent(world, "guild_contract_success", `El gremio ${guild.name} completa un encargo (${contract.description}) y gana ${contract.reward} de oro.`);
    } else if (world.time.tick > contract.deadlineTick) {
      contract.status = "fallido";
      guild.activeContract = null;
      adjustGuildReputation(guild, contract.reputationOnFailure, world.time.tick);
      guild.contractHistory.push({ id: contract.id, type: contract.type, outcome: "fracaso", tick: world.time.tick, reward: 0 });
      trimHistory(guild.contractHistory);
      pushWorldEvent(world, "guild_contract_failed", `El gremio ${guild.name} no completa a tiempo su encargo (${contract.description}).`);
    }
  }
  if (world.guildContracts.length > 300) {
    world.guildContracts = world.guildContracts.filter((c) => c.status === "open" || c.status === "accepted");
  }
}

function trimHistory(arr, max = 15) {
  while (arr.length > max) arr.shift();
}

export function adjustGuildReputation(guild, delta, tick) {
  guild.reputation = Math.max(-100, Math.min(100, guild.reputation + delta));
  if (tick != null) guild.lastReputationEventTick = tick;
}

export function decayGuildReputation(guild, tick) {
  if (tick - (guild.lastReputationEventTick || 0) < REPUTATION_DECAY_AFTER_TICKS) return;
  if (Math.abs(guild.reputation) < 0.1) { guild.reputation = 0; return; }
  guild.reputation -= Math.sign(guild.reputation) * Math.min(Math.abs(guild.reputation), 0.08);
}

// Genera un nuevo encargo de gremio de vez en cuando. Cualquier gremio
// activo puede aceptarlo (el primero que lo haga se lo queda) — hay
// competencia real por un recurso escaso: la propia oportunidad.
export function maybeGenerateGuildContract(world) {
  if (world.rng() > 0.045) return;
  const templates = world.worldSeed.guildContractTemplates;
  const types = Object.keys(templates);
  const type = types[Math.floor(world.rng() * types.length)];
  const t = templates[type];
  const count = randInt(world.rng, t.countMin, t.countMax);
  const id = `gc_${world.nextGuildContractId++}`;
  const deadlineTick = world.time.tick + t.deadlineHours;
  let contract = { id, type, count, deadlineTick, status: "open", reputationOnSuccess: t.reputationOnSuccess, reputationOnFailure: t.reputationOnFailure };

  if (type === "caza_gremial") {
    const families = Object.keys(world.worldSeed.monsters);
    const family = families[Math.floor(world.rng() * families.length)];
    const rank = chance(world.rng, 0.75) ? "comun" : "elite";
    contract = { ...contract, family, rank, reward: Math.round(count * t.rewardPerKill), description: `cazar ${count} ${rank === "elite" ? "monstruos elite" : "monstruos"} de tipo ${family}` };
  } else if (type === "recoleccion_gremial") {
    const goods = world.worldSeed.locations.flatMap((l) => l.resources || []);
    const good = goods[Math.floor(world.rng() * goods.length)];
    contract = { ...contract, good, reward: Math.round(count * t.rewardPerUnit), description: `recolectar ${count} de ${good}` };
  } else {
    // "racion_comida" tiene craftedFrom en el mundo semilla (representa
    // produccion de fondo de NPCs, ver economy.js) pero ningun agente
    // puede craftearla de verdad (no existe esa opcion en actions.js) —
    // un encargo que pidiera fabricarla seria imposible de cumplir por
    // construccion. Se excluye explicitamente de la mezcla.
    const NOT_PLAYER_CRAFTABLE = new Set(["racion_comida"]);
    const craftable = world.worldSeed.goods.filter((g) => g.craftedFrom && !NOT_PLAYER_CRAFTABLE.has(g.id));
    const good = craftable[Math.floor(world.rng() * craftable.length)].id;
    contract = { ...contract, good, reward: Math.round(count * t.rewardPerUnit), description: `fabricar ${count} de ${good}` };
  }
  world.guildContracts.push(contract);
  pushWorldEvent(world, "guild_contract_posted", `Nuevo encargo de gremio disponible: ${contract.description} (recompensa ${contract.reward} oro).`);
}

// ---- Cuotas y expulsion -----------------------------------------------

export function tickDues(world) {
  if (world.time.tick % DUES_INTERVAL_TICKS !== 0) return;
  for (const guild of Object.values(world.guilds)) {
    if (guild.disbanded) continue;
    const due = duesFor(guild);
    for (const memberId of [...guild.members]) {
      const agent = world.agents[memberId];
      if (!agent || !agent.alive) continue;
      if (agent.gold >= due) {
        agent.gold -= due;
        guild.treasury += due;
        agent.guildMissedDues = 0;
      } else {
        agent.guildMissedDues = (agent.guildMissedDues || 0) + 1;
        if (agent.guildMissedDues >= MAX_MISSED_DUES) {
          expelMember(world, guild, agent, "no pudo pagar la cuota del gremio repetidamente");
        }
      }
    }
  }
}

export function duesFor(guild) {
  return Math.round(2 + Math.max(0, guild.reputation) * 0.04);
}

export function expelMember(world, guild, agent, reason) {
  guild.members = guild.members.filter((m) => m !== agent.id);
  agent.guildId = null;
  agent.guildMissedDues = 0;
  agent.lastGuildExitTick = world.time.tick;
  pushWorldEvent(world, "guild_expelled", `${agent.name} es expulsado de ${guild.name}: ${reason}.`, agent.location);
  if (guild.leaderId === agent.id) succeedLeader(world, guild);
  if (guild.members.length === 0) disbandGuild(world, guild, "se quedo sin miembros tras una expulsion");
}

// Sucesion minima: cuando el lider se va, asume el miembro restante con
// mayor lealtad (no hay votacion ni politica compleja — solo una regla
// determinista de continuidad institucional).
export function succeedLeader(world, guild) {
  if (guild.members.length === 0) return;
  let best = null;
  let bestScore = -Infinity;
  for (const id of guild.members) {
    const a = world.agents[id];
    if (!a) continue;
    const score = a.personality.loyalty * 2 + (a.progression.job.level || 0) * 0.05;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  if (best) {
    guild.leaderId = best.id;
    pushWorldEvent(world, "guild_new_leader", `${best.name} asume el liderazgo de ${guild.name}.`, best.location);
  }
}

export function disbandGuild(world, guild, reason) {
  guild.disbanded = true;
  guild.disbandedTick = world.time.tick;
  guild.disbandReason = reason;
  pushWorldEvent(world, "guild_collapsed", `El gremio ${guild.name} se disuelve: ${reason}.`);
}

// ---- Especializacion (derivada, no elegida) -----------------------------

export function guildSpecialization(world, guild) {
  const counts = {};
  for (const id of guild.members) {
    const a = world.agents[id];
    if (!a || a.class === "novato") continue;
    counts[a.class] = (counts[a.class] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length || entries[0][1] < 2) return null;
  return entries[0][0];
}

// ---- Relaciones entre gremios (derivadas de eventos, no asignadas) ------

export function getGuildRelation(guild, otherId) {
  if (!guild.relations[otherId]) guild.relations[otherId] = { score: 0, lastEventTick: 0 };
  return guild.relations[otherId];
}

export function adjustGuildRelation(world, guild, otherId, delta, note) {
  const rel = getGuildRelation(guild, otherId);
  rel.score = Math.max(-100, Math.min(100, rel.score + delta));
  rel.lastEventTick = world.time.tick;
  if (note) rel.lastNote = note;
}

export function guildRelationLabel(score) {
  if (score <= -40) return "rivalidad";
  if (score <= -10) return "competencia";
  if (score < 15) return "neutralidad";
  return "cooperacion";
}

// ---- Guerra de gremios --------------------------------------------------

export function maybeStartGuildWar(world) {
  const cfg = world.worldSeed.guildWar;
  if (world.guildWar) return;
  if (world.time.tick - (world.lastGuildWarTick || -cfg.intervalTicks) < cfg.intervalTicks) return;
  const loc = cfg.contestedLocations[Math.floor(world.rng() * cfg.contestedLocations.length)];
  world.guildWar = {
    id: `war_${world.time.tick}`,
    locationId: loc,
    announceTick: world.time.tick,
    declarationDeadline: world.time.tick + cfg.declarationWindowTicks,
    resolveTick: world.time.tick + cfg.intervalTicks,
    participants: {}, // guildId -> contributedPower
  };
  world.lastGuildWarTick = world.time.tick;
  pushWorldEvent(world, "guild_war_announced", `Se declara una disputa por el control de ${locOfName(world, loc)}. Los gremios pueden prepararse para participar.`, loc);
}

export function tickGuildWar(world) {
  const war = world.guildWar;
  if (!war) return;
  if (world.time.tick < war.resolveTick) return;

  const participants = Object.entries(war.participants);
  if (participants.length === 0) {
    pushWorldEvent(world, "guild_war_lapsed", `La disputa por ${locOfName(world, war.locationId)} termina sin ningun gremio participando.`, war.locationId);
    world.guildWar = null;
    return;
  }
  participants.sort((a, b) => b[1] - a[1]);
  const [winnerId, winnerPower] = participants[0];
  const winner = world.guilds[winnerId];
  if (winner) {
    adjustGuildReputation(winner, 10, world.time.tick);
    world.guildWarBonus = { guildId: winnerId, locationId: war.locationId, expiresTick: world.time.tick + world.worldSeed.guildWar.bonusDurationTicks };
    pushWorldEvent(world, "guild_war_resolved", `${winner.name} gana el control de ${locOfName(world, war.locationId)} tras la disputa entre gremios (poder aportado: ${Math.round(winnerPower)}).`, war.locationId);
  }
  for (let i = 0; i < participants.length; i++) {
    const [gid] = participants[i];
    const guild = world.guilds[gid];
    if (!guild) continue;
    for (let j = 0; j < participants.length; j++) {
      if (i === j) continue;
      const [otherId] = participants[j];
      if (gid === winnerId) adjustGuildRelation(world, guild, otherId, -4, "disputa de gremios");
      else if (otherId === winnerId) adjustGuildRelation(world, guild, otherId, -12, "perdio una disputa de gremios contra ellos");
      else adjustGuildRelation(world, guild, otherId, 3, "perdieron juntos una disputa de gremios");
    }
  }
  world.guildWar = null;
}

function locOfName(world, id) {
  return world.worldSeed.locations.find((l) => l.id === id)?.name || id;
}

// Emisor de eventos propio de este modulo (sin importar actions.js, para
// evitar una dependencia circular: actions.js va a importar guilds.js).
// Firma fija: (world, type, summary, location?).
function pushWorldEvent(world, type, summary, location) {
  const event = {
    id: `ev_${world.nextEventId++}`,
    tick: world.time.tick,
    day: world.time.day,
    hour: world.time.hour,
    type,
    actorId: null,
    location: location || null,
    summary,
    data: {},
  };
  world.timeline.push(event);
  world.onEvent && world.onEvent(event);
}

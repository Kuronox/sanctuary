import { makeRng } from "./rng.js";
import * as economy from "./economy.js";
import { decide, respondToPartyInvite } from "./decision.js";
import { decide as decideLlm } from "./llm/llmDecision.js";
import { narrateTypeA } from "./llm/narrator.js";
import { execute, emit, locOf, resolvePartyFight, handleDeath } from "./actions.js";
import { addMemory } from "./knowledge.js";
import { appendEvent, appendDecision } from "./store.js";
import { buildAdjacency } from "./geo.js";
import { decayRelationships } from "./entities.js";
import { decayStandings } from "./institutions.js";
import * as prog from "./progression.js";
import * as guilds from "./guilds.js";

const HOURS_PER_DAY = 24;
const GUILD_UPKEEP_EVERY_TICKS = 24;
const GUILD_INSOLVENCY_LIMIT_TICKS = 240;
const SAFE_CITY_SAFETY = 0.7; // Step 11: desde aqui una ciudad cuenta como segura para quedarse a recuperarse
const EQUIPMENT_UPKEEP_EVERY_TICKS = 24; // 1 gold por slot equipado por dia

export function createWorld(worldSeed, seedNumber) {
  const rng = makeRng(seedNumber);
  const world = {
    worldSeed,
    rng,
    seedNumber,
    adjacency: buildAdjacency(worldSeed),
    time: { tick: 0, day: worldSeed.startDate.day, hour: worldSeed.startDate.hour },
    agents: {},
    guilds: {},
    markets: economy.initMarket(worldSeed),
    huntPressure: {},
    opportunities: [],
    guildContracts: [],
    guildWar: null,
    guildWarBonus: null,
    lastGuildWarTick: 0,
    timeline: [],
    nextEventId: 1,
    nextGuildId: 1,
    nextOppId: 1,
    nextGuildContractId: 1,
    onEvent: null,
    stats: {
      equipmentMaintenancePaid: 0, equipmentMaintenancePayments: 0,
      deaths: 0, permanentDeaths: 0, goldLostToDeath: 0, equipmentLostToDeath: 0, inventoryLostToDeath: 0,
    },
  };
  return world;
}

export function hydrateWorld(state) {
  const world = createWorld(state.worldSeed, state.seedNumber);
  world.time = state.time;
  world.agents = state.agents;
  world.guilds = state.guilds;
  world.markets = state.markets;
  world.huntPressure = state.huntPressure || {};
  world.opportunities = state.opportunities || [];
  world.guildContracts = state.guildContracts || [];
  world.guildWar = state.guildWar || null;
  world.guildWarBonus = state.guildWarBonus || null;
  world.lastGuildWarTick = state.lastGuildWarTick || 0;
  world.nextEventId = state.nextEventId;
  world.nextGuildId = state.nextGuildId;
  world.nextOppId = state.nextOppId || 1;
  world.nextGuildContractId = state.nextGuildContractId || 1;
  world.rng = makeRng((state.seedNumber + state.time.tick * 2654435761) >>> 0);
  world.stats = {
    equipmentMaintenancePaid: 0, equipmentMaintenancePayments: 0,
    deaths: 0, permanentDeaths: 0, goldLostToDeath: 0, equipmentLostToDeath: 0, inventoryLostToDeath: 0,
    ...(state.stats || {}),
  };
  return world;
}

export function serializeWorld(world) {
  return {
    worldSeed: world.worldSeed,
    seedNumber: world.seedNumber,
    time: world.time,
    agents: world.agents,
    guilds: world.guilds,
    markets: world.markets,
    huntPressure: world.huntPressure,
    opportunities: world.opportunities,
    guildContracts: world.guildContracts,
    guildWar: world.guildWar,
    guildWarBonus: world.guildWarBonus,
    lastGuildWarTick: world.lastGuildWarTick,
    nextEventId: world.nextEventId,
    nextGuildId: world.nextGuildId,
    nextOppId: world.nextOppId,
    nextGuildContractId: world.nextGuildContractId,
    stats: world.stats,
  };
}

function advanceClock(world) {
  world.time.tick += 1;
  world.time.hour += 1;
  if (world.time.hour >= HOURS_PER_DAY) {
    world.time.hour = 0;
    world.time.day += 1;
  }
}

function decayNeeds(agent) {
  agent.needs.hunger = Math.min(1, agent.needs.hunger + 0.02);
  agent.needs.fatigue = Math.min(1, agent.needs.fatigue + 0.015);
  agent.needs.social = Math.min(1, agent.needs.social + 0.01);
  if (agent.needs.hunger > 0.85) agent.stats.health -= 1; // Step 7: sin floor — el hambre puede matar de verdad
}

function decayHuntPressure(world) {
  for (const loc of Object.keys(world.huntPressure)) {
    for (const fam of Object.keys(world.huntPressure[loc])) {
      world.huntPressure[loc][fam] = Math.max(0, world.huntPressure[loc][fam] - 0.02);
    }
  }
}

function resolveJobsOnArrival(world, agent) {
  if (!agent.committedJob) return;
  const opp = world.opportunities.find((j) => j.id === agent.committedJob);
  if (!opp || opp.status !== "accepted") { agent.committedJob = null; return; }
  if (opp.type === "transporte" && agent.location === opp.destLocation) {
    agent.gold += opp.reward;
    opp.status = "completado";
    agent.committedJob = null;
    prog.addBaseXp(agent, 4);
    addMemory(agent, { summary: `Completo un trabajo de transporte por ${opp.reward} de oro`, importance: 0.4, tags: ["trabajo"] }, world.time.tick);
    emit(world, agent, "job_completed", `${agent.name} completa el trabajo de transporte y gana ${opp.reward} de oro.`, { oppId: opp.id });
  }
}

function expireOpportunities(world) {
  for (const opp of world.opportunities) {
    if (opp.status === "open" && world.time.tick > opp.deadlineTick) {
      opp.status = "expirado";
    } else if (opp.status === "accepted" && world.time.tick > opp.deadlineTick) {
      opp.status = "fallido";
      const agent = world.agents[opp.acceptedBy];
      if (agent && agent.committedJob === opp.id) {
        agent.committedJob = null;
        addMemory(agent, { summary: `No llego a tiempo a cumplir un encargo`, importance: 0.3, tags: ["trabajo", "fracaso"] }, world.time.tick);
      }
    }
  }
  if (world.opportunities.length > 400) {
    world.opportunities = world.opportunities.filter((o) => o.status === "open" || o.status === "accepted");
  }
}

function maybeGenerateOpportunity(world) {
  if (world.rng() > 0.07) return;
  const locs = world.worldSeed.locations;
  const origin = locs[Math.floor(world.rng() * locs.length)];
  if (!origin.connections.length) return;
  const conn = origin.connections[Math.floor(world.rng() * origin.connections.length)];
  const hours = conn.hours;
  const reward = Math.round(8 + hours * 3 + world.rng() * 10);
  const opp = {
    id: `opp_${world.nextOppId++}`,
    type: "transporte",
    description: `transportar mercancia de ${origin.name} a ${locOf(world, conn.to).name}`,
    originLocation: origin.id,
    destLocation: conn.to,
    reward,
    postedTick: world.time.tick,
    deadlineTick: world.time.tick + hours * 4 + 12,
    status: "open",
    acceptedBy: null,
  };
  world.opportunities.push(opp);
  emit(world, null, "job_posted", `Nueva oportunidad en ${origin.name}: ${opp.description} (recompensa ${reward} oro).`, { oppId: opp.id }, { location: origin.id });
}

function processActivity(world, agent) {
  const act = agent.activity;
  if (!act) return false;
  act.remainingTicks -= 1;
  if (act.remainingTicks > 0) return true;
  if (act.type === "travel") {
    agent.location = act.data.to;
    agent.status = "idle";
    agent.activity = null;
    prog.recordCounter(agent, "visits", agent.location);
    emit(world, agent, "travel_end", `${agent.name} llega a ${locOf(world, agent.location).name}.`);
    resolveJobsOnArrival(world, agent);
  } else {
    agent.status = "idle";
    agent.activity = null;
  }
  return true;
}

function survivalOverride(world, agent) {
  const loc = locOf(world, agent.location);
  const noLocalFood = (world.markets[agent.location].stock.racion_comida || 0) < 0.5 && (agent.inventory.racion_comida || 0) === 0;
  const desperate = agent.stats.health < 20 || (agent.needs.hunger > 0.9 && noLocalFood);
  if (agent.stats.health < 25 && (agent.inventory.pocion_curativa || 0) > 0) {
    return { type: "use_potion" };
  }
  // Step 11: comer va antes que huir. La salud baja por hambre disparaba la
  // huida "a un lugar mas seguro" aunque hubiera comida en la ciudad, y el
  // agente rebotaba entre dos ciudades seguras hasta morir sin comer.
  const starving = agent.needs.hunger > 0.9;
  if (starving && !noLocalFood) return { type: "eat" };
  const weak = agent.stats.health < 20;
  const safeHere = loc.safety >= SAFE_CITY_SAFETY;
  if (desperate && loc.connections.length) {
    const best = [...loc.connections].sort((a, b) => locOf(world, b.to).safety - locOf(world, a.to).safety)[0];
    // Step 11: un agente debil solo huye de una ciudad peligrosa; la falta de
    // comida solo lo mueve si de verdad tiene hambre.
    const fleeDanger = weak && !safeHere && locOf(world, best.to).safety > loc.safety;
    if (fleeDanger || (starving && noLocalFood)) {
      return { type: "travel", data: { to: best.to, hours: best.hours } };
    }
  }
  // Step 11: debil en ciudad segura -> se queda a recuperarse (descansar es
  // lo unico que devuelve salud sin oro ni pociones).
  if (weak && safeHere) return { type: "rest" };
  if (agent.needs.fatigue > 0.92) return { type: "rest" };
  if (agent.needs.hunger > 0.9) return { type: "eat" };
  return null;
}

function processPrison(world, agent) {
  if (world.time.tick >= agent.prison.releaseTick) {
    const loc = locOf(world, agent.prison.locationId);
    emit(world, agent, "release", `${agent.name} sale de la carcel de ${loc.name}.`, {}, { broadcastLocal: false });
    agent.prison = null;
    agent.status = "idle";
    return true;
  }
  return false;
}

// Costo operativo del gremio mas alla de lo que cubren las cuotas de sus
// miembros (guilds.tickDues) — salon del gremio, registro, etc. Es
// deliberadamente pequeño ahora que existe una fuente de ingreso real
// (cuotas semanales + recompensas de encargos): antes esto era el UNICO
// drenaje y forzaba insolvencia solo por existir.
function tickGuildOverhead(world) {
  if (world.time.tick % GUILD_UPKEEP_EVERY_TICKS !== 0) return;
  for (const guild of Object.values(world.guilds)) {
    if (guild.disbanded) continue;
    const upkeep = 0.4 + guild.members.length * 0.15;
    guild.treasury -= upkeep;
    if (guild.treasury <= 0) {
      guild.treasury = 0;
      if (guild.insolventSince == null) guild.insolventSince = world.time.tick;
      if (world.time.tick - guild.insolventSince > GUILD_INSOLVENCY_LIMIT_TICKS) {
        guilds.disbandGuild(world, guild, "colapso por insolvencia sostenida");
      }
    } else {
      guild.insolventSince = null;
    }
  }
}

// Step 3: gold sink — 1 oro por slot de equipo equipado por dia (cada 24 ticks).
// No genera deuda: agent.gold nunca baja de 0.
// No penaliza agentes sin equipo: solo paga quien tiene algo equipado.
function tickEquipmentMaintenance(world) {
  if (world.time.tick % EQUIPMENT_UPKEEP_EVERY_TICKS !== 0) return;
  for (const agent of Object.values(world.agents)) {
    if (!agent.alive || agent.prison) continue;
    const slots = ["weapon", "armor", "tool"].filter((s) => agent.equipment[s] != null).length;
    if (slots === 0) continue;
    const cost = Math.min(agent.gold, slots); // 1 gold/slot, capped at available gold
    agent.gold -= cost;
    world.stats.equipmentMaintenancePaid += cost;
    world.stats.equipmentMaintenancePayments += 1;
  }
}

function tickGuildReputationDecay(world) {
  for (const guild of Object.values(world.guilds)) {
    if (guild.disbanded) continue;
    guilds.decayGuildReputation(guild, world.time.tick);
  }
}

function tickGuildWarBonusExpiry(world) {
  if (world.guildWarBonus && world.time.tick >= world.guildWarBonus.expiresTick) {
    world.guildWarBonus = null;
  }
}

function populationByLocation(world) {
  const pop = {};
  for (const agent of Object.values(world.agents)) {
    if (!agent.alive || agent.status === "traveling") continue;
    pop[agent.location] = (pop[agent.location] || 0) + 1;
  }
  return pop;
}

export async function tick(world) {
  advanceClock(world);
  economy.tickMarkets(world.worldSeed, world.markets, populationByLocation(world));
  decayHuntPressure(world);
  maybeGenerateOpportunity(world);
  expireOpportunities(world);
  tickGuildOverhead(world);
  tickEquipmentMaintenance(world);
  guilds.tickDues(world);
  guilds.maybeGenerateGuildContract(world);
  guilds.tickGuildContracts(world);
  guilds.maybeStartGuildWar(world);
  guilds.tickGuildWar(world);
  tickGuildWarBonusExpiry(world);
  tickGuildReputationDecay(world);

  const agentIds = Object.keys(world.agents);
  for (let i = agentIds.length - 1; i > 0; i--) {
    const j = Math.floor(world.rng() * (i + 1));
    [agentIds[i], agentIds[j]] = [agentIds[j], agentIds[i]];
  }

  for (const id of agentIds) {
    const agent = world.agents[id];
    if (!agent.alive) continue;

    decayNeeds(agent);
    decayRelationships(agent, world.time.tick);
    decayStandings(agent);
    agent.stats.maxHealth = prog.maxHealthFor(agent);
    agent.stats.health = Math.min(agent.stats.health, agent.stats.maxHealth);

    // Step 7: mismo corte que ya usa el combate (STEP 6) — un agente que
    // murio de hambre este mismo tick no debe seguir hasta decide()/execute().
    if (agent.stats.health <= 0) {
      handleDeath(world, agent, { cause: "hambre", killer: null });
      continue;
    }

    if (agent.prison) {
      processPrison(world, agent);
      continue;
    }

    if (agent.status === "incapacitated") {
      agent.stats.health = Math.min(agent.stats.maxHealth, agent.stats.health + 8);
      if (agent.stats.health > 40) agent.status = "idle";
      continue;
    }

    if (agent.pendingInvites.length) {
      const invite = agent.pendingInvites.shift();
      if (world.time.tick <= invite.expiresTick) {
        const response = respondToPartyInvite(world, agent, invite);
        agent.recentDecisions.push({
          tick: world.time.tick, goal: agent.goals[0]?.goal, situation: "invitacion de grupo recibida",
          relevantKnowledge: [], availableActions: [], selectedAction: response.accept ? "aceptar_grupo" : "declinar_grupo",
          target: invite.fromId, reasons: [response.reason], expectedOutcome: response.accept ? "combate conjunto" : "actuar por su cuenta",
        });
        if (response.accept) {
          const inviter = world.agents[invite.fromId];
          if (inviter && inviter.alive && inviter.location === agent.location) {
            resolvePartyFight(world, inviter, agent, invite.family, invite.rank);
          }
          continue; // responder a la invitacion fue el turno de este agente
        }
      }
    }

    const wasBusy = processActivity(world, agent);
    if (wasBusy) continue;

    const forced = survivalOverride(world, agent);
    let action, rationale;
    if (forced) {
      action = forced;
      const outcomes = { rest: "recuperar energia", eat: "reducir hambre", travel: "huir hacia una localizacion mas segura o con comida", use_potion: "recuperar salud de emergencia" };
      rationale = { goal: agent.goals[0]?.goal, situation: "necesidad critica", relevantKnowledge: [], availableActions: [], selectedAction: forced.type, target: null, reasons: ["instinto de supervivencia (salud/hambre critica)"], expectedOutcome: outcomes[forced.type] };
    } else {
      // La eleccion de politica (deterministic vs llm) es un dato del
      // agente (agent.policy, Experimento V3-LLM), no una rama nueva de
      // logica del motor: el World Engine sigue sin saber nada de DeepSeek,
      // presupuesto ni fallback — llm/llmDecision.js ya devuelve siempre
      // una accion valida (la de la politica determinista si el LLM no
      // participo esta vez).
      const d = agent.policy === "llm" ? await decideLlm(world, agent) : decide(world, agent);
      action = d.action;
      rationale = d.rationale;
    }

    execute(world, agent, action);

    agent.recentDecisions.push({ tick: world.time.tick, ...rationale });
    if (agent.recentDecisions.length > 20) agent.recentDecisions.shift();
    appendDecision({ agentId: agent.id, tick: world.time.tick, ...rationale });
    // Step 10: await post-decision — el motor ya decidio; solo escribe en narrative[]
    if (rationale.cf?.cfType === "A") await narrateTypeA(agent, { tick: world.time.tick, ...rationale }, world);
  }

  return world;
}

export function attachEventSink(world) {
  world.onEvent = (event) => appendEvent(event);
}

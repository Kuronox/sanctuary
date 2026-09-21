// FilteredWorldView (Experimento V3-LLM, seccion 7 del encargo): la unica
// informacion que se le muestra al LLM sobre el estado del mundo.
//
// Principio: nunca se construye nada aqui que el propio motor determinista
// (decision.js/actions.js) no use ya para razonar sobre ESTE agente. No se
// expone el objeto `world` completo, ni el estado de otros agentes salvo
// los que ya son relevantes para las acciones candidatas concretas (los que
// estan fisicamente presentes, o el lider de un gremio al que se podria
// unir) — exactamente el mismo criterio de "informacion parcial" que ya
// aplica la politica determinista existente.
import { listCandidateActions } from "../actions.js";
import { knownPricesFor } from "../knowledge.js";
import { relationshipLabel, hasSignificantBetrayal } from "../entities.js";
import { institutionOf } from "../institutions.js";
import * as prog from "../progression.js";
import * as economy from "../economy.js";
import * as guilds from "../guilds.js";

function locOf(world, id) {
  return world.worldSeed.locations.find((l) => l.id === id);
}

function agentPublicRef(world, id) {
  const a = world.agents[id];
  return a ? { id: a.id, name: a.name, class: a.class } : { id, name: "desconocido", class: null };
}

// Etiqueta legible + datos ya resueltos para cada accion candidata, en el
// MISMO orden que las recibe decision.js. El LLM elige por INDICE (1..N),
// nunca escribe la accion ni sus argumentos a mano — asi no puede inventar
// una accion ni corromper sus parametros; el motor ya valido que existan.
function describeAction(world, agent, action, index) {
  const d = action.data || {};
  let label = action.type;
  switch (action.type) {
    case "rest": label = "descansar (gratis, recupera fatiga y algo de salud)"; break;
    case "rest_inn": label = "alojarse en una posada (paga oro, recupera fatiga y salud por completo)"; break;
    case "eat": label = "comer"; break;
    case "use_potion": label = "beber una pocion curativa"; break;
    case "curar_aliado": label = `curar a ${agentPublicRef(world, d.targetId).name}`; break;
    case "travel": label = `viajar a ${locOf(world, d.to)?.name || d.to} (${d.hours}h de viaje)`; break;
    case "work": label = "trabajar en el oficio actual"; break;
    case "gather": label = "recolectar recursos locales"; break;
    case "craft": label = `fabricar ${economy.goodDef(world.worldSeed, d.good)?.name || d.good}`; break;
    case "equip_item": label = `equipar ${economy.goodDef(world.worldSeed, d.itemId)?.name || d.itemId}`; break;
    case "repair_item": label = `reparar equipo (${d.slot})`; break;
    case "trade_buy": label = `comprar ${economy.goodDef(world.worldSeed, d.good)?.name || d.good} (precio local: ${Math.round(economy.priceAt(world.worldSeed, world.markets, agent.location, d.good))})`; break;
    case "trade_sell": label = `vender ${d.qty} de ${economy.goodDef(world.worldSeed, d.good)?.name || d.good} (precio local: ${Math.round(economy.priceAt(world.worldSeed, world.markets, agent.location, d.good))})`; break;
    case "fight_monster": label = `enfrentar en solitario a un monstruo (${d.family}, rango ${d.rank})`; break;
    case "proponer_grupo": label = `pedirle ayuda a ${agentPublicRef(world, d.targetId).name} contra un monstruo peligroso (${d.family}, rango ${d.rank})`; break;
    case "talk": label = `conversar con ${agentPublicRef(world, d.targetId).name}`; break;
    case "help_agent": label = `ayudar con oro a ${agentPublicRef(world, d.targetId).name}`; break;
    case "steal": label = `intentar robarle a ${agentPublicRef(world, d.targetId).name}`; break;
    case "create_guild": label = "fundar un gremio propio"; break;
    case "join_guild": {
      const g = world.guilds[d.guildId];
      label = g ? `unirse al gremio ${g.name} (reputacion ${Math.round(g.reputation)}, cuota ${guilds.duesFor(g)}, lider ${agentPublicRef(world, g.leaderId).name})` : "unirse a un gremio";
      break;
    }
    case "leave_guild": label = "abandonar el gremio actual"; break;
    case "aportar_gremio": label = "aportar oro al tesoro del gremio"; break;
    case "malversar_tesoro": label = "tomar oro del tesoro del gremio sin autorizacion"; break;
    case "accept_guild_contract": {
      const c = world.guildContracts.find((c) => c.id === d.contractId);
      label = c ? `comprometer al gremio con el encargo "${c.type}" (recompensa ${c.reward})` : "aceptar un encargo de gremio";
      break;
    }
    case "declarar_guerra_gremios": label = "declarar la disputa territorial del gremio"; break;
    case "contribuir_guerra_gremios": label = "aportar poder a la disputa territorial en curso del gremio"; break;
    case "accept_job": {
      const o = world.opportunities.find((o) => o.id === d.oppId);
      label = o ? `aceptar el encargo: ${o.description} (recompensa ${o.reward})` : "aceptar un encargo";
      break;
    }
    case "train": label = "pagar por entrenamiento acelerado de oficio"; break;
    case "iniciar_prueba_clase": {
      const target = prog.jobDef(world.worldSeed, d.jobId);
      label = `iniciar la prueba para convertirse en ${target?.name || d.jobId}`;
      break;
    }
    case "cambiar_clase": {
      const target = prog.jobDef(world.worldSeed, d.jobId);
      label = `completar el cambio de clase a ${target?.name || d.jobId} (prueba ya cumplida)`;
      break;
    }
    default: label = action.type;
  }
  return { index, type: action.type, data: d, label };
}

// Relaciones SOLO con quienes son relevantes ahora mismo: agentes presentes
// fisicamente, objetivos de acciones candidatas, o el lider del propio
// gremio. Nunca se envian las relaciones con los otros ~65 agentes que no
// tienen nada que ver con esta decision.
function relevantRelationships(world, agent, referencedIds) {
  const out = [];
  for (const id of referencedIds) {
    if (id === agent.id) continue;
    const rel = agent.relationships[id];
    const other = world.agents[id];
    if (!other) continue;
    out.push({
      id,
      name: other.name,
      class: other.class,
      relationship: rel ? relationshipLabel(rel) : "desconocido",
      affinity: rel ? Math.round(rel.affinity) : 0,
      trust: rel ? Math.round(rel.trust) : 0,
      recuerdaTraicionSignificativa: hasSignificantBetrayal(rel),
    });
  }
  return out;
}

export function buildFilteredWorldView(world, agent) {
  const loc = locOf(world, agent.location);
  const candidates = listCandidateActions(world, agent);
  const availableActions = candidates.map((a, i) => describeAction(world, agent, a, i + 1));

  const referencedIds = new Set();
  for (const a of availableActions) {
    if (a.data.targetId) referencedIds.add(a.data.targetId);
  }
  if (agent.guildId) {
    const guild = world.guilds[agent.guildId];
    if (guild) referencedIds.add(guild.leaderId);
  }

  const jobDefCurrent = prog.jobDef(world.worldSeed, agent.progression.job.id);
  const institution = institutionOf(world.worldSeed, agent.location);
  const guild = agent.guildId ? world.guilds[agent.guildId] : null;

  const view = {
    tiempo: { dia: world.time.day, hora: world.time.hour },
    yo: {
      // Se quita cualquier etiqueta entre parentesis del nombre (ej. "(sujeto
      // de control)", usada solo en el dashboard/reportes desde el
      // Experimento V2): ningun agente sabria que es "el sujeto de control"
      // de un experimento — eso rompería el principio de no darle al LLM
      // ninguna etiqueta narrativa o de meta-conocimiento (seccion 4 y 8).
      nombre: agent.name.replace(/\s*\([^)]*\)\s*$/, ""),
      clase: jobDefCurrent?.name || agent.class,
      nivelBase: agent.progression.baseLevel,
      nivelOficio: agent.progression.job.level,
      salud: Math.round(agent.stats.health),
      saludMaxima: agent.stats.maxHealth,
      oro: Math.round(agent.gold),
      necesidades: {
        hambre: Number(agent.needs.hunger.toFixed(2)),
        fatiga: Number(agent.needs.fatigue.toFixed(2)),
        social: Number(agent.needs.social.toFixed(2)),
      },
      personalidad: Object.fromEntries(Object.entries(agent.personality).map(([k, v]) => [k, Number(v.toFixed(2))])),
      objetivos: agent.goals.map((g) => ({ objetivo: g.goal, peso: g.weight })),
      inventario: agent.inventory,
      equipo: agent.equipment,
      gremio: guild ? {
        nombre: guild.name,
        esLider: guild.leaderId === agent.id,
        reputacion: Math.round(guild.reputation),
        tesoro: Math.round(guild.treasury),
        encargoActivo: guild.activeContract ? true : false,
      } : null,
      posicionInstitucional: agent.standing,
      enPrision: !!agent.prison,
    },
    ubicacion: {
      nombre: loc.name,
      tipo: loc.type,
      seguridad: loc.safety,
      fuerzaGuardia: loc.guardStrength,
      institucion: institution ? { tipo: institution.type, entrenaClases: institution.trains } : null,
      conexiones: loc.connections.map((c) => ({ hacia: locOf(world, c.to)?.name, horas: c.hours })),
    },
    accionesDisponibles: availableActions.map(({ index, label }) => ({ indice: index, descripcion: label })),
    relacionesRelevantes: relevantRelationships(world, agent, referencedIds),
    memoriasRelevantes: [...agent.memory].sort((a, b) => b.importance - a.importance).slice(0, 6).map((m) => ({ hace: world.time.tick - m.tick, resumen: m.summary, importancia: m.importance })),
    conocimientoReciente: agent.knowledge.slice(-8).map((k) => ({ hecho: k.fact, tipo: k.type, confianza: Number((k.confidence ?? 1).toFixed(2)) })),
    preciosConocidosEnOtrosLugares: (() => {
      const seenGoods = new Set(availableActions.filter((a) => a.type === "trade_buy" || a.type === "trade_sell").map((a) => a.data.good));
      const out = [];
      for (const good of seenGoods) {
        for (const k of knownPricesFor(agent, good).slice(0, 2)) {
          out.push({ bien: good, lugar: k.data.locationId, precio: k.data.price, confianza: Number(k.confidence.toFixed(2)) });
        }
      }
      return out;
    })(),
  };

  return { view, candidates };
}

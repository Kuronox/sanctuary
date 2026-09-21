import { listCandidateActions } from "./actions.js";
import { knownPricesFor } from "./knowledge.js";
import { nextHopToward } from "./geo.js";
import { hasSignificantBetrayal } from "./entities.js";
import * as prog from "./progression.js";
import * as economy from "./economy.js";
import * as guilds from "./guilds.js";

// ---------------------------------------------------------------------------
// POLICY ADAPTER (mock / determinista basado en utilidad) — V2
//
// El cambio mas importante frente a V1: varias ramas de aqui ya NO puntuan
// un TIPO de accion igual para cualquier instancia. "travel" puntua cada
// destino segun una razon concreta (un encargo aceptado, un precio mejor
// conocido en otro lugar, un aliado que se fue para alla); "proponer_grupo"
// ya apuntaba a un agente concreto desde la generacion de candidatos.
//
// Sigue sin haber credenciales de ningun proveedor de LLM en este entorno.
// La interfaz decide(world, agent) -> { action, rationale } es la que
// cualquier adaptador real (LLM u otro) tendria que implementar para
// reemplazar esto sin tocar el resto del motor.
// ---------------------------------------------------------------------------

function goalWeight(agent, goalName) {
  const g = agent.goals.find((g) => g.goal === goalName);
  return g ? g.weight : 0;
}

// --- Puntuacion de destino concreto para "travel" -------------------------

function destinationBonus(world, agent, toLocationId) {
  let bonus = 0;
  const reasons = [];

  // 1) Encargo/mision activa: seguir la ruta mas corta hacia su destino.
  if (agent.committedJob) {
    const opp = world.opportunities.find((o) => o.id === agent.committedJob);
    if (opp && opp.status === "accepted") {
      const hop = nextHopToward(world.adjacency, agent.location, opp.destLocation || opp.originLocation);
      if (hop === toLocationId) {
        const urgency = opp.deadlineTick ? Math.max(0.3, 1 - (opp.deadlineTick - world.time.tick) / 200) : 0.5;
        bonus += 5 + urgency * 3;
        reasons.push("ruta hacia un encargo aceptado");
      }
    }
  }

  // 2) Arbitraje: llevo algo que se vende mejor en otro lugar conocido.
  for (const [good, qty] of Object.entries(agent.inventory)) {
    if (qty <= 0) continue;
    const known = knownPricesFor(agent, good);
    if (!known.length) continue;
    const here = economy.priceAt(world.worldSeed, world.markets, agent.location, good) * 0.85;
    const bestElsewhere = known
      .filter((k) => k.data.locationId !== agent.location)
      .sort((a, b) => b.data.price - a.data.price)[0];
    if (bestElsewhere && bestElsewhere.data.price > here * 1.35) {
      const hop = nextHopToward(world.adjacency, agent.location, bestElsewhere.data.locationId);
      if (hop === toLocationId) {
        bonus += 2.5 * bestElsewhere.confidence;
        reasons.push(`arbitraje: ${good} se vendia mejor en ${bestElsewhere.data.locationId}`);
      }
    }
  }

  // 3) Tiron social: un amigo de confianza se mudo hacia alla recientemente.
  const recentMoves = agent.knowledge.filter((k) => k.type === "travel_end" && k.tick > world.time.tick - 72);
  for (const k of recentMoves) {
    const otherId = k.data?.actorId;
    if (!otherId) continue;
    const rel = agent.relationships[otherId];
    if (rel && rel.affinity > 40) {
      const destLoc = k.data?.location;
      if (destLoc) {
        const hop = nextHopToward(world.adjacency, agent.location, destLoc);
        if (hop === toLocationId) {
          bonus += 0.8;
          reasons.push("un amigo se mudo hacia alla");
        }
      }
    }
  }

  return { bonus, reasons };
}

// Bono de utilidad para acciones que efectivamente avanzan la prueba de
// clase EN CURSO del agente. Sin esto, "iniciar_prueba_clase" puntua alto
// por ambicion pero luego nada empuja a craftear/cazar/curar/comerciar/
// robar/explorar mas de lo que ya se hacia por otras razones — la prueba
// se inicia y despues nunca se completa (el mismo problema de fondo que
// "aceptar un encargo no cambiaba a donde viajabas", aplicado a clases).
function trialBonus(world, agent, action) {
  const trial = agent.progression.trial;
  if (!trial) return 0;
  const target = prog.jobDef(world.worldSeed, trial.targetJobId);
  if (!target || !target.trial) return 0;
  const t = target.trial;
  switch (t.type) {
    case "craft_count":
      if (action.type === "craft") return 4;
      if (action.type === "gather") return 1.5; // reunir la materia prima que hace falta para craftear
      return 0;
    case "trade_count":
      return action.type === "trade_buy" || action.type === "trade_sell" ? 2.5 : 0;
    case "heal_count":
      return action.type === "curar_aliado" ? 4 : 0;
    case "steal_success_count":
      return action.type === "steal" ? 3 : 0;
    case "kill_count":
      return action.type === "fight_monster" && action.data.rank === "comun" ? 3.5 : 0;
    case "defeat_rank":
      if (action.type === "fight_monster" && action.data.rank === t.rank) return 4;
      if (action.type === "proponer_grupo" && action.data.rank === t.rank) return 4;
      return 0;
    case "visit_count":
      if (action.type !== "travel") return 0;
      return agent.progression.counters.visits.includes(action.data.to) ? 0 : 3.5;
    default:
      return 0;
  }
}

// Simetrico a trialBonus: si el gremio del agente tiene un encargo
// colectivo en curso, las acciones de CUALQUIER miembro que lo hagan
// avanzar reciben un empuje — sin esto, aceptar un encargo de gremio es
// una decision del lider sin ningun efecto en el comportamiento cotidiano
// del resto (el mismo problema, ya visto dos veces: encargos individuales
// en V1 que no influian el viaje, y pruebas de clase en V2 que no influian
// la accion diaria).
function guildContractBonus(world, agent, action) {
  if (!agent.guildId) return 0;
  const guild = world.guilds[agent.guildId];
  if (!guild || !guild.activeContract) return 0;
  const contract = world.guildContracts.find((c) => c.id === guild.activeContract);
  if (!contract) return 0;
  if (contract.type === "caza_gremial") {
    if (action.type === "fight_monster" && action.data.family === contract.family && action.data.rank === contract.rank) return 3;
    return 0;
  }
  if (contract.type === "recoleccion_gremial") {
    if (action.type === "gather") return 1.2; // no se elige el recurso, pero vale la pena intentarlo aqui
    if (action.type === "trade_sell" && action.data.good === contract.good) return -1.5; // no vender lo que el gremio necesita
    return 0;
  }
  if (contract.type === "fabricacion_gremial") {
    if (action.type === "craft" && action.data.good === contract.good) return 3.5;
    if (action.type === "gather") return 0.8;
    return 0;
  }
  return 0;
}

function scoreAction(world, agent, action) {
  const p = agent.personality;
  let score = trialBonus(world, agent, action);
  const reasons = [];
  if (score > 0) reasons.push("avanza la prueba de clase en curso");
  const gcBonus = guildContractBonus(world, agent, action);
  if (gcBonus) { score += gcBonus; reasons.push(gcBonus > 0 ? "avanza el encargo de gremio en curso" : "el gremio necesita esto, mejor no venderlo"); }

  switch (action.type) {
    case "rest":
      score += agent.needs.fatigue * 3;
      if (agent.stats.health < agent.stats.maxHealth * 0.5) score += 2;
      reasons.push("necesidad de descanso/salud");
      break;
    case "rest_inn":
      score += agent.needs.fatigue * 1.5 + (1 - agent.stats.health / agent.stats.maxHealth) * 2;
      score += p.greed < 0.4 ? 0.5 : -0.5; // poco codiciosos pagan por comodidad mas facil
      reasons.push("descanso pagado, mas rapido que el gratuito");
      break;
    case "eat":
      score += agent.needs.hunger * 3.5;
      reasons.push("necesidad de hambre");
      break;
    case "use_potion":
      score += (1 - agent.stats.health / agent.stats.maxHealth) * 4;
      reasons.push("salud baja, tiene pocion disponible");
      break;
    case "curar_aliado":
      score += p.empathy * 2.5 + goalWeight(agent, "ayudar_otros") * 1.5;
      reasons.push("aliado herido cerca, empatia/objetivo de ayudar");
      break;
    case "travel": {
      const { bonus, reasons: destReasons } = destinationBonus(world, agent, action.data.to);
      score += goalWeight(agent, "exploracion") * 1.2;
      score += p.riskTolerance * 0.4;
      score -= agent.needs.fatigue * 1.5;
      score -= 0.3;
      score += bonus;
      reasons.push(...(destReasons.length ? destReasons : ["disposicion general a viajar/explorar"]));
      break;
    }
    case "work": {
      score += goalWeight(agent, "riqueza") * 2 + goalWeight(agent, "maestria_oficio") * 1.5;
      score += p.ambition * 0.8;
      score -= agent.needs.fatigue * 1.2;
      const economicPressure = Math.max(0, 2.5 * (1 - agent.gold / 15));
      score += economicPressure;
      reasons.push("objetivo de riqueza/maestria");
      break;
    }
    case "gather":
      score += goalWeight(agent, "riqueza") * 1.2 + p.riskTolerance * 0.6;
      score -= agent.needs.fatigue * 1.2;
      reasons.push("recoleccion de recursos vendibles");
      break;
    case "craft": {
      const def = economy.goodDef(world.worldSeed, action.data?.good);
      if (def?.craftedFrom) {
        // Coste de oportunidad: cuanto obtendria vendiendo los materiales
        const matSellValue = Object.entries(def.craftedFrom).reduce(
          (sum, [mat, qty]) => sum + economy.priceAt(world.worldSeed, world.markets, agent.location, mat) * 0.85 * qty,
          0
        );
        // Valor del item fabricado si lo vende
        const craftSellValue = economy.priceAt(world.worldSeed, world.markets, agent.location, action.data.good) * 0.85;
        // Margen: positivo = fabricar vale mas que vender la materia prima
        const margin = craftSellValue - matSellValue;
        score += margin / 10;

        // Utilidad de equipo: slot vacio = incentivo fuerte a fabricar y equipar
        const slotMap = { equipo_arma: "weapon", equipo_armadura: "armor", equipo_herramienta: "tool" };
        const slot = slotMap[def.category];
        if (slot && !agent.equipment[slot]) {
          score += 1.5;
          reasons.push("el slot de equipo esta vacio");
        } else if (slot) {
          score -= 0.5; // ya tiene este slot cubierto, menos urgente
        }
      }
      // Motivaciones del agente (reducidas: el margen ya captura la logica economica)
      score += goalWeight(agent, "maestria_oficio") * 1.0 + goalWeight(agent, "riqueza") * 0.4;
      reasons.push("craft por instancia: margen y utilidad de equipo");
      break;
    }
    case "equip_item":
      score += 2.5; // equiparse siempre que se pueda es casi estrictamente mejor
      reasons.push("mejora de equipo disponible");
      break;
    case "repair_item":
      score += 1.8;
      reasons.push("equipo desgastado, riesgo de que se rompa");
      break;
    case "trade_buy":
      score += p.greed * 0.4 + goalWeight(agent, "riqueza") * 0.3;
      break;
    case "trade_sell": {
      score += 1.3 + p.greed * 0.5;
      const known = knownPricesFor(agent, action.data.good).filter((k) => k.data.locationId !== agent.location);
      const bestElsewhere = known.sort((a, b) => b.data.price - a.data.price)[0];
      const here = economy.priceAt(world.worldSeed, world.markets, agent.location, action.data.good) * 0.85;
      // Cuanto puede pagar de verdad el mercado local, no solo el precio de
      // catalogo: una reserva casi seca (tipico de zonas salvajes que nunca
      // se reponen) hace que "vender aqui" sea una opcion vacia aunque el
      // precio nominal se vea bien. Sin esto, un agente puede intentar
      // vender el mismo bien decenas de veces seguidas en un mercado que ya
      // no tiene con que pagarle, sin que el sistema lo registre como una
      // señal real (se vio jugando: 52 intentos fallidos seguidos de un
      // mismo agente en la misma localizacion).
      const market = world.markets[agent.location];
      const reserveStarved = market.goldReserve < here * 1.5;
      if (reserveStarved) {
        score -= 3;
        reasons.push("el mercado local ya no tiene fondos reales para pagar esto");
      } else if (bestElsewhere && bestElsewhere.data.price > here * 1.35 && bestElsewhere.confidence > 0.3) {
        score -= 1.2; // mejor aguantar y llevarlo a vender a otro lado
        reasons.push("precio local mediocre comparado con lo que sabe de otro lugar");
      } else {
        reasons.push("liquidar inventario a buen precio local");
      }
      // no malvender la materia prima que su propia prueba de clase necesita
      const trial = agent.progression.trial;
      if (trial) {
        const target = prog.jobDef(world.worldSeed, trial.targetJobId);
        const recipeGoods = world.worldSeed.goods.filter((g) => g.craftedFrom && Object.keys(g.craftedFrom).includes(action.data.good));
        if (target?.trial?.type === "craft_count" && recipeGoods.length) {
          score -= 2;
          reasons.push("necesita este material para craftear y completar su prueba de clase");
        }
      }
      break;
    }
    case "fight_monster": {
      const def = world.worldSeed.monsters[action.data.family][action.data.rank];
      const power = prog.effectiveCombatPower(world.worldSeed, agent) - prog.underleveledPenalty(agent, def.minBaseLevel);
      const dangerFactor = power > def.power * 1.15 ? 1 : power > def.power * 0.75 ? 0.55 : 0.15;
      const rankWeight = action.data.rank === "jefe" ? 1.8 : action.data.rank === "elite" ? 1.3 : 1;
      score += dangerFactor * rankWeight * (1.4 + p.riskTolerance * 2 + goalWeight(agent, "prestigio"));
      score -= (1 - p.riskTolerance) * 1.5;
      if (def.partyRecommended) score -= 2.2; // mejor pedir ayuda que ir solo
      if (agent.stats.health < agent.stats.maxHealth * 0.4) score -= 3;
      reasons.push(`riesgo/beneficio de combate (${action.data.rank}) segun poder efectivo y tolerancia al riesgo`);
      break;
    }
    case "proponer_grupo": {
      const target = world.agents[action.data.targetId];
      const rel = agent.relationships[action.data.targetId];
      score += 2 + (rel ? rel.affinity / 40 : 0) + p.sociability * 0.5;
      score += goalWeight(agent, "prestigio") * 0.8;
      if (target && target.guildId && target.guildId === agent.guildId) score += 1.2; // confianza institucional entre compañeros de gremio
      reasons.push("contenido peligroso requiere ayuda; aliado cercano disponible");
      break;
    }
    case "talk": {
      score += p.sociability * 2 + goalWeight(agent, "pertenencia") * 1.5;
      score += agent.needs.social * 1.5;
      const rel = agent.relationships[action.data.targetId];
      if (rel && rel.affinity < -20) score -= 2;
      reasons.push("necesidad social / relacion existente");
      break;
    }
    case "help_agent": {
      const rel = agent.relationships[action.data.targetId];
      const target = world.agents[action.data.targetId];
      score += p.empathy * 2.5 + goalWeight(agent, "ayudar_otros") * 2;
      if (rel && rel.affinity > 20) score += 1;
      // Instancia concreta, no "ayudar = bueno": importa si esta persona
      // en particular de verdad lo necesita. Sin esto, ayudar terminaba
      // premiando a quien ya le sobraba oro simplemente por estar cerca y
      // caer bien — la riqueza pasiva por popularidad documentada en los
      // Experimentos B y C. Ahora la necesidad real del destinatario pesa
      // tanto como la simpatia que se le tiene.
      if (target) {
        const need = Math.max(0, Math.min(1, 1 - target.gold / 40));
        score += need * 2.5;
        if (target.gold > 80) score -= 2; // ya le sobra, esto seria derrochar generosidad
      }
      // Una traicion recordada pesa mas que la afinidad ya recuperada por
      // decaimiento o por interacciones triviales posteriores.
      if (hasSignificantBetrayal(rel)) {
        score -= 3;
        reasons.push("recuerda una traicion de esta persona, aunque la relacion numerica se haya suavizado");
      }
      if (agent.gold < 15) score -= 3;
      reasons.push("empatia, necesidad real del destinatario, objetivo de ayudar a otros");
      break;
    }
    case "steal": {
      const rel = agent.relationships[action.data.targetId];
      const target = world.agents[action.data.targetId];
      const guardRisk = world.worldSeed.locations.find((l) => l.id === agent.location).guardStrength;
      score += p.greed * 2.5 - p.empathy * 3 + goalWeight(agent, "riqueza") * 1;
      score += p.riskTolerance * 0.5;
      score += goalWeight(agent, "maestria_oficio") * 0.7; // robar tambien progresa el oficio, ver progression.js
      score -= guardRisk * 2.5; // la guardia local desalienta el robo de verdad
      if (rel && rel.affinity > 10) score -= 4;
      if (rel && rel.affinity <= -30) score -= 5;
      if (target && target.gold < 5) score -= 2;
      if (agent.gold > 60) score -= 1;
      if (agent.prison) score -= 100;
      reasons.push("codicia vs empatia, relacion con el objetivo, riesgo de guardia local, y progreso de oficio");
      break;
    }
    case "create_guild":
      score += goalWeight(agent, "prestigio") * 2 + p.ambition * 1.5;
      if (agent.gold < 40) score -= 1;
      reasons.push("ambicion de fundar un gremio propio");
      break;
    case "join_guild": {
      // Instancia concreta, no "unirse a un gremio" generico: cada gremio
      // candidato se compara por sus propios atributos (Sanctuary V2,
      // seccion "decisiones por instancia"). El ejemplo del encargo — Guild
      // A con buena reputacion y un amigo dentro vs. Guild B barato y mejor
      // para el oficio propio vs. quedarse independiente — es literalmente
      // esta cuenta.
      const guild = world.guilds[action.data.guildId];
      const dues = guilds.duesFor(guild);
      const leaderRel = agent.relationships[guild.leaderId];
      const spec = guilds.guildSpecialization(world, guild);
      score += goalWeight(agent, "pertenencia") * 1.6 + p.sociability * 0.7;
      score += (guild.reputation / 100) * 2.5; // buena o mala fama, pesa de verdad
      if (leaderRel) score += (leaderRel.affinity / 100) * 2; // conoce/confia (o no) en quien manda ahi
      if (hasSignificantBetrayal(leaderRel)) score -= 4; // no se une a quien lo traiciono, aunque hoy la afinidad se vea neutral
      // Si el lider SABE que este agente malverso en el pasado (lo vio o lo oyo),
      // baja el score. Solo aplica si tiene el conocimiento concreto — no es
      // una reputacion global, es informacion local que puede o no haber llegado.
      const leaderAgent = world.agents[guild.leaderId];
      if (leaderAgent) {
        const leaderKnowsEmbezzle = leaderAgent.knowledge.some(
          (k) => k.type === "malversacion_descubierta" &&
                 k.confidence > 0.3 &&
                 (k.data?.actorId === agent.id || k.fact?.includes(agent.name))
        );
        if (leaderKnowsEmbezzle) score -= 4;
      }
      if (spec && spec === agent.class) score += 1.5; // se especializa en lo mismo que el
      if (dues > agent.gold * 0.3) score -= 1.5; // la cuota le pesa de verdad
      if (guild.treasury < 5) score -= 1; // gremio al borde de la insolvencia, mal momento para entrar
      if (guild.activeContract) score += 0.6; // gremio activo, con encargos en marcha
      score -= p.sociability < 0.3 ? 1 : 0; // muy poco sociable: prefiere quedarse independiente por defecto
      reasons.push(`evalua ${guild.name} en concreto: reputacion ${Math.round(guild.reputation)}, cuota ${dues}, especializacion ${spec || "ninguna"}`);
      break;
    }
    case "leave_guild": {
      const guild = world.guilds[agent.guildId];
      score += (1 - p.loyalty) * 1.2;
      if (guild) {
        if (guild.reputation < -20) score += 1; // gremio desprestigiado, razon real para irse
        if (guild.treasury <= 0) score += 0.6; // insolvente, riesgo de colapso inminente
        if (guild.leaderId === agent.id && guild.members.length > 1) score -= 0.8; // el liderazgo pesa: no se abandona tan facil
      }
      reasons.push("baja lealtad al gremio actual, o el gremio ya no rinde lo que rendia");
      break;
    }
    case "aportar_gremio":
      score += p.loyalty * 1.8 + goalWeight(agent, "pertenencia") * 0.5;
      reasons.push("lealtad al gremio");
      break;
    case "malversar_tesoro":
      score += p.greed * 2.2 - p.loyalty * 2 - p.empathy * 1;
      reasons.push("codicia vs lealtad al gremio");
      break;
    case "accept_guild_contract": {
      const contract = world.guildContracts.find((c) => c.id === action.data.contractId);
      const guild = world.guilds[agent.guildId];
      const capacity = guild.members.reduce((s, id) => s + (world.agents[id] ? prog.effectiveCombatPower(world.worldSeed, world.agents[id]) : 0), 0);
      const feasible = contract.type !== "caza_gremial" || capacity > (world.worldSeed.monsters[contract.family]?.[contract.rank]?.power || 0) * 0.5;
      score += p.ambition * 1.5 + goalWeight(agent, "prestigio") * 1 + Math.min(2.5, contract.reward / 25);
      if (!feasible) score -= 3; // liderar un encargo que el gremio no puede cumplir es mal calculo
      reasons.push("decision de lider: comprometer al gremio con un encargo concreto");
      break;
    }
    case "declarar_guerra_gremios":
      score += p.ambition * 1.6 + goalWeight(agent, "prestigio") * 1.5 + p.riskTolerance * 0.6;
      reasons.push("decision de lider: apostar recursos del gremio por el control de una zona");
      break;
    case "contribuir_guerra_gremios":
      score += p.loyalty * 1.6 + goalWeight(agent, "pertenencia") * 1 + p.riskTolerance * 0.4;
      score -= agent.needs.fatigue * 0.8;
      reasons.push("lealtad al gremio en la disputa declarada");
      break;
    case "accept_job": {
      const opp = world.opportunities.find((o) => o.id === action.data.oppId);
      score += goalWeight(agent, "riqueza") * 1.5 + p.riskTolerance * 0.4;
      score += Math.min(3, (opp.reward || 0) / 12);
      if (agent.committedJob) score -= 2; // ya tiene un compromiso, no acumula a la ligera
      reasons.push("oportunidad economica publicada, recompensa evaluada");
      break;
    }
    case "train":
      score += goalWeight(agent, "maestria_oficio") * 2.2 + p.ambition * 0.8;
      if (agent.gold < 20) score -= 1.5;
      reasons.push("pagar por progreso de oficio mas rapido");
      break;
    case "iniciar_prueba_clase": {
      score += p.ambition * 1.8 + goalWeight(agent, "prestigio") * 1.2 + goalWeight(agent, "maestria_oficio") * 1;
      const targetDef = prog.jobDef(world.worldSeed, action.data.jobId);
      const readiness = prog.lifetimeTrialReadiness(agent, targetDef);
      score += readiness * 4; // ya viene haciendo justo lo que esta prueba pide
      // Si ya hay una prueba distinta en curso, empezar otra la abandona
      // (startTrial sobreescribe el progreso). Sin este freno, dos pruebas
      // con puntuaciones parecidas pueden turnarse cada pocos ticks sin que
      // ninguna llegue a terminarse — se vio jugando: 7.864 inicios de
      // prueba en 365 dias, casi uno cada 27 ticks por agente, sin que la
      // dominancia de clases mejorara. Cambiar de prueba solo vale la pena
      // si la nueva ya esta mucho mas cerca de completarse que perder lo
      // que se llevaba avanzado en la actual.
      if (agent.progression.trial && agent.progression.trial.targetJobId !== action.data.jobId) {
        score -= 6;
        reasons.push("abandonaria una prueba de clase ya en curso");
      }
      reasons.push(readiness > 0.3 ? `elegible y ya viene demostrando esto (${Math.round(readiness * 100)}% del camino recorrido)` : "elegible para especializarse, inicia la prueba");
      break;
    }
    case "cambiar_clase":
      score += 6 + p.ambition * 2; // completar la prueba casi siempre vale la pena
      reasons.push("prueba de clase completada");
      break;
    default:
      break;
  }

  score += (world.rng() - 0.5) * 0.6;
  return { action, score, reasons };
}

export function decide(world, agent) {
  const candidates = listCandidateActions(world, agent);
  if (candidates.length === 0) {
    return { action: { type: "rest" }, rationale: buildRationale(world, agent, [], null) };
  }
  const scored = candidates.map((a) => scoreAction(world, agent, a));
  scored.sort((a, b) => b.score - a.score);

  let chosen = scored[0];
  if (scored.length > 1 && world.rng() < 0.08) chosen = scored[1];

  const rationale = buildRationale(world, agent, scored, chosen);
  return { action: chosen.action, rationale };
}

// Decision de aceptar/declinar una invitacion a grupo, resuelta cuando le
// toca el turno al invitado (ver world.js). No es una accion candidata mas
// porque depende de un evento que otro agente disparo, no de su propio
// barrido de opciones.
export function respondToPartyInvite(world, agent, invite) {
  const inviter = world.agents[invite.fromId];
  if (!inviter || !inviter.alive) return { accept: false, reason: "quien invito ya no esta disponible" };
  const rel = agent.relationships[invite.fromId];
  const trust = rel ? rel.trust : 0;
  const affinity = rel ? rel.affinity : 0;
  const def = world.worldSeed.monsters[invite.family][invite.rank];
  const combined = prog.effectiveCombatPower(world.worldSeed, agent) + prog.effectiveCombatPower(world.worldSeed, inviter);
  const winChanceProxy = combined / Math.max(1, def.power);
  let score = trust / 60 + affinity / 80 + agent.personality.riskTolerance * 0.6 + agent.personality.sociability * 0.3;
  score += Math.min(1.2, winChanceProxy - 1);
  score -= agent.needs.fatigue * 0.5;
  if (agent.guildId && agent.guildId === inviter.guildId) score += 0.25; // confianza institucional de base entre compañeros
  const betrayed = hasSignificantBetrayal(rel);
  if (betrayed) score -= 1.2; // confiarle la vida a quien ya lo traiciono es otra cosa que solo hablar con el
  const accept = score > 0.55;
  return {
    accept,
    reason: accept
      ? `confianza en ${inviter.name} y buenas probabilidades combinadas`
      : betrayed
        ? `no confia en ${inviter.name} por lo que le hizo antes, mas alla de la afinidad actual`
        : `poca confianza en ${inviter.name} o probabilidades combinadas pobres`,
  };
}

function buildRationale(world, agent, scored, chosen) {
  const topGoal = agent.goals[0]?.goal;
  const situation = `En ${agent.location}, hambre=${agent.needs.hunger.toFixed(2)}, fatiga=${agent.needs.fatigue.toFixed(2)}, salud=${agent.stats.health}/${agent.stats.maxHealth}, oro=${Math.round(agent.gold)}, oficio=${agent.class} (nivel ${agent.progression.job.level}), nivel base=${agent.progression.baseLevel}`;
  const relevantKnowledge = agent.knowledge.slice(-3).map((k) => k.fact);
  return {
    goal: topGoal,
    situation,
    relevantKnowledge,
    availableActions: scored.slice(0, 6).map((s) => ({ type: s.action.type, target: actionTarget(s.action), score: Math.round(s.score * 100) / 100 })),
    selectedAction: chosen ? chosen.action.type : "rest",
    target: chosen ? actionTarget(chosen.action) : null,
    reasons: chosen ? chosen.reasons : ["sin candidatos disponibles"],
    expectedOutcome: expectedOutcome(chosen ? chosen.action.type : "rest"),
  };
}

export function actionTarget(action) {
  const d = action.data || {};
  return d.targetId || d.to || d.jobId || d.oppId || d.guildId || d.contractId || d.good || null;
}

export function expectedOutcome(type) {
  const map = {
    rest: "reducir fatiga y recuperar salud",
    rest_inn: "recuperar fatiga y salud rapido a cambio de oro",
    eat: "reducir hambre",
    use_potion: "recuperar salud de inmediato",
    curar_aliado: "curar a otro agente y mejorar la relacion",
    travel: "cambiar de localizacion por una razon concreta",
    work: "ganar oro y progresar en el oficio",
    gather: "obtener recursos",
    craft: "producir un bien util",
    equip_item: "mejorar capacidad de combate/recoleccion",
    repair_item: "evitar que el equipo se rompa",
    trade_buy: "adquirir un bien",
    trade_sell: "obtener oro por inventario",
    fight_monster: "ganar oro/botin/experiencia o sufrir daño",
    proponer_grupo: "conseguir ayuda para un enemigo peligroso",
    talk: "mejorar relacion social y posiblemente obtener informacion",
    help_agent: "mejorar relacion, perder oro",
    steal: "ganar oro con riesgo de dañar la relacion, la reputacion o ser arrestado",
    create_guild: "fundar un gremio propio",
    join_guild: "unirse a un gremio existente",
    leave_guild: "independizarse de un gremio",
    aportar_gremio: "fortalecer el tesoro del gremio",
    malversar_tesoro: "ganar oro a costa de la confianza del gremio",
    accept_job: "comprometerse a una recompensa futura concreta",
    train: "progreso de oficio acelerado a cambio de oro",
    iniciar_prueba_clase: "empezar el camino hacia una nueva clase",
    cambiar_clase: "convertirse formalmente en la nueva clase",
    accept_guild_contract: "comprometer al gremio con un encargo colectivo",
    declarar_guerra_gremios: "apostar recursos del gremio por el control de una zona",
    contribuir_guerra_gremios: "sumar poder propio a la disputa de gremios en curso",
  };
  return map[type] || "desconocido";
}

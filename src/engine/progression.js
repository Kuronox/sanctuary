// ---------------------------------------------------------------------------
// PROGRESION (Sanctuary V2)
//
// Dos ejes deliberadamente separados, tal como pide el encargo:
//
//  - Nivel Base: progreso amplio del personaje. Sube lento, con retornos
//    decrecientes, y afecta salud maxima y el riesgo real de contenido
//    peligroso (no es decorativo: `world.js` lo usa para penalizar combates
//    para los que el agente "no esta listo").
//
//  - Nivel de Oficio (Job): maestria en el oficio ACTUAL especificamente.
//    Tambien con retornos decrecientes. Alimenta bonos propios del oficio
//    (poder de combate, descuento de reparacion, menor impacto de mercado,
//    bonus de curacion, sigilo, capacidad de conocimiento...) definidos en
//    `world_seed.json:jobs[].perJobLevel`. Cambiar de oficio no resetea el
//    Nivel Base, pero el nuevo oficio empieza su propio contador de XP.
//
// El cambio de clase (tier 0 -> 1 -> 2) requiere: nivel de oficio suficiente,
// a veces reputacion institucional minima, y completar una "prueba" concreta
// (matar cierto tipo/rango de monstruos, visitar N lugares, fabricar N
// objetos, comerciar N veces, curar N veces, robar con exito N veces, o
// derrotar a un rango superior de monstruo) — un evento real del mundo, no
// un boton de menu.
// ---------------------------------------------------------------------------

export function jobXpForLevel(level) {
  return Math.round(14 * Math.pow(level, 1.65));
}

export function baseXpForLevel(level) {
  return Math.round(45 * Math.pow(level, 1.55));
}

export function jobDef(worldSeed, jobId) {
  return worldSeed.jobs.find((j) => j.id === jobId);
}

export function addJobXp(agent, amount, tick, world) {
  const p = agent.progression;
  p.job.xp += amount;
  let leveled = false;
  while (p.job.xp >= jobXpForLevel(p.job.level)) {
    p.job.xp -= jobXpForLevel(p.job.level);
    p.job.level += 1;
    leveled = true;
  }
  return leveled;
}

export function addBaseXp(agent, amount) {
  const p = agent.progression;
  p.baseXp += amount;
  let leveled = false;
  while (p.baseXp >= baseXpForLevel(p.baseLevel)) {
    p.baseXp -= baseXpForLevel(p.baseLevel);
    p.baseLevel += 1;
    leveled = true;
  }
  return leveled;
}

export function jobBonus(worldSeed, agent, key) {
  const def = jobDef(worldSeed, agent.progression.job.id);
  if (!def || !def.perJobLevel || !(key in def.perJobLevel)) return 0;
  return def.perJobLevel[key] * (agent.progression.job.level - 1);
}

export function effectiveCombatPower(worldSeed, agent) {
  const def = jobDef(worldSeed, agent.progression.job.id);
  const base = (def ? def.combatBase : 3) * 3;
  const growth = jobBonus(worldSeed, agent, "combatPower");
  let weaponBonus = 0;
  const weapon = agent.equipment.weapon;
  if (weapon && weapon.durability > 0) {
    const def2 = worldSeed.goods.find((g) => g.id === weapon.itemId);
    weaponBonus = def2 ? def2.combatPowerBonus : 0;
  }
  return Math.round(base + growth + weaponBonus);
}

export function maxHealthFor(agent) {
  return 80 + agent.progression.baseLevel * 4;
}

// Penalizacion de combate si el agente entra a contenido para el que el
// mundo recomienda un Nivel Base mayor. No es un muro duro (seccion 10/12
// del encargo pide "no prohibir simplemente"): el agente PUEDE intentarlo,
// pero con desventaja real y proporcional a la brecha.
export function underleveledPenalty(agent, minBaseLevel) {
  if (!minBaseLevel) return 0;
  const gap = minBaseLevel - agent.progression.baseLevel;
  return gap > 0 ? gap * 1.5 : 0;
}

// ---- Step 15: valor de un arma segun las derrotas que el agente recuerda ----
// Funciones puras, compartidas por decision.js (valorar la compra) y
// actions.js (reservar el arma que se necesita). No usan el generador de azar.

// Probabilidad exacta de perder una pelea individual, enumerando las 63
// combinaciones de azar de resolveSoloFight() (actions.js): agente -3..+5,
// monstruo -2..+4. Repite esa regla a proposito; si el combate cambia, el test
// de concordancia de equipment_purchase.test.js debe fallar.
export function soloLossProbability(power, monsterDef, agent) {
  const base = power - underleveledPenalty(agent, monsterDef.minBaseLevel);
  let losses = 0;
  for (let a = -3; a <= 5; a++) {
    for (let m = -2; m <= 4; m++) {
      let p = base + a;
      if (monsterDef.partyRecommended) p *= 0.55;
      if (p < monsterDef.power + m) losses++;
    }
  }
  return losses / 63;
}

// Misma ventana que la memoria de derrotas del Step 14 (DEFEAT_WINDOW en
// decision.js). Esta duplicada porque decision.js importa este archivo y no
// al reves; el caso U9 de equipment_purchase.test.js comprueba que coinciden.
const DEFEAT_MEMORY_WINDOW = 168;

// Mejora por arma, en [0,1]: por cada derrota individual recordada en la
// ventana, cuanto bajaria la probabilidad de perder contra ese mismo monstruo
// llevando `weaponItemId`, pesado por lo reciente del recuerdo. No mira el
// inventario ni lo que el agente lleva equipado.
export function weaponGain(worldSeed, agent, tick, weaponItemId) {
  const weaponDef = worldSeed.goods.find((g) => g.id === weaponItemId);
  if (!weaponDef || !weaponDef.combatPowerBonus) return 0;
  const unarmed = { ...agent, equipment: { ...agent.equipment, weapon: null } };
  const armed = { ...agent, equipment: { ...agent.equipment, weapon: { itemId: weaponItemId, durability: 1 } } };
  const powerWithout = effectiveCombatPower(worldSeed, unarmed);
  const powerWith = effectiveCombatPower(worldSeed, armed);
  let total = 0;
  for (const m of agent.memory) {
    if (!m.family || !m.rank || !m.tags?.includes("derrota")) continue;
    const age = tick - m.tick;
    if (age > DEFEAT_MEMORY_WINDOW) continue;
    const monster = worldSeed.monsters[m.family]?.[m.rank];
    if (!monster) continue;
    const gain = soloLossProbability(powerWithout, monster, agent) - soloLossProbability(powerWith, monster, agent);
    total += (1 - age / DEFEAT_MEMORY_WINDOW) * gain;
  }
  return Math.min(1, total);
}

function ensureCounters(agent) {
  if (!agent.progression.counters) {
    agent.progression.counters = { killsComun: 0, killsElite: 0, killsJefe: 0, crafts: 0, trades: 0, heals: 0, stealSuccess: 0, visits: [] };
  }
  return agent.progression.counters;
}

export function recordCounter(agent, key, value) {
  const c = ensureCounters(agent);
  if (key === "visits") {
    if (!c.visits.includes(value)) c.visits.push(value);
  } else {
    c[key] = (c[key] || 0) + 1;
  }
}

function trialProgress(agent, trial) {
  const c = ensureCounters(agent);
  const start = agent.progression.trial ? agent.progression.trial.startCounters : {};
  switch (trial.type) {
    case "kill_count":
      return c.killsComun - (start.killsComun || 0);
    case "defeat_rank":
      return trial.rank === "jefe" ? c.killsJefe - (start.killsJefe || 0) : c.killsElite - (start.killsElite || 0);
    case "visit_count":
      return c.visits.length;
    case "craft_count":
      return c.crafts - (start.crafts || 0);
    case "trade_count":
      return c.trades - (start.trades || 0);
    case "heal_count":
      return c.heals - (start.heals || 0);
    case "steal_success_count":
      return c.stealSuccess - (start.stealSuccess || 0);
    case "knowledge_count":
      return agent.knowledge.length;
    default:
      return 0;
  }
}

// Progreso DE POR VIDA hacia una prueba que todavia no se inicio (sin restar
// ningun punto de partida). Sirve para que "empezar una prueba" no sea una
// puntuacion generica identica para cualquier clase disponible: un agente
// que ya robo con exito varias veces esta, de hecho, mucho mas cerca de
// calificar como picaro que de calificar como erudito desde cero, y eso
// deberia pesar en cual prueba elige empezar. Sin esto se vio jugando la
// simulacion que ningun agente de la poblacion llegaba nunca a clase
// criminal en 365 dias: la prueba de erudito (casi pasiva) siempre se
// ganaba la carrera antes de que el robo tuviera ocasion de contar, porque
// solo se puede perseguir una prueba a la vez y la eleccion de cual
// arrancar no consideraba cuanto camino ya tenia recorrido cada una.
export function lifetimeTrialReadiness(agent, jobDefTarget) {
  if (!jobDefTarget.trial) return 0;
  const c = ensureCounters(agent);
  const t = jobDefTarget.trial;
  let have = 0;
  switch (t.type) {
    case "kill_count": have = c.killsComun; break;
    case "defeat_rank": have = t.rank === "jefe" ? c.killsJefe : c.killsElite; break;
    case "visit_count": have = c.visits.length; break;
    case "craft_count": have = c.crafts; break;
    case "trade_count": have = c.trades; break;
    case "heal_count": have = c.heals; break;
    case "steal_success_count": have = c.stealSuccess; break;
    // "knowledge_count" (Erudito) se acumula solo por existir y socializar,
    // no por una accion deliberada — darle el mismo bono de "ya venia
    // haciendo esto" que a las demas pruebas produce el efecto contrario al
    // buscado (se probo: la dominancia de Erudito empeoro en vez de
    // repartirse, porque cualquiera llega con el conocimiento casi al tope
    // sin haberlo elegido). Se excluye a proposito.
    case "knowledge_count": return 0;
    default: have = 0;
  }
  return Math.min(1, have / t.count);
}

// Devuelve la definicion del siguiente oficio elegible (o null) y si su
// prueba ya esta en curso / completa. El motor de decision usa esto para
// ofrecer la accion "iniciar_prueba_de_clase" / "completar_cambio_de_clase"
// solo cuando tiene sentido real.
export function nextClassOptions(worldSeed, agent) {
  return worldSeed.jobs.filter((j) => j.from === agent.progression.job.id);
}

export function meetsRequirement(worldSeed, agent, jobDefTarget) {
  const req = jobDefTarget.requirement || {};
  if (req.novatoLevel && agent.progression.job.id === "novato" && agent.progression.job.level < req.novatoLevel) return false;
  if (req.jobLevel && agent.progression.job.level < req.jobLevel) return false;
  if (req.standingInstitution) {
    const standing = agent.standing[req.standingInstitution] || 0;
    if (standing < req.standingMin) return false;
  }
  return true;
}

export function trialStatus(agent, jobDefTarget) {
  if (!jobDefTarget.trial) return { started: true, done: true, have: 0, need: 0 };
  const isActiveTarget = agent.progression.trial && agent.progression.trial.targetJobId === jobDefTarget.id;
  if (!isActiveTarget) return { started: false, done: false, have: 0, need: jobDefTarget.trial.count };
  const have = trialProgress(agent, jobDefTarget.trial);
  return { started: true, have, need: jobDefTarget.trial.count, done: have >= jobDefTarget.trial.count };
}

export function startTrial(agent, jobDefTarget) {
  agent.progression.trial = {
    targetJobId: jobDefTarget.id,
    startCounters: { ...ensureCounters(agent) },
  };
}

export function applyClassChange(worldSeed, agent, jobDefTarget, tick) {
  agent.progression.history.push({ jobId: agent.progression.job.id, tick, finalLevel: agent.progression.job.level });
  agent.progression.job = { id: jobDefTarget.id, level: 1, xp: 0 };
  agent.progression.trial = null;
  agent.class = jobDefTarget.id;
}

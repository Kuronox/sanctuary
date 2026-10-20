import { pick, randInt } from "./rng.js";

// Nombres originales generados para esta simulacion (no derivados de ninguna obra).
const FIRST_NAMES = [
  "Arin", "Belka", "Corwen", "Dessa", "Eiran", "Fenna", "Gorrik", "Halda",
  "Isvel", "Jorun", "Kelas", "Lyssa", "Morden", "Nyra", "Osk", "Petra",
  "Quilan", "Renna", "Sorin", "Talyn", "Ulra", "Varik", "Wenna", "Yosef",
  "Zeda", "Brannok", "Cirya", "Doran", "Elsvet", "Farro", "Kuro", "Chon", "Hilda",
];

const EPITHETS = [
  "del Norte", "el Callado", "la Rapida", "de Fangoso", "el Viejo", "la Errante",
  "el Manco", "de Sauce", "la Gris", "el Tuerto", "de las Colinas", "la Sabia", "el Audaz",
];

export function generateAgentName(rng, used) {
  let name;
  let tries = 0;
  do {
    const first = pick(rng, FIRST_NAMES);
    const useEpithet = rng() < 0.35;
    name = useEpithet ? `${first} ${pick(rng, EPITHETS)}` : first;
    tries++;
  } while (used.has(name) && tries < 50);
  used.add(name);
  return name;
}

// Rasgos de personalidad en [0,1]. No son visibles para otros agentes;
// solo influyen en la funcion de utilidad de decision de SU PROPIO agente.
// En V2 todos los agentes nacen "Novato" mecanicamente (ver progression.js),
// pero conservan una variacion de personalidad tan rica como en V1: el sesgo
// de un oficio de nivel 1 elegido al azar se usa solo como "temperamento de
// fabrica", no como clase real.
export function generatePersonality(rng, flavorBias) {
  const base = () => Math.min(1, Math.max(0, rng() * 0.6 + rng() * 0.4));
  const traits = {
    ambition: base(),
    sociability: base(),
    riskTolerance: base(),
    greed: base(),
    loyalty: base(),
    empathy: base(),
  };
  const bias = flavorBias || {};
  for (const [k, v] of Object.entries(bias)) {
    traits[k] = Math.min(1, (traits[k] + v) / 2 + 0.1);
  }
  return traits;
}

const GOAL_POOL = [
  "riqueza", "seguridad", "prestigio", "independencia", "pertenencia",
  "exploracion", "maestria_oficio", "vida_tranquila", "venganza", "ayudar_otros",
];

export function generateGoals(rng, personality) {
  // 1 objetivo primario + 1 secundario, sesgados (no aleatorios puros) por personalidad.
  const weights = GOAL_POOL.map((g) => {
    let w = rng();
    if (g === "riqueza") w += personality.greed;
    if (g === "prestigio") w += personality.ambition;
    if (g === "exploracion") w += personality.riskTolerance;
    if (g === "vida_tranquila") w += 1 - personality.ambition;
    if (g === "ayudar_otros") w += personality.empathy;
    if (g === "pertenencia") w += personality.sociability;
    if (g === "independencia") w += 1 - personality.sociability;
    return { goal: g, w };
  });
  weights.sort((a, b) => b.w - a.w);
  return [
    { goal: weights[0].goal, weight: 1.0 },
    { goal: weights[1].goal, weight: 0.5 },
  ];
}

export function createAgent({ id, name, flavorBiasDef, homeLocation, rng }) {
  const personality = generatePersonality(rng, flavorBiasDef ? flavorBiasDef.traits_bias : null);
  const goals = generateGoals(rng, personality);
  return {
    id,
    name,
    class: "novato",
    personality,
    goals,
    needs: { hunger: 0.2, fatigue: 0.2, social: 0.3 }, // 0 = satisfecho, 1 = critico
    stats: {
      health: 100,
      maxHealth: 100, // recalculado por progression.maxHealthFor tras crear
    },
    progression: {
      baseLevel: 1,
      baseXp: 0,
      job: { id: "novato", level: 1, xp: 0 },
      trial: null, // { targetJobId, startCounters }
      history: [], // { jobId, tick, finalLevel } por cada cambio de clase
      counters: { killsComun: 0, killsElite: 0, killsJefe: 0, crafts: 0, trades: 0, heals: 0, stealSuccess: 0, visits: [] },
    },
    equipment: { weapon: null, armor: null, tool: null }, // { itemId, durability } | null
    gold: randInt(rng, 15, 40),
    inventory: {},
    location: homeLocation,
    homeLocation,
    status: "idle", // idle | traveling | busy | incapacitated | imprisoned
    activity: null, // { type, remainingTicks, data }
    guildId: null,
    guildMissedDues: 0,
    guildJoinedTick: null,
    recentGuildDepartures: {}, // guildId -> tick en que lo abandono (enfriamiento antes de re-unirse)
    guildsFounded: 0, // cuantos gremios ha fundado en total (encarece fundar de nuevo)
    lastGuildExitTick: null, // tick de la ultima salida (voluntaria o expulsion) de CUALQUIER gremio
    partyId: null,
    pendingInvites: [], // { fromId, opportunity, expiresTick }
    prison: null, // { institutionId, locationId, releaseTick, reason }
    relationships: {}, // otherAgentId -> { affinity, trust, interactions, lastTick, memories: [] }
    standing: {}, // institutionId -> -100..100
    knowledge: [], // { fact, confidence, source, tick, type, data }
    memory: [], // { tick, summary, importance, tags }
    recentDecisions: [], // ultimos N registros estructurados (seccion 21)
    alive: true,
    lives: 3, // Step 6: vida inicial + 2 renacimientos antes de la muerte permanente
    deathHistory: [], // { tick, location, cause, killer, lifeNumberBefore, baseLevel, jobId, guildId }
    createdTick: 0,
    policy: "deterministic", // "deterministic" | "llm" (Experimento V3-LLM) — decide que implementacion de decide() usa este agente
    lastLlmConsultTick: null, // ultimo tick en que se le hizo una consulta real al LLM (para espaciar llamadas, ver llm/llmDecision.js)
  };
}

export function createGuild({ id, name, founderId, tick }) {
  return {
    id,
    name,
    founderId,
    leaderId: founderId, // separado del fundador desde el dia 1: puede cambiar por sucesion
    members: [founderId],
    treasury: 0,
    reputation: 0,
    lastReputationEventTick: tick,
    relations: {}, // otherGuildId -> { score: -100..100, lastEventTick, lastNote }
    contractCounters: { killsByRank: { comun: 0, elite: 0, jefe: 0 }, gathered: {}, crafted: {} },
    activeContract: null, // id del encargo de gremio en curso, o null
    contractHistory: [], // { id, type, outcome, tick, reward } acotado
    claims: [], // locationIds reclamados (reservado para uso futuro)
    createdTick: tick,
    disbanded: false,
    insolventSince: null,
  };
}

export function relationshipLabel(rel) {
  if (!rel) return "desconocido";
  const { affinity, interactions } = rel;
  if (interactions === 0) return "desconocido";
  if (affinity <= -60) return "enemigo";
  if (affinity <= -20) return "rival";
  if (affinity < 20) return "conocido";
  if (affinity < 60) return "aliado";
  return "amigo";
}

export function getOrCreateRelationship(agent, otherId, tick) {
  if (!agent.relationships[otherId]) {
    agent.relationships[otherId] = { affinity: 0, trust: 0, interactions: 0, lastTick: tick, memories: [] };
  }
  return agent.relationships[otherId];
}

// weight distingue una charla (pequeña) de una traicion (enorme) para que
// la etiqueta de relacion refleje categorias de evento distintas, no solo
// "mas de lo mismo" repetido muchas veces (seccion 14 del encargo V2).
export function adjustRelationship(agent, otherId, tick, { affinityDelta = 0, trustDelta = 0, note, weight = 1 }) {
  const rel = getOrCreateRelationship(agent, otherId, tick);
  rel.affinity = Math.max(-100, Math.min(100, rel.affinity + affinityDelta));
  rel.trust = Math.max(-100, Math.min(100, rel.trust + trustDelta));
  rel.interactions += 1;
  rel.lastTick = tick;
  if (note) {
    // affinityDelta va guardado en el propio recuerdo, no solo el numero
    // acumulado: sin esto, "el recuerdo de una traicion" y "el recuerdo de
    // un favor grande" eran indistinguibles una vez escritos (solo texto y
    // peso), y nada podia usarlos para razonar sobre decisiones futuras
    // mas alla del numero de afinidad ya decaido (Experimento D, seccion 6).
    rel.memories.push({ tick, note, weight, affinityDelta });
    // se descarta primero el recuerdo de menor peso, no el mas viejo sin mas:
    // una traicion vieja se recuerda mas que una charla de ayer.
    if (rel.memories.length > 10) {
      rel.memories.sort((a, b) => a.weight - b.weight);
      rel.memories.shift();
      rel.memories.sort((a, b) => a.tick - b.tick);
    }
  }
}

// Una traicion importante deberia seguir pesando incluso despues de que la
// afinidad numerica se recupere (por decaimiento hacia neutral, o por
// interacciones triviales posteriores que la vayan subiendo de a poco) —
// "un acontecimiento antiguo puede producir consecuencias mucho despues"
// (Experimento D, seccion 3/6). Umbral: un recuerdo de peso >=2.5 con
// efecto claramente negativo (robo, malversacion, abandono de gremio
// fundado) cuenta como traicion significativa; charlas y ayudas normales
// nunca llegan a ese peso.
export function hasSignificantBetrayal(rel) {
  if (!rel || !rel.memories) return false;
  return rel.memories.some((m) => m.weight >= 2.5 && m.affinityDelta < 0);
}

// Decaimiento de relaciones sin contacto reciente: condicion previa para que
// "aliado" deje de ser una banda casi vacia y "amigo" un techo permanente.
const RELATIONSHIP_DECAY_AFTER_TICKS = 96; // ~4 dias sin interactuar
export function decayRelationships(agent, tick) {
  for (const rel of Object.values(agent.relationships)) {
    if (tick - rel.lastTick < RELATIONSHIP_DECAY_AFTER_TICKS) continue;
    if (Math.abs(rel.affinity) < 0.1 && Math.abs(rel.trust) < 0.1) continue;
    rel.affinity -= Math.sign(rel.affinity) * Math.min(Math.abs(rel.affinity), 0.15);
    rel.trust -= Math.sign(rel.trust) * Math.min(Math.abs(rel.trust), 0.1);
  }
}

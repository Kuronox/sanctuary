// Sistema de conocimiento limitado (seccion 8 del encargo).
// El motor conoce el estado completo del mundo. Los agentes NO: solo acumulan
// "knowledge entries" que observaron, dedujeron o recibieron de otro agente,
// con un nivel de confianza que se degrada al propagarse (rumores).

const MAX_KNOWLEDGE = 60;
const MAX_MEMORY = 50;

export function addKnowledge(agent, entry, tick, maxOverride) {
  const full = { confidence: 1, tick, ...entry };
  agent.knowledge.push(full);
  const cap = maxOverride || MAX_KNOWLEDGE;
  if (agent.knowledge.length > cap) {
    // Se descarta lo mas viejo y de menor confianza primero.
    agent.knowledge.sort((a, b) => (a.confidence - b.confidence) || (a.tick - b.tick));
    agent.knowledge.shift();
  }
}

// Recuerdos de precios observados: la base de la decision de viajar por
// arbitraje (seccion 17 del encargo V2 — "vender aqui por 8 vs. viajar y
// vender por 15" debe ser una decision de INSTANCIA, no de tipo). Un agente
// solo puede recordar precios de sitios donde estuvo o que alguien le conto.
export function recordPriceObservation(agent, good, locationId, price, tick, maxOverride) {
  addKnowledge(agent, {
    fact: `${good} se vendia a ${price} en ${locationId}`,
    type: "precio",
    source: "observado",
    data: { good, locationId, price },
  }, tick, maxOverride);
}

export function knownPricesFor(agent, good) {
  return agent.knowledge
    .filter((k) => k.type === "precio" && k.data && k.data.good === good)
    .sort((a, b) => b.tick - a.tick);
}

export function addMemory(agent, memory, tick) {
  agent.memory.push({ tick, ...memory });
  if (agent.memory.length > MAX_MEMORY) {
    // Prunar por importancia: se descarta el recuerdo de menor importancia
    // entre los mas antiguos (memoria imperfecta, no un log infinito).
    agent.memory.sort((a, b) => (a.importance - b.importance) || (a.tick - b.tick));
    agent.memory.shift();
    agent.memory.sort((a, b) => a.tick - b.tick);
  }
}

// Un evento ocurrido en una localizacion es "observado" por todos los agentes
// presentes en ella en el momento del evento. Esto es lo que produce
// informacion asimetrica real: solo quienes estaban ahi lo saben de primera mano.
export function broadcastLocalEvent(world, locationId, event, opts = {}) {
  const witnesses = Object.values(world.agents).filter(
    (a) => a.alive && a.location === locationId && a.status !== "traveling"
  );
  for (const agent of witnesses) {
    if (opts.excludeIds && opts.excludeIds.includes(agent.id)) continue;
    addKnowledge(agent, {
      fact: event.summary,
      type: event.type,
      source: "observado",
      refId: event.id,
      data: { ...event.data, actorId: event.actorId, location: event.location },
    }, world.time.tick);
  }
  return witnesses.map((w) => w.id);
}

// Cuando dos agentes hablan, uno puede compartir un hecho conocido con el otro.
// La confianza decae en cada salto (como un telefono descompuesto), y hay una
// pequeña probabilidad de distorsion del detalle.
export function shareRumor(rng, fromAgent, toAgent, tick) {
  const shareable = fromAgent.knowledge.filter((k) => k.confidence > 0.15);
  if (shareable.length === 0) return null;
  const item = shareable[Math.floor(rng() * shareable.length)];
  const distorted = rng() < 0.12;
  const newConfidence = Math.max(0.05, item.confidence * 0.8 * (distorted ? 0.5 : 1));
  const entry = {
    fact: distorted ? `${item.fact} (detalles inciertos)` : item.fact,
    type: item.type,
    source: `rumor de ${fromAgent.name}`,
    confidence: newConfidence,
    refId: item.refId,
  };
  addKnowledge(toAgent, entry, tick);
  return entry;
}

export function knownFactsAbout(agent, type) {
  return agent.knowledge.filter((k) => k.type === type);
}

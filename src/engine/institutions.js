// ---------------------------------------------------------------------------
// INSTITUCIONES (Sanctuary V2)
//
// Cada localizacion asentada tiene, como mucho, UNA institucion adjunta
// (academia, templo, herreria, gremio mercantil, gremio de aventureros).
// No son solo una etiqueta: entrenan (dan XP de oficio a cambio de oro),
// habilitan cambios de clase, y llevan una "posicion" (standing) por agente,
// deliberadamente SEPARADA de las relaciones personales — un agente puede
// caerle bien a la gente y mal a la corona, o al reves.
//
// La posicion decae hacia neutral sin actividad reciente. Sin este decaimiento
// se satura igual que las relaciones de V1 y deja de significar nada.
// ---------------------------------------------------------------------------

export function institutionOf(worldSeed, locationId) {
  const loc = worldSeed.locations.find((l) => l.id === locationId);
  return loc ? loc.institution : null;
}

export function guardStrengthOf(worldSeed, locationId) {
  const loc = worldSeed.locations.find((l) => l.id === locationId);
  return loc ? loc.guardStrength || 0 : 0;
}

export function getStanding(agent, institutionId) {
  return agent.standing[institutionId] || 0;
}

export function adjustStanding(agent, institutionId, delta) {
  const cur = agent.standing[institutionId] || 0;
  agent.standing[institutionId] = Math.max(-100, Math.min(100, cur + delta));
}

// Decaimiento lento hacia 0, aplicado una vez por tick sobre todas las
// instituciones con las que el agente tiene algun historial.
export function decayStandings(agent) {
  for (const id of Object.keys(agent.standing)) {
    const v = agent.standing[id];
    if (Math.abs(v) < 0.05) { agent.standing[id] = 0; continue; }
    agent.standing[id] = v - Math.sign(v) * Math.min(Math.abs(v), 0.03);
  }
}

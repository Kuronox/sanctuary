// Seleccion reproducible de la cohorte LLM (Experimento V3-LLM, secciones
// 3-5 del encargo). Se ejecuta UNA vez, al crear el mundo (nunca al
// hidratar un estado ya existente), usando un RNG propio derivado de la
// seed del mundo pero con un namespace distinto al RNG principal de la
// simulacion — asi la seleccion de la cohorte es determinista con la seed
// pero NUNCA consume del stream de RNG que usan las acciones deterministas
// (combate, robo, precios, etc.), que debe permanecer identico a PRE-V3
// para que la unica variable experimental sea la politica de decision.
//
// Ulra es un miembro obligatorio de la cohorte (seccion 4: en V3 Ulra pasa
// de sujeto de control determinista a sujeto experimental principal bajo
// politica LLM). Los otros 4 se eligen por un barajado determinista de los
// 69 agentes restantes, favoreciendo diversidad de localizacion inicial y
// de personalidad dominante — sin mirar resultados de ninguna simulacion,
// porque la seleccion ocurre antes de correr un solo tick.
import { makeRng, seedFromString } from "../rng.js";

function dominantTrait(personality) {
  return Object.entries(personality).sort((a, b) => b[1] - a[1])[0][0];
}

export function selectLlmCohort(world, { seedLabel = "sanctuary-v2", count = 5, mandatoryId = "agent_1" } = {}) {
  const rng = makeRng(seedFromString(`${seedLabel}:llm-cohort`));
  const all = Object.values(world.agents);
  const mandatory = world.agents[mandatoryId];
  const pool = all.filter((a) => a.id !== mandatoryId);

  // Barajado determinista (Fisher-Yates) del pool, usando el RNG dedicado.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const chosen = mandatory ? [mandatory] : [];
  const usedLocations = new Set(mandatory ? [mandatory.homeLocation] : []);
  const usedTraits = new Set(mandatory ? [dominantTrait(mandatory.personality)] : []);

  // Paso 1: preferir agentes que aporten una localizacion de origen O un
  // rasgo dominante de personalidad todavia no representado en la cohorte.
  for (const a of shuffled) {
    if (chosen.length >= count) break;
    const trait = dominantTrait(a.personality);
    if (!usedLocations.has(a.homeLocation) || !usedTraits.has(trait)) {
      chosen.push(a);
      usedLocations.add(a.homeLocation);
      usedTraits.add(trait);
    }
  }
  // Paso 2: si aun faltan puestos (diversidad agotada), completar con el
  // resto del orden barajado, sin mas criterio que la propia seed.
  for (const a of shuffled) {
    if (chosen.length >= count) break;
    if (!chosen.includes(a)) chosen.push(a);
  }

  return chosen.map((a) => ({
    id: a.id,
    name: a.name,
    homeLocation: a.homeLocation,
    dominantTrait: dominantTrait(a.personality),
    startingGold: a.gold,
  }));
}

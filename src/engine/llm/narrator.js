// Genera una racionalizacion narrativa cuando ocurre una divergencia Tipo A.
// Solo lee estado determinista; nunca escribe en el agente ni en el mundo:
// la salida va a narrative.jsonl (fuera de state.json, nunca hidratada).

import { ollamaGenerate } from "./ollamaClient.js";
import { appendNarrative } from "../store.js";

const MODEL = "mistral:7b-instruct-q4_K_M";

export async function narrateTypeA(agent, decision, world, _generate = ollamaGenerate, _sink = appendNarrative) {
  try {
    const p = agent.personality;
    const cf = decision.cf;
    const real = cf.realWinner;
    const alt = cf.cfWinner;

    const context =
      `Personaje: ${agent.name}, ${agent.class} nivel ${agent.progression.baseLevel}, ubicacion: ${agent.location}. ` +
      `Rasgos (0-1): ambicion=${p.ambition.toFixed(2)} sociabilidad=${p.sociability.toFixed(2)} ` +
      `riesgo=${p.riskTolerance.toFixed(2)} codicia=${p.greed.toFixed(2)} ` +
      `lealtad=${p.loyalty.toFixed(2)} empatia=${p.empathy.toFixed(2)}. ` +
      `Eligio: ${real.type}${real.to ? " a " + real.to : ""}. ` +
      `Descarto: ${alt.type}${alt.to ? " a " + alt.to : ""} (peligro percibido: ${cf.penaltyApplied.toFixed(2)}).`;
    // Formato [INST] que Mistral instruct entiende mejor
    const prompt =
      `<s>[INST] ${context}\n\nEscribe una sola frase corta en primera persona en español donde este personaje justifica su decision. Solo la frase, sin explicaciones. [/INST]`;

    const text = await _generate(MODEL, prompt);
    if (!text) return;

    // Limpiar comillas que el modelo a veces antepone
    const clean = text.replace(/^["'«]|["'»]$/g, "").trim();
    if (!clean) return;

    _sink({ agentId: agent.id, tick: world.time.tick, text: clean, trigger: "typeA" });
  } catch {
    // silencio — la simulacion nunca debe romperse por la narrativa
  }
}

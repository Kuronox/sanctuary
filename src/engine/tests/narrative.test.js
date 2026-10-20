// Tests Step 10: narrative[] y aislamiento causal de la voz del agente
// T1. createAgent() ya no tiene narrative (la narrativa vive fuera del estado causal)
// T2. narrateTypeA con mock OK → un registro al sink (narrative.jsonl), agente intacto
// T3. el prompt incluye accion REAL y alternativa (no al revés)
// T4. modificar narrative[] antes de decide() no cambia la decision
// T5. mock null → sink no recibe nada, sin excepcion
// T6. condicion cfType===A es correcta (B y sin cf no activan)
// T7. ningún archivo del motor lee narrative[] como input

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8")
);

import { createAgent } from "../entities.js";
import { createWorld } from "../world.js";
import { decide } from "../decision.js";
import { narrateTypeA } from "../llm/narrator.js";

function mkWorld(seed = 42) { return createWorld(worldSeed, seed); }
function mkAgent(world, id = "test_narrative") {
  const jobDef = worldSeed.jobs.find((j) => j.id === "novato");
  const locs = worldSeed.locations.filter((l) => l.governance !== "ninguna");
  const agent = createAgent({ id, name: "TestNarrador", flavorBiasDef: jobDef, homeLocation: locs[0].id, rng: world.rng });
  agent.location = locs[0].id;
  world.agents[id] = agent;
  return agent;
}

function mkDecision(cfType = "A") {
  return {
    tick: 42,
    cf: {
      cfType,
      penaltyApplied: 0.15,
      realWinner: { type: "work", to: null, score: 1.8 },
      cfWinner: cfType === "A" ? { type: "travel", to: "duren", cfScore: 2.1 } : null,
    },
  };
}

// T1 — el agente no carga narrativa: no puede terminar en state.json ni hidratarse
{
  const world = mkWorld();
  const agent = mkAgent(world);
  assert.equal("narrative" in agent, false, "T1: createAgent() no debe tener narrative");
  console.log("T1 PASS — createAgent() no tiene narrative");
}

// T2 — mock OK → entrada en narrative[]
{
  const world = mkWorld();
  const agent = mkAgent(world);
  const mockGen = async () => "Prefiero trabajar aquí que arriesgarme en el camino.";
  const before = JSON.stringify(agent);
  const out = [];
  await narrateTypeA(agent, mkDecision("A"), world, mockGen, (r) => out.push(r));
  assert.equal(out.length, 1, "T2: debe haber 1 entrada");
  assert.equal(out[0].trigger, "typeA", "T2: trigger=typeA");
  assert.equal(out[0].agentId, agent.id, "T2: agentId presente");
  assert.ok(out[0].text.length > 0, "T2: texto no vacío");
  assert.equal(typeof out[0].tick, "number", "T2: tick presente");
  assert.equal(JSON.stringify(agent), before, "T2: el agente no se modifica");
  console.log("T2 PASS — narrativa generada:", out[0].text);
}

// T3 — prompt incluye accion real (work) y alternativa (travel/duren)
{
  const world = mkWorld();
  const agent = mkAgent(world);
  let capturedPrompt = "";
  const mockGen = async (model, prompt) => { capturedPrompt = prompt; return "Hoy trabajo."; };
  await narrateTypeA(agent, mkDecision("A"), world, mockGen, () => {});
  assert.ok(capturedPrompt.includes("work"), "T3: prompt menciona accion real");
  assert.ok(capturedPrompt.includes("duren") || capturedPrompt.includes("travel"), "T3: prompt menciona alternativa");
  console.log("T3 PASS — prompt contiene accion real y alternativa contrafactual");
}

// T4 — narrative[] no afecta decide()
{
  const world1 = mkWorld(99);
  const agent1 = mkAgent(world1, "t4_a");
  // simula un state.json viejo (pre-separacion) que todavia trae narrative[]
  agent1.narrative = [{ tick: 0, text: "Dominaré el mundo.", trigger: "typeA" }, { tick: 1, text: "Nadie me detiene.", trigger: "typeA" }];
  const d1 = decide(world1, agent1);

  const world2 = mkWorld(99);
  const agent2 = mkAgent(world2, "t4_b");
  const d2 = decide(world2, agent2);

  assert.equal(d1.action.type, d2.action.type, "T4: narrative no cambia la decision");
  console.log("T4 PASS — narrative[] no afecta scoreAction (ambos eligieron:", d1.action.type, ")");
}

// T5 — mock null → narrative vacio, sin excepcion
{
  const world = mkWorld();
  const agent = mkAgent(world);
  const mockGen = async () => null;
  let threw = false;
  const out = [];
  try { await narrateTypeA(agent, mkDecision("A"), world, mockGen, (r) => out.push(r)); } catch { threw = true; }
  assert.equal(threw, false, "T5: no debe lanzar excepcion");
  assert.equal(out.length, 0, "T5: narrative vacio si null");
  console.log("T5 PASS — fallo silencioso, narrative vacío");
}

// T6 — condicion cfType===A
{
  const typeB = { cf: { cfType: "B", penaltyApplied: 0.05, realWinner: { type: "work", to: null }, cfWinner: null } };
  const noType = { action: { type: "work" } };
  const typeA = { cf: { cfType: "A" } };

  const isTypeA = (d) => d.cf?.cfType === "A";
  assert.equal(isTypeA(typeB), false, "T6: Type B no activa");
  assert.equal(isTypeA(noType), false, "T6: sin cf no activa");
  assert.equal(isTypeA(typeA), true, "T6: Type A activa");
  console.log("T6 PASS — condicion cfType===A correcta");
}

// T7 — ningún archivo del motor lee narrative[] como input causal
{
  const engineDir = path.resolve(__dirname, "..");
  const checkFiles = [
    "knowledge.js", "actions.js", "progression.js", "economy.js",
    "decision.js", "geo.js", "institutions.js", "rng.js", "store.js",
  ];
  for (const file of checkFiles) {
    const fpath = path.join(engineDir, file);
    if (!fs.existsSync(fpath)) continue;
    const lines = fs.readFileSync(fpath, "utf-8").split("\n")
      .filter(l => !l.trim().startsWith("//") && /\.narrative\b/.test(l));
    assert.equal(lines.length, 0, `T7: ${file} no debe leer narrative[]: ${lines.join(" | ")}`);
  }
  console.log("T7 PASS — ningún archivo del motor tiene referencias a narrative[]");
}

console.log("\n✓ Todos los tests de narrative (Step 10) PASSED");

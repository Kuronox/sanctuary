// Test: Step 14 — Aprender de las derrotas
// D1. sin derrotas -> penalizacion 0
// D2. una derrota recien ocurrida pesa (1 - 0.5*riskTolerance)
// D3. el recuerdo se desvanece: a mitad de la ventana pesa la mitad; fuera de la ventana, 0
// D4. es especifico del monstruo: otra familia u otro rango no penalizan
// D5. un temerario aprende mas lento que un cauto, pero aprende
// D6. tope de 4
// D7. una derrota real en combate queda en memoria con familia y rango
// D8. con derrotas recientes el agente elige menos veces pelear solo contra ese monstruo
// D9. victorias y derrotas en grupo no cuentan

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8"));

import { createWorld } from "../world.js";
import { createAgent } from "../entities.js";
import { execute } from "../actions.js";
import { decide, defeatPenalty } from "../decision.js";
import { makeRng } from "../rng.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);
const NOW = 1000;
const loss = (tick, family = "bandido", rank = "comun") => ({ tick, summary: "Fue derrotado", importance: 0.5, tags: ["combate", "derrota", rank], family, rank });

function makeAgent(risk) {
  const a = createAgent({ id: "d_1", name: "Agente_d1", flavorBiasDef: null, homeLocation: "cruce_fangoso", rng: makeRng(42) });
  a.personality = { ambition: 0.5, sociability: 0.2, riskTolerance: risk, greed: 0.5, loyalty: 0.5, empathy: 0.2 };
  a.goals = [{ goal: "prestigio", weight: 1 }, { goal: "exploracion", weight: 0.5 }];
  a.gold = 100;
  return a;
}

{
  const a = makeAgent(0.5);
  assert.equal(defeatPenalty(a, "bandido", "comun", NOW), 0);
  console.log("D1 PASS: sin derrotas -> 0");

  a.memory = [loss(NOW)];
  near(defeatPenalty(a, "bandido", "comun", NOW), 0.75);
  console.log("D2 PASS: derrota reciente con riskTolerance 0.5 -> 0.75");

  a.memory = [loss(NOW - 84)];
  near(defeatPenalty(a, "bandido", "comun", NOW), 0.375);
  a.memory = [loss(NOW - 169)];
  assert.equal(defeatPenalty(a, "bandido", "comun", NOW), 0);
  console.log("D3 PASS: a mitad de la ventana pesa la mitad; pasados 7 dias, 0");

  a.memory = [loss(NOW)];
  assert.equal(defeatPenalty(a, "lobo", "comun", NOW), 0);
  assert.equal(defeatPenalty(a, "bandido", "elite", NOW), 0);
  console.log("D4 PASS: otra familia u otro rango no penalizan");

  a.memory = Array.from({ length: 20 }, () => loss(NOW));
  assert.equal(defeatPenalty(a, "bandido", "comun", NOW), 4);
  console.log("D6 PASS: tope de 4");

  a.memory = [{ tick: NOW, summary: "Vencio", importance: 0.35, tags: ["combate", "victoria", "comun"] }];
  assert.equal(defeatPenalty(a, "bandido", "comun", NOW), 0);
  console.log("D9 PASS: las victorias no cuentan (las derrotas en grupo no generan este recuerdo)");
}

{
  const brave = makeAgent(1), careful = makeAgent(0);
  brave.memory = careful.memory = [loss(NOW)];
  const pb = defeatPenalty(brave, "bandido", "comun", NOW), pc = defeatPenalty(careful, "bandido", "comun", NOW);
  near(pb, 0.5); near(pc, 1);
  console.log("D5 PASS: temerario 0.5, cauto 1.0 por la misma derrota");
}

{
  // novato debil contra un jefe: derrota practicamente segura
  const world = createWorld(worldSeed, 3);
  world.time.tick = NOW;
  const a = makeAgent(0.9);
  world.agents[a.id] = a;
  const ev = execute(world, a, { type: "fight_monster", data: { family: "bandido", rank: "jefe" } });
  assert.equal(ev.type, "combat_loss");
  const m = a.memory.find((x) => x.tags.includes("derrota"));
  assert.equal(m.family, "bandido"); assert.equal(m.rank, "jefe");
  assert.ok(defeatPenalty(a, "bandido", "jefe", NOW) > 0);
  console.log("D7 PASS: la derrota real queda en memoria con familia y rango");
}

{
  // mismo mundo y misma secuencia de azar; solo cambia la memoria
  const countFights = (memory) => {
    const world = createWorld(worldSeed, 11);
    world.time.tick = NOW;
    const a = makeAgent(0.9);
    a.progression.job = { id: "guerrero", level: 6, xp: 0 }; a.class = "guerrero";
    a.memory = memory;
    world.agents[a.id] = a;
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const { action } = decide(world, a);
      if (action.type === "fight_monster" && action.data.family === "bandido" && action.data.rank === "comun") n++;
    }
    return n;
  };
  const clean = countFights([]);
  const scarred = countFights([loss(NOW), loss(NOW - 5), loss(NOW - 10), loss(NOW - 15), loss(NOW - 20), loss(NOW - 25)]);
  assert.ok(clean > 0, "sin derrotas deberia elegir pelear alguna vez");
  assert.ok(scarred < clean, `con derrotas ${scarred} deberia ser menor que sin derrotas ${clean}`);
  console.log(`D8 PASS: de 200 decisiones elige pelear contra el bandido ${clean} veces sin derrotas y ${scarred} con seis derrotas recientes`);
}

console.log("✓ Todos los tests de memoria de derrotas (Step 14) PASSED");

// Test: Step 12 — Regalar oro solo ante necesidad real
// H1. receptor con oro de sobra -> no se ofrece regalar
// H2. receptor pobre pero sin hambre -> no se ofrece
// H3. receptor con hambre y sin oro para comer -> se ofrece
// H4. receptor con hambre, sin oro, pero con una racion -> no se ofrece
// H5. quien regala con 10 o menos de oro (aunque tenga inventario) -> no se ofrece
// H6. tras recibir el regalo el receptor ya puede pagar comida -> deja de ofrecerse (no hay ping-pong)
// H7. el evento registra oro y hambre del receptor antes del regalo

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8"));

import { createWorld } from "../world.js";
import { createAgent } from "../entities.js";
import { listCandidateActions, execute } from "../actions.js";
import { makeRng } from "../rng.js";

function setup(giver = {}, receiver = {}) {
  const world = createWorld(worldSeed, 7);
  const mk = (id, over) => {
    const a = createAgent({ id, name: `Agente_${id}`, flavorBiasDef: null, homeLocation: "aldea_tejo", rng: makeRng(id.length + 40) });
    a.gold = 50; a.needs.hunger = 0.2;
    Object.assign(a, over);
    if (over.hunger != null) a.needs.hunger = over.hunger;
    world.agents[id] = a;
    return a;
  };
  const g = mk("g", giver), r = mk("rr", receiver);
  const offered = () => listCandidateActions(world, g).some((x) => x.type === "help_agent" && x.data.targetId === r.id);
  return { world, g, r, offered };
}

assert.equal(setup({}, { gold: 200, hunger: 0.9 }).offered(), false);
console.log("H1 PASS: receptor con oro de sobra -> no se ofrece");

assert.equal(setup({}, { gold: 0, hunger: 0.2 }).offered(), false);
console.log("H2 PASS: receptor pobre pero sin hambre -> no se ofrece");

assert.equal(setup({}, { gold: 0, hunger: 0.8 }).offered(), true);
console.log("H3 PASS: receptor con hambre y sin oro para comer -> se ofrece");

assert.equal(setup({}, { gold: 0, hunger: 0.8, inventory: { racion_comida: 1 } }).offered(), false);
console.log("H4 PASS: receptor con racion propia -> no se ofrece");

assert.equal(setup({ gold: 10, inventory: { hierro: 3 } }, { gold: 0, hunger: 0.8 }).offered(), false);
console.log("H5 PASS: quien tiene 10 o menos de oro no regala, aunque tenga inventario");

{
  const { world, g, r, offered } = setup({}, { gold: 0, hunger: 0.8 });
  const events = [];
  world.onEvent = (e) => events.push(e);
  // el regalo es de 3 a 10 de oro; se repite hasta que alcance para una comida (precio maximo 6)
  let gifts = 0;
  while (offered() && gifts < 5) { execute(world, g, { type: "help_agent", data: { targetId: r.id } }); gifts++; }
  assert.ok(gifts >= 1 && gifts <= 2, `regalos necesarios: ${gifts}`);
  assert.equal(offered(), false);
  // y el receptor no puede devolverlo: quien regalo no tiene hambre
  assert.equal(listCandidateActions(world, r).some((x) => x.type === "help_agent"), false);
  console.log(`H6 PASS: ${gifts} regalo(s) y deja de ofrecerse; el receptor no lo devuelve (oro receptor=${r.gold})`);

  const ev = events.find((e) => e.type === "help");
  assert.equal(ev.data.targetGold, 0);
  assert.equal(ev.data.targetHunger, 0.8);
  console.log("H7 PASS: el evento registra oro y hambre del receptor antes del regalo");
}

console.log("✓ Todos los tests de help por necesidad (Step 12) PASSED");

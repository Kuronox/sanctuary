// Test: Step 4 — Geography, Settlements & Urban Identity
// G1. display names match spec
// G2. food regen formula: cap=Math.min(pop,8)*0.05; cap=pop*0.8+10 (no pop≥30)
// G3. workBonus applied in work() handler
// G4. connection Brynn↔Tejor 5h both ways
// G5. connection Kestal↔Brynn 7h both ways
// G6. no rancho_vannur institution on Vannur
// G7. no biblioteca_kestal on Kestal
// G8. workBonus absent from Vannur, Morvane, Kestal
// G9. regression: Steps 1-3 intact (maintenance sink, embezzlement)

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8"));

import { createWorld } from "../world.js";
import { createAgent } from "../entities.js";
import { execute } from "../actions.js";
import { makeRng } from "../rng.js";
import * as economy from "../economy.js";

const locById = (id) => worldSeed.locations.find((l) => l.id === id);

// ---- G1: display names -------------------------------------------------------

{
  const names = {
    valdemarca: "Valdor",
    puerto_grisal: "Grisal",
    ribera_sauce: "Veldris",
    praderas_vann: "Vannur",
    cruce_fangoso: "Brynn",
    aldea_tejo: "Tejor",
    bosque_umbrio: "Duren",
    colinas_rotas: "Morvane",
    ruinas_kaltenhor: "Kestal",
  };
  for (const [id, expected] of Object.entries(names)) {
    const loc = locById(id);
    assert.ok(loc, `G1 FAIL: location ${id} not found`);
    assert.equal(loc.name, expected, `G1 FAIL: ${id}.name="${loc.name}" expected "${expected}"`);
  }
  console.log("G1 PASS: all display names correct");
}

// ---- G2: food regen formula --------------------------------------------------

{
  // At pop=8, regen = 0.6 + 8*0.05 = 1.0 (no food bonus)
  // At pop=12, regen = 0.6 + 8*0.05 = 1.0 (capped at 8)
  // cap at pop=20 = max(30, 20*0.8+10) = max(30,26) = 30
  // cap at pop=40 = max(30, 40*0.8+10) = max(30,42) = 42

  const world = createWorld(worldSeed, 42);
  const markets = world.markets;
  const loc = locById("valdemarca");

  // Test regen cap: pop=12 should give same regen as pop=8
  const popByLoc8 = { valdemarca: 8 };
  const popByLoc12 = { valdemarca: 12 };
  const stockBefore8 = markets.valdemarca.stock.racion_comida ?? 0;
  economy.tickMarkets(worldSeed, markets, popByLoc8);
  const regen8 = (markets.valdemarca.stock.racion_comida ?? 0) - stockBefore8;

  const markets2 = economy.initMarket(worldSeed);
  const stockBefore12 = markets2.valdemarca.stock.racion_comida ?? 0;
  economy.tickMarkets(worldSeed, markets2, popByLoc12);
  const regen12 = (markets2.valdemarca.stock.racion_comida ?? 0) - stockBefore12;

  assert.ok(Math.abs(regen8 - regen12) < 0.01, `G2 FAIL: pop regen not capped at 8 — regen@8=${regen8.toFixed(3)}, regen@12=${regen12.toFixed(3)}`);

  // Test cap formula: at pop=40, cap=42
  const markets3 = economy.initMarket(worldSeed);
  markets3.valdemarca.stock.racion_comida = 45; // above cap for pop=40
  economy.tickMarkets(worldSeed, markets3, { valdemarca: 40 });
  const stockAfter = markets3.valdemarca.stock.racion_comida ?? 0;
  assert.ok(stockAfter <= 42.5, `G2 FAIL: cap at pop=40 should be ~42, got ${stockAfter.toFixed(2)}`);

  // Test food bonus: pescado/grano locations produce more
  const markets4 = economy.initMarket(worldSeed);
  const stockBefore4 = markets4.puerto_grisal.stock.racion_comida ?? 0;
  economy.tickMarkets(worldSeed, markets4, { puerto_grisal: 5 });
  const regenGrisal = (markets4.puerto_grisal.stock.racion_comida ?? 0) - stockBefore4;
  // Grisal has pescado+sal; pescado counts: foodBonus=0.4
  // regen = 0.6 + min(5,8)*0.05 + 0.4 = 0.6+0.25+0.4 = 1.25
  assert.ok(regenGrisal > 1.0, `G2 FAIL: food bonus not applied at Grisal, regen=${regenGrisal.toFixed(3)}`);

  console.log(`G2 PASS: regen formula correct (regen@8=${regen8.toFixed(3)}, regen@12=${regen12.toFixed(3)}, cap@pop40=${stockAfter.toFixed(2)}, regenGrisal=${regenGrisal.toFixed(3)})`);
}

// ---- G3: workBonus in actions.work() -----------------------------------------

{
  function makeAgent(id, location, cls) {
    const rng = makeRng(42);
    const jobDef = worldSeed.jobs.find((j) => j.id === cls) || worldSeed.jobs.find((j) => j.id === "herrero");
    const agent = createAgent({ id, name: `A_${id}`, flavorBiasDef: jobDef, homeLocation: location, rng });
    agent.location = location;
    agent.class = cls;
    agent.gold = 0;
    agent.status = "idle";
    return agent;
  }

  // Herrero at Brynn (bonus 1.5) should earn more than herrero at Valdor (no bonus)
  const world = createWorld(worldSeed, 7);
  const brynn = makeAgent("w_brynn", "cruce_fangoso", "herrero");
  const valdor = makeAgent("w_valdor", "valdemarca", "herrero");
  world.agents[brynn.id] = brynn;
  world.agents[valdor.id] = valdor;

  // Sample many times: with fixed seed the rng advances, use separate worlds
  let totalBrynn = 0, totalValdor = 0;
  const SAMPLES = 20;
  for (let i = 0; i < SAMPLES; i++) {
    const w1 = createWorld(worldSeed, i + 100);
    const b = makeAgent(`wb_${i}`, "cruce_fangoso", "herrero");
    b.gold = 0;
    w1.agents[b.id] = b;
    execute(w1, b, { type: "work" });
    totalBrynn += b.gold;

    const w2 = createWorld(worldSeed, i + 100);
    const v = makeAgent(`wv_${i}`, "valdemarca", "herrero");
    v.gold = 0;
    w2.agents[v.id] = v;
    execute(w2, v, { type: "work" });
    totalValdor += v.gold;
  }
  assert.ok(totalBrynn > totalValdor, `G3 FAIL: herrero@Brynn(${totalBrynn}) should earn more than herrero@Valdor(${totalValdor})`);
  console.log(`G3 PASS: workBonus applied — herrero@Brynn avg=${(totalBrynn/SAMPLES).toFixed(1)}, @Valdor avg=${(totalValdor/SAMPLES).toFixed(1)}`);
}

// ---- G4: Brynn↔Tejor 5h both ways -------------------------------------------

{
  const brynn = locById("cruce_fangoso");
  const tejor = locById("aldea_tejo");
  const b2t = brynn.connections.find((c) => c.to === "aldea_tejo");
  const t2b = tejor.connections.find((c) => c.to === "cruce_fangoso");
  assert.ok(b2t, "G4 FAIL: Brynn→Tejor connection missing");
  assert.equal(b2t.hours, 5, `G4 FAIL: Brynn→Tejor hours=${b2t.hours}, expected 5`);
  assert.ok(t2b, "G4 FAIL: Tejor→Brynn connection missing");
  assert.equal(t2b.hours, 5, `G4 FAIL: Tejor→Brynn hours=${t2b.hours}, expected 5`);
  console.log("G4 PASS: Brynn↔Tejor 5h both ways");
}

// ---- G5: Kestal↔Brynn 7h both ways ------------------------------------------

{
  const kestal = locById("ruinas_kaltenhor");
  const brynn = locById("cruce_fangoso");
  const k2b = kestal.connections.find((c) => c.to === "cruce_fangoso");
  const b2k = brynn.connections.find((c) => c.to === "ruinas_kaltenhor");
  assert.ok(k2b, "G5 FAIL: Kestal→Brynn connection missing");
  assert.equal(k2b.hours, 7, `G5 FAIL: Kestal→Brynn hours=${k2b.hours}, expected 7`);
  assert.ok(b2k, "G5 FAIL: Brynn→Kestal connection missing");
  assert.equal(b2k.hours, 7, `G5 FAIL: Brynn→Kestal hours=${b2k.hours}, expected 7`);
  console.log("G5 PASS: Kestal↔Brynn 7h both ways");
}

// ---- G6: no rancho_vannur on Vannur ------------------------------------------

{
  const vannur = locById("praderas_vann");
  assert.ok(!vannur.institution || vannur.institution.id !== "rancho_vannur",
    `G6 FAIL: rancho_vannur institution found on Vannur — must not exist in Step 4`);
  console.log("G6 PASS: Vannur has no rancho_vannur institution");
}

// ---- G7: no biblioteca_kestal on Kestal --------------------------------------

{
  const kestal = locById("ruinas_kaltenhor");
  assert.ok(!kestal.institution || kestal.institution.id !== "biblioteca_kestal",
    `G7 FAIL: biblioteca_kestal institution found on Kestal — must not exist in Step 4`);
  console.log("G7 PASS: Kestal has no biblioteca_kestal institution");
}

// ---- G8: workBonus absent from Vannur, Morvane, Kestal -----------------------

{
  for (const id of ["praderas_vann", "colinas_rotas", "ruinas_kaltenhor"]) {
    const loc = locById(id);
    assert.ok(!loc.workBonus || Object.keys(loc.workBonus).length === 0,
      `G8 FAIL: ${id} has unexpected workBonus: ${JSON.stringify(loc.workBonus)}`);
  }
  console.log("G8 PASS: Vannur, Morvane, Kestal have no workBonus");
}

// ---- G9: regression — Steps 1-3 intact (quick smoke) ------------------------

{
  const world = createWorld(worldSeed, 99);
  world.time = { tick: 23, day: 2, hour: 23 };

  // Step 1: embezzlement friction
  const rng = makeRng(55);
  const malversor = createAgent({ id: "reg_malv", name: "Malversor", flavorBiasDef: worldSeed.jobs[0], homeLocation: "cruce_fangoso", rng });
  malversor.location = "cruce_fangoso";
  malversor.personality = { greed: 0.95, loyalty: 0.05, empathy: 0.05, ambition: 0.9, riskTolerance: 0.9, sociability: 0.4 };
  malversor.status = "idle";
  const victima = createAgent({ id: "reg_vic", name: "Victima", flavorBiasDef: worldSeed.jobs[0], homeLocation: "cruce_fangoso", rng: makeRng(56) });
  victima.location = "cruce_fangoso";
  victima.status = "idle";
  world.agents[malversor.id] = malversor;
  world.agents[victima.id] = victima;
  world.guilds["reg_guild"] = {
    id: "reg_guild", name: "Gremio_Reg", leaderId: "reg_vic",
    members: ["reg_malv", "reg_vic"], treasury: 50, reputation: 30,
    dues: 0, relations: {}, activeContract: null, contractHistory: [],
    contractCounters: { killsByRank: {}, gathered: {}, crafted: {} },
    disbanded: false, lastReputationEventTick: 0, insolventSince: null,
    claims: [], createdTick: 0,
  };
  malversor.guildId = "reg_guild";
  victima.guildId = "reg_guild";
  execute(world, malversor, { type: "malversar_tesoro" });
  const kVic = victima.knowledge.filter((k) => k.type === "malversacion_descubierta");
  assert.ok(kVic.length >= 1, "G9 FAIL: Step 1 regression — malversacion_descubierta not emitted");

  // Step 3: equipment maintenance stats exist on world
  assert.ok("equipmentMaintenancePaid" in world.stats, "G9 FAIL: Step 3 regression — stats.equipmentMaintenancePaid missing");

  console.log("G9 PASS: Steps 1-3 regressions OK");
}

console.log("\nTodos los tests de geography pasaron.");

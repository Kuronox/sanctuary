// Test: Step 15 — Decision de equipamiento (compra de armas por necesidad vivida)
// Diseño: docs/DISENO_STEP15_COMPRA_DE_EQUIPO.md, revision 3. 35 casos:
//   U1-U11  probabilidad de perder y mejora por arma (progression.js)
//   A1-A10  valor de compra y limites de asequibilidad (decision.js)
//   R1-R7   reserva de venta de una unidad de arma (actions.js)
//   I1-I7   integracion: derrota -> compra -> equipamiento, midiendo turnos
// Cada caso se registra por separado; el archivo termina con error si alguno falla.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8"));

import { createWorld, tick } from "../world.js";
import { createAgent } from "../entities.js";
import { listCandidateActions, execute } from "../actions.js";
import { decide, defeatPenalty, weaponPurchaseValue, WEAPON_NEED_REASON } from "../decision.js";
import * as prog from "../progression.js";
import { makeRng } from "../rng.js";

// ---- infraestructura --------------------------------------------------------

const results = [];
async function test(id, name, fn) {
  try {
    const detail = await fn();
    results.push({ id, ok: true });
    console.log(`${id} PASS: ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    results.push({ id, ok: false });
    console.log(`${id} FAIL: ${name} — ${String(err.message).split("\n")[0]}`);
  }
}
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} deberia ser ${b}`);
const WEAPON = "arma_hierro";
const CITY = "aldea_tejo"; // ciudad con mercado y sin monstruos
const M = worldSeed.monsters;
const NOW = 2000;

function makeAgent({ cls = "comerciante", location = CITY, gold = 500, jobLevel = 1, baseLevel = 1, id = "e_1" } = {}) {
  const a = createAgent({ id, name: `Agente_${id}`, flavorBiasDef: null, homeLocation: location, rng: makeRng(42) });
  a.class = cls;
  a.progression.job = { id: cls, level: jobLevel, xp: 0 };
  a.progression.baseLevel = baseLevel;
  // caracter fijo y poco inclinado a viajar o pelear, para que las pruebas no dependan del azar de creacion
  a.personality = { ambition: 0.3, sociability: 0.3, riskTolerance: 0.3, greed: 0.5, loyalty: 0.5, empathy: 0.3 };
  a.goals = [{ goal: "vida_tranquila", weight: 1 }, { goal: "seguridad", weight: 0.5 }];
  a.gold = gold;
  a.stats.maxHealth = prog.maxHealthFor(a);
  a.stats.health = a.stats.maxHealth;
  return a;
}
function makeWorld(agent, seed = 7, tickNow = NOW) {
  const world = createWorld(worldSeed, seed);
  world.time.tick = tickNow;
  world.events = [];
  world.onEvent = (e) => world.events.push(e);
  if (agent) world.agents[agent.id] = agent;
  return world;
}
const defeat = (tickAt, family = "bandido", rank = "comun") => ({ tick: tickAt, summary: "Fue derrotado", importance: 0.5, tags: ["combate", "derrota", rank], family, rank });
const threeDefeats = (t = NOW) => [defeat(t), defeat(t), defeat(t)];
const offers = (world, agent, type, good) => listCandidateActions(world, agent).filter((x) => x.type === type && (good == null || x.data?.good === good || x.data?.itemId === good));
const gain = (world, agent) => prog.weaponGain(worldSeed, agent, world.time.tick, WEAPON);

// frecuencia real de derrota usando el codigo de combate del motor (resolveSoloFight via execute)
function realLossRate({ cls, jobLevel = 1, baseLevel = 1, family, rank, armed = false, n = 6000, seed = 11 }) {
  const a = makeAgent({ cls, jobLevel, baseLevel, location: "cruce_fangoso" });
  const world = makeWorld(a, seed);
  let losses = 0;
  for (let i = 0; i < n; i++) {
    a.stats.health = 1e6; // nunca muere ni queda incapacitado
    a.status = "idle";
    a.progression.job = { id: cls, level: jobLevel, xp: 0 }; // sin crecimiento entre peleas
    a.progression.baseLevel = baseLevel; a.progression.baseXp = 0;
    a.equipment.weapon = armed ? { itemId: WEAPON, durability: 120 } : null;
    const ev = execute(world, a, { type: "fight_monster", data: { family, rank } });
    if (ev.type === "combat_loss") losses++;
  }
  return losses / n;
}

// avanza el mundo con el turno real del motor; devuelve en que turno ocurrio cada hito
async function runTurns(world, agent, maxTurns, perTurn) {
  const start = world.time.tick; const seen = { buy: null, buyByNeed: null, equip: null, sells: 0, buys: 0 };
  let cursor = world.events.length;
  for (let i = 1; i <= maxTurns; i++) {
    const before = { inv: agent.inventory[WEAPON] || 0, armed: !!agent.equipment.weapon, gain: gain(world, agent) };
    await tick(world);
    for (const e of world.events.slice(cursor)) {
      if (e.actorId !== agent.id) continue;
      if (e.type === "trade_buy" && e.summary.includes(WEAPON)) {
        seen.buys++; if (seen.buy == null) seen.buy = i;
        const d = agent.recentDecisions.at(-1);
        if (d && d.selectedAction === "trade_buy" && d.reasons.includes(WEAPON_NEED_REASON) && seen.buyByNeed == null) seen.buyByNeed = i;
      }
      if (e.type === "trade_sell" && e.summary.includes(WEAPON)) seen.sells++;
      if (e.type === "equip" && e.data.itemId === WEAPON && seen.equip == null) seen.equip = i;
    }
    cursor = world.events.length;
    if (perTurn) perTurn(i, before);
    if (seen.equip != null) break;
  }
  seen.turns = world.time.tick - start;
  return seen;
}

// ============================ U: probabilidad y mejora ============================

await test("U1", "poder 6 contra lobo y bandido", () => {
  const a = makeAgent();
  near(prog.soloLossProbability(6, M.lobo.comun, a), 21 / 63);
  near(prog.soloLossProbability(6, M.bandido.comun, a), 35 / 63);
  return "21/63 y 35/63";
});

await test("U2", "poder 10 contra lobo y bandido", () => {
  const a = makeAgent();
  near(prog.soloLossProbability(10, M.lobo.comun, a), 3 / 63);
  near(prog.soloLossProbability(10, M.bandido.comun, a), 10 / 63);
  return "3/63 y 10/63";
});

await test("U3", "guerrero contra cualquier monstruo comun", () => {
  const g = makeAgent({ cls: "guerrero" });
  const p = prog.effectiveCombatPower(worldSeed, g);
  for (const fam of Object.keys(M)) { assert.equal(prog.soloLossProbability(p, M[fam].comun, g), 0); assert.equal(prog.soloLossProbability(p + 4, M[fam].comun, g), 0); }
  return `poder ${p}: 0 con y sin arma contra los 4`;
});

await test("U4", "monstruo con nivel base minimo: se resta 1.5 por nivel faltante", () => {
  const under = makeAgent({ cls: "explorador", baseLevel: 3 }), ok = makeAgent({ cls: "explorador", baseLevel: 4 });
  assert.equal(M.lobo.elite.minBaseLevel, 4);
  near(prog.soloLossProbability(15, M.lobo.elite, under), 28 / 63);
  near(prog.soloLossProbability(15, M.lobo.elite, ok), 15 / 63);
  return "explorador nivel base 3: 28/63; nivel base 4: 15/63";
});

await test("U5", "monstruo para grupo: factor 0.55", () => {
  const g = makeAgent({ cls: "guerrero", jobLevel: 20, baseLevel: 8 });
  assert.equal(M.trol.elite.partyRecommended, true);
  const p = prog.effectiveCombatPower(worldSeed, g);
  assert.equal(p, 51);
  near(prog.soloLossProbability(p, M.trol.elite, g), 5 / 63);
  near(prog.soloLossProbability(p, { ...M.trol.elite, partyRecommended: false }, g), 0);
  return "guerrero poder 51 contra trol elite: 5/63 (sin el factor seria 0)";
});

await test("U6", "concordancia con el combate real (6000 peleas por caso, margen 0.03)", () => {
  const cases = [
    { label: "comerciante vs lobo", cls: "comerciante", family: "lobo", rank: "comun" },
    { label: "comerciante con arma vs bandido", cls: "comerciante", family: "bandido", rank: "comun", armed: true },
    { label: "explorador nv base 3 vs lobo elite", cls: "explorador", baseLevel: 3, family: "lobo", rank: "elite" },
    { label: "guerrero oficio 20 vs trol elite (grupo)", cls: "guerrero", jobLevel: 20, baseLevel: 8, family: "trol", rank: "elite" },
  ];
  const out = [];
  for (const c of cases) {
    const a = makeAgent({ cls: c.cls, jobLevel: c.jobLevel || 1, baseLevel: c.baseLevel || 1 });
    if (c.armed) a.equipment.weapon = { itemId: WEAPON, durability: 120 };
    const expected = prog.soloLossProbability(prog.effectiveCombatPower(worldSeed, a), M[c.family][c.rank], a);
    const real = realLossRate(c);
    assert.ok(Math.abs(real - expected) < 0.03, `${c.label}: real ${real.toFixed(3)} vs calculada ${expected.toFixed(3)}`);
    out.push(`${c.label} ${real.toFixed(3)}/${expected.toFixed(3)}`);
  }
  return `real/calculada: ${out.join("; ")}`;
});

await test("U7", "sin derrotas recordadas: mejora 0", () => {
  const a = makeAgent(); const w = makeWorld(a);
  assert.equal(gain(w, a), 0);
});

await test("U8", "comerciante: una derrota contra el lobo, dos contra el bandido, tres", () => {
  const a = makeAgent(); const w = makeWorld(a);
  a.memory = [defeat(NOW, "lobo")]; near(gain(w, a), 18 / 63);
  a.memory = [defeat(NOW), defeat(NOW)]; near(gain(w, a), 50 / 63);
  a.memory = threeDefeats(); assert.equal(gain(w, a), 1);
  return "0.286, 0.794 y 1 (tope)";
});

await test("U9", "recencia y ventana, iguales a la memoria del Step 14", () => {
  const a = makeAgent(); const w = makeWorld(a);
  a.memory = [defeat(NOW - 84, "lobo")]; near(gain(w, a), (18 / 63) / 2);
  a.memory = [defeat(NOW - 167, "lobo")]; assert.ok(gain(w, a) > 0); assert.ok(defeatPenalty(a, "lobo", "comun", NOW) > 0);
  a.memory = [defeat(NOW - 169, "lobo")]; assert.equal(gain(w, a), 0); assert.equal(defeatPenalty(a, "lobo", "comun", NOW), 0);
  return "a mitad de ventana pesa la mitad; a 167 h cuenta en ambas; a 169 h en ninguna";
});

await test("U10", "guerrero con derrotas recordadas: mejora 0", () => {
  const g = makeAgent({ cls: "guerrero" }); const w = makeWorld(g);
  g.memory = threeDefeats();
  assert.equal(gain(w, g), 0);
});

await test("U11", "victorias y recuerdos sin monstruo no cuentan", () => {
  const a = makeAgent(); const w = makeWorld(a);
  a.memory = [
    { tick: NOW, summary: "Vencio a un Bandido", importance: 0.35, tags: ["combate", "victoria", "comun"], family: "bandido", rank: "comun" },
    { tick: NOW, summary: "Fue derrotado", importance: 0.5, tags: ["combate", "derrota", "comun"] },
    { tick: NOW, summary: "Fue arrestado", importance: 0.9, tags: ["crimen", "carcel"] },
  ];
  assert.equal(gain(w, a), 0);
});

// ============================ A: valor de compra y asequibilidad ============================

const buyerAt = (gold, memory = threeDefeats()) => { const a = makeAgent({ gold }); a.memory = memory; const w = makeWorld(a); return { a, w, value: () => weaponPurchaseValue(w, a, WEAPON) }; };

await test("A1", "oro 65.62: la compra del arma no se ofrece (regla actual)", () => {
  const { a, w } = buyerAt(65.62);
  assert.equal(offers(w, a, "trade_buy", WEAPON).length, 0);
});

await test("A2", "oro 65.63 y 80.62: se ofrece, valor por necesidad 0", () => {
  for (const g of [65.63, 80.62]) { const { a, w, value } = buyerAt(g); assert.equal(offers(w, a, "trade_buy", WEAPON).length, 1); assert.equal(value(), 0); }
  return "tramo sin valor: la puntuacion es la actual";
});

await test("A3", "oro 80.63: el salto documentado", () => {
  const { value } = buyerAt(80.63);
  near(value(), 2.5 * (1 - 65.625 / 80.63));
  assert.ok(value() > 0.46 && value() < 0.47);
  return `valor ${value().toFixed(4)}`;
});

await test("A4", "el valor crece con el oro y nunca llega a 2.5", () => {
  const vals = [80.63, 100, 131, 300, 2000, 1e6].map((g) => buyerAt(g).value());
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] > vals[i - 1]);
  assert.ok(vals.at(-1) < 2.5);
  return vals.map((v) => v.toFixed(2)).join(" < ");
});

await test("A5", "con stock 9 y stock 8 el umbral se mueve con el precio", () => {
  const at = (stock, gold) => { const b = buyerAt(gold); b.w.markets[CITY].stock[WEAPON] = stock; return b.value(); };
  assert.equal(at(9, 87.90), 0); assert.ok(at(9, 87.92) > 0);
  assert.equal(at(8, 93.74), 0); assert.ok(at(8, 93.76) > 0);
  return "umbrales 87.91 y 93.75";
});

await test("A6", "ranura ocupada, o arma ya en el inventario: valor 0", () => {
  const eq = buyerAt(5000); eq.a.equipment.weapon = { itemId: WEAPON, durability: 60 }; assert.equal(eq.value(), 0);
  const inv = buyerAt(5000); inv.a.inventory[WEAPON] = 1; assert.equal(inv.value(), 0);
});

await test("A7", "mejora 0: valor 0 con cualquier oro", () => {
  for (const g of [70, 100, 1000, 1e5]) assert.equal(buyerAt(g, []).value(), 0);
});

await test("A8", "controles: sal, grano, herramienta y armadura no reciben valor", () => {
  const { a, w } = buyerAt(1e4);
  for (const good of ["sal", "grano", "herramienta_recoleccion", "armadura_cuero"]) assert.equal(weaponPurchaseValue(w, a, good), 0);
});

await test("A9", "tras una compra con valor, quedan 15 de oro (tolerancia 0.01 por el redondeo del impuesto)", () => {
  const plain = buyerAt(80.63); assert.ok(plain.value() > 0);
  const ev = execute(plain.w, plain.a, { type: "trade_buy", data: { good: WEAPON, qty: 1 } });
  assert.equal(ev.type, "trade_buy");
  assert.ok(plain.a.gold >= 15 - 0.01, `quedo con ${plain.a.gold}`);
  const disc = buyerAt(80.63); disc.a.progression.job.level = 20; // descuento de impuesto de comerciante
  execute(disc.w, disc.a, { type: "trade_buy", data: { good: WEAPON, qty: 1 } });
  assert.ok(disc.a.gold >= 15);
  return `coste real ${ev.data.totalCost} (techo usado 65.625): queda ${plain.a.gold.toFixed(3)}; con descuento queda ${disc.a.gold.toFixed(2)}`;
});

await test("A10", "la razon de texto aparece solo cuando hay valor por necesidad", () => {
  const withNeed = buyerAt(500); let found = null;
  for (let i = 0; i < 10 && !found; i++) { const d = decide(withNeed.w, withNeed.a); if (d.action.type === "trade_buy" && d.action.data.good === WEAPON) found = d; }
  assert.ok(found, "deberia elegir comprar el arma");
  assert.ok(found.rationale.reasons.includes(WEAPON_NEED_REASON));
  const noNeed = buyerAt(500, []);
  for (let i = 0; i < 30; i++) assert.ok(!decide(noNeed.w, noNeed.a).rationale.reasons.includes(WEAPON_NEED_REASON));
  return "presente al comprar por necesidad; ausente en 30 decisiones sin recuerdos";
});

// ============================ R: reserva de venta ============================

const holder = ({ weapons = 1, memory = threeDefeats(), equipped = false } = {}) => {
  const a = makeAgent({ gold: 300 }); a.memory = memory; a.inventory[WEAPON] = weapons;
  a.inventory.armadura_cuero = 1; a.inventory.herramienta_recoleccion = 1; a.inventory.sal = 4;
  if (equipped) a.equipment.weapon = { itemId: WEAPON, durability: 80 };
  return { a, w: makeWorld(a) };
};
const withoutWeaponSell = (list) => JSON.stringify(list.filter((x) => !(x.type === "trade_sell" && x.data.good === WEAPON)));

await test("R1", "ranura vacia, 1 arma, mejora > 0: no se ofrece venderla; si equiparla", () => {
  const { a, w } = holder();
  assert.equal(offers(w, a, "trade_sell", WEAPON).length, 0);
  assert.equal(offers(w, a, "equip_item", WEAPON).length, 1);
});

await test("R2", "ranura vacia, 1 arma, mejora 0: se ofrece vender como hoy", () => {
  const { a, w } = holder({ memory: [] });
  const s = offers(w, a, "trade_sell", WEAPON);
  assert.equal(s.length, 1); assert.equal(s[0].data.qty, 1);
});

await test("R3", "ranura vacia, 3 armas, mejora > 0: se ofrece vender 2", () => {
  const { a, w } = holder({ weapons: 3 });
  const s = offers(w, a, "trade_sell", WEAPON);
  assert.equal(s.length, 1); assert.equal(s[0].data.qty, 2);
});

await test("R4", "arma equipada: lista de acciones identica con y sin recuerdos", () => {
  const withMem = holder({ equipped: true }), noMem = holder({ equipped: true, memory: [] });
  assert.equal(JSON.stringify(listCandidateActions(withMem.w, withMem.a)), JSON.stringify(listCandidateActions(noMem.w, noMem.a)));
});

await test("R5", "8 dias despues sin derrotas nuevas: se vuelve a ofrecer vender", () => {
  const { a, w } = holder();
  assert.equal(offers(w, a, "trade_sell", WEAPON).length, 0);
  w.time.tick += 8 * 24;
  assert.equal(offers(w, a, "trade_sell", WEAPON).length, 1);
});

await test("R6", "armadura, herramienta y demas bienes: ventas identicas", () => {
  const withMem = holder(), noMem = holder({ memory: [] });
  const sells = (h) => JSON.stringify(listCandidateActions(h.w, h.a).filter((x) => x.type === "trade_sell" && x.data.good !== WEAPON));
  assert.equal(sells(withMem), sells(noMem));
  assert.ok(offers(withMem.w, withMem.a, "trade_sell", "armadura_cuero").length === 1 && offers(withMem.w, withMem.a, "trade_sell", "herramienta_recoleccion").length === 1);
});

await test("R7", "con el arma reservada no hay ningun otro bloqueo", () => {
  const withMem = holder(), noMem = holder({ memory: [] });
  assert.equal(withoutWeaponSell(listCandidateActions(withMem.w, withMem.a)), withoutWeaponSell(listCandidateActions(noMem.w, noMem.a)));
  return `${listCandidateActions(withMem.w, withMem.a).length} acciones ofrecidas; solo falta la venta del arma`;
});

// ============================ I: integracion ============================

const MAX = 72; // maximo de turnos (3 dias de juego)

await test("I1", "comerciante con 3 derrotas frescas y 500 de oro: compra y equipa", async () => {
  const a = makeAgent({ gold: 500 }); a.memory = threeDefeats(); const w = makeWorld(a, 21);
  const r = await runTurns(w, a, MAX);
  assert.ok(r.buyByNeed != null, "no compro por necesidad"); assert.ok(r.equip != null, "no equipo");
  assert.equal(a.equipment.weapon?.itemId, WEAPON);
  return `compra en el turno ${r.buyByNeed}; equipa ${r.equip - r.buyByNeed} turno(s) despues`;
});

await test("I2", "el mismo agente sin recuerdos: no hay compra por necesidad", async () => {
  const a = makeAgent({ gold: 500 }); const w = makeWorld(a, 21);
  const r = await runTurns(w, a, MAX);
  assert.equal(r.buyByNeed, null);
  return `${r.buys} compras de arma en ${r.turns} turnos`;
});

await test("I3", "cadena completa con combate real: pierde, compra y equipa", async () => {
  const a = makeAgent({ gold: 500, location: "cruce_fangoso" }); const w = makeWorld(a, 33);
  let losses = 0, fights = 0, firstDefeat = null;
  while (losses < 3 && fights < 60) {
    a.stats.health = a.stats.maxHealth; a.status = "idle"; w.time.tick += 1; fights++;
    const ev = execute(w, a, { type: "fight_monster", data: { family: "bandido", rank: "comun" } });
    if (ev.type === "combat_loss") { losses++; if (firstDefeat == null) firstDefeat = w.time.tick; }
  }
  assert.equal(losses, 3);
  const mem = a.memory.filter((m) => m.family === "bandido" && m.tags.includes("derrota"));
  assert.equal(mem.length, 3, "los recuerdos los crea el combate real");
  a.stats.health = a.stats.maxHealth; a.status = "idle";
  const startLoop = w.time.tick;
  const r = await runTurns(w, a, MAX);
  assert.ok(r.buyByNeed != null, "no compro por necesidad"); assert.ok(r.equip != null, "no equipo");
  return `${fights} peleas reales para 3 derrotas; de la primera derrota a la compra ${startLoop - firstDefeat + r.buyByNeed} turnos; de la compra al equipamiento ${r.equip - r.buyByNeed}`;
});

await test("I4", "con prueba de comercio activa: no vende el arma necesaria; se mide si la equipa", async () => {
  const a = makeAgent({ gold: 500 }); a.memory = threeDefeats();
  a.progression.trial = { targetJobId: "mercader_de_ruta", startCounters: JSON.parse(JSON.stringify(a.progression.counters)) };
  const w = makeWorld(a, 21);
  let violations = 0, protectedTurns = 0;
  const r = await runTurns(w, a, MAX, (i, before) => {
    if (!before.armed && before.inv >= 1 && before.gain > 0) { protectedTurns++; if ((a.inventory[WEAPON] || 0) < 1 && !a.equipment.weapon) violations++; }
  });
  assert.equal(violations, 0, "vendio el arma que necesitaba");
  assert.ok(a.progression.trial, "la prueba deberia seguir abierta");
  const types = new Set(listCandidateActions(w, a).map((x) => x.type));
  for (const t of ["rest", "work", "trade_buy"]) assert.ok(types.has(t), `accion ${t} no ofrecida`);
  const equipTxt = r.equip != null ? `equipa en el turno ${r.equip} (${r.equip - r.buy} despues de comprar)` : `NO equipa en ${MAX} turnos`;
  return `compra en el turno ${r.buy}; ${equipTxt}; ${protectedTurns} turnos con el arma reservada; ${r.buys} compras y ${r.sells} ventas de armas`;
});

await test("I5", "limite de oro en la practica: 80, 81 y 300", async () => {
  const mk = (gold) => { const a = makeAgent({ gold }); a.memory = threeDefeats(); return { a, w: makeWorld(a, 21) }; };
  const poor = mk(80); assert.equal(weaponPurchaseValue(poor.w, poor.a, WEAPON), 0);
  const d = decide(poor.w, poor.a); assert.ok(!d.rationale.reasons.includes(WEAPON_NEED_REASON));
  const edge = mk(81), rich = mk(300);
  const vEdge = weaponPurchaseValue(edge.w, edge.a, WEAPON), vRich = weaponPurchaseValue(rich.w, rich.a, WEAPON);
  const rEdge = await runTurns(edge.w, edge.a, 48), rRich = await runTurns(rich.w, rich.a, 48);
  return `con 80: valor 0. Con 81: valor ${vEdge.toFixed(2)}, ${rEdge.buyByNeed != null ? `compra en el turno ${rEdge.buyByNeed}` : "no compra en 48 turnos"}. Con 300: valor ${vRich.toFixed(2)}, ${rRich.buyByNeed != null ? `compra en el turno ${rRich.buyByNeed}` : "no compra en 48 turnos"}`;
});

await test("I6", "el arma se rompe: sin derrotas nuevas no recompra; con derrotas nuevas si", async () => {
  const a = makeAgent({ gold: 500, location: "bosque_umbrio" }); const w = makeWorld(a, 5);
  a.equipment.weapon = { itemId: WEAPON, durability: 1 };
  const ev = execute(w, a, { type: "fight_monster", data: { family: "lobo", rank: "comun" } });
  assert.equal(ev.type, "combat_win", "la pelea que rompe el arma deberia ser una victoria en esta seed");
  assert.equal(a.equipment.weapon, null, "el arma deberia haberse roto");
  a.location = CITY; a.stats.health = a.stats.maxHealth; a.status = "idle";
  const calm = await runTurns(w, a, 48);
  assert.equal(calm.buyByNeed, null, "recompro sin haber perdido");
  a.location = "cruce_fangoso"; let losses = 0, fights = 0;
  while (losses < 3 && fights < 60) { a.stats.health = a.stats.maxHealth; a.status = "idle"; w.time.tick += 1; fights++; if (execute(w, a, { type: "fight_monster", data: { family: "bandido", rank: "comun" } }).type === "combat_loss") losses++; }
  assert.equal(losses, 3);
  a.location = CITY; a.stats.health = a.stats.maxHealth; a.status = "idle";
  const again = await runTurns(w, a, MAX);
  assert.ok(again.buyByNeed != null, "no recompro tras volver a perder");
  return `48 turnos sin recompra; tras 3 derrotas nuevas recompra en el turno ${again.buyByNeed}${again.equip != null ? ` y equipa ${again.equip - again.buyByNeed} despues` : " (no equipa en el maximo)"}`;
});

await test("I7", "con arma equipada y derrotas recordadas: no compra una segunda", async () => {
  const a = makeAgent({ gold: 500 }); a.memory = threeDefeats(); a.equipment.weapon = { itemId: WEAPON, durability: 100 };
  const w = makeWorld(a, 21);
  assert.equal(weaponPurchaseValue(w, a, WEAPON), 0);
  let needBuys = 0;
  for (let i = 0; i < 48; i++) { await tick(w); const d = a.recentDecisions.at(-1); if (d?.reasons?.includes(WEAPON_NEED_REASON)) needBuys++; }
  assert.equal(needBuys, 0);
});

// ---- resumen ----------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} casos: ${results.length - failed.length} PASS, ${failed.length} FAIL${failed.length ? ` (${failed.map((r) => r.id).join(", ")})` : ""}`);
if (results.length !== 35) { console.log(`ERROR: se esperaban 35 casos y hay ${results.length}`); process.exit(1); }
if (failed.length) process.exit(1);
console.log("✓ Todos los tests de compra de equipo (Step 15) PASSED");

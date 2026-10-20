// Test: Step 15 rev. 4, Fase A — observacion de la necesidad de arma (weaponNeed).
// Solo observacion: no consume RNG, no cambia decisiones, no entra en state.json,
// recentDecisions, eventos ni prompts LLM. Va unicamente a decisions.jsonl.
//   T1  observeWeaponNeed no llama a world.rng
//   T2  decide() consume el RNG igual que antes (una vez por candidata + el sorteo) y la observacion no muta al agente
//   T3  corrida real: state.json no contiene weaponNeed (tampoco en recentDecisions)
//   T4  corrida real: decisions.jsonl si lo contiene, y events.jsonl no
//   T5  estatico: prompts LLM, acciones, progresion y persistencia no leen weaponNeed/observation
//   T6  corrida real repetida: decisions.jsonl identico byte a byte
//   T7  etapas del embudo: necesidad 0, stock agotado, sin oro, sin valor, ofrecida
//   T8  sin entrada de mercado: price null, sin excepcion
//   T9  relevancia: con arma equipada, sin derrotas o con derrotas vencidas no se registra
//   T10 la politica LLM (sin API key) reenvia la observacion
//   T11 derrota en la hora 167 de 168: need estrictamente positivo y exacto (sin redondeo), igual que value

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8"));

import { createWorld } from "../world.js";
import { createAgent } from "../entities.js";
import { listCandidateActions } from "../actions.js";
import { decide, observeWeaponNeed, weaponPurchaseValue } from "../decision.js";
import { decide as decideLlm } from "../llm/llmDecision.js";
import * as prog from "../progression.js";
import { makeRng } from "../rng.js";

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

const WEAPON = "arma_hierro";
const CITY = "aldea_tejo";
const NOW = 2000;
function makeAgent({ cls = "comerciante", gold = 500, id = "w_1" } = {}) {
  const a = createAgent({ id, name: `Agente_${id}`, flavorBiasDef: null, homeLocation: CITY, rng: makeRng(42) });
  a.class = cls;
  a.progression.job = { id: cls, level: 1, xp: 0 };
  a.personality = { ambition: 0.3, sociability: 0.3, riskTolerance: 0.3, greed: 0.5, loyalty: 0.5, empathy: 0.3 };
  a.goals = [{ goal: "vida_tranquila", weight: 1 }];
  a.gold = gold;
  a.stats.maxHealth = prog.maxHealthFor(a);
  a.stats.health = a.stats.maxHealth;
  return a;
}
function makeWorld(agent, seed = 7) {
  const world = createWorld(worldSeed, seed);
  world.time.tick = NOW;
  world.onEvent = () => {};
  world.agents[agent.id] = agent;
  return world;
}
const defeat = (t, family = "bandido", rank = "comun") => ({ tick: t, summary: "Fue derrotado", importance: 0.5, tags: ["combate", "derrota", rank], family, rank });
const withDefeats = (a, t = NOW) => { a.memory.push(defeat(t), defeat(t), defeat(t)); return a; };
const scoredOf = (world, agent) => listCandidateActions(world, agent).map((action, i) => ({ action, score: -i })); // orden fijo, sin puntuar
const counting = (world) => { let n = 0; const real = world.rng; world.rng = () => { n++; return real(); }; return () => n; };

// ---- unitarias ---------------------------------------------------------------

await test("T1", "observeWeaponNeed no consume RNG", () => {
  const a = withDefeats(makeAgent()); const w = makeWorld(a);
  const calls = counting(w);
  const obs = observeWeaponNeed(w, a, scoredOf(w, a));
  assert.ok(obs?.weaponNeed?.length === 1, "debe registrar el arma");
  assert.equal(calls(), 0);
  return `need=${obs.weaponNeed[0].need} value=${obs.weaponNeed[0].value}`;
});

await test("T2", "decide() consume el RNG igual que antes y la observacion no muta al agente", () => {
  const a = withDefeats(makeAgent()); const w = makeWorld(a);
  const n = listCandidateActions(w, a).length;
  const before = JSON.stringify(a);
  const calls = counting(w);
  const d = decide(w, a);
  assert.equal(calls(), n + (n > 1 ? 1 : 0), "una llamada por candidata (decision.js:555) mas el sorteo (568)");
  assert.equal(JSON.stringify(a), before, "decide() no debe mutar al agente");
  assert.ok(d.observation?.weaponNeed, "con derrotas recientes y sin arma debe haber observacion");
  assert.equal("weaponNeed" in d.rationale, false, "weaponNeed no va en rationale");
  const again = observeWeaponNeed(w, a, scoredOf(w, a));
  assert.deepEqual(observeWeaponNeed(w, a, scoredOf(w, a)), again, "misma entrada, misma salida");
  return `${n} candidatas, ${calls()} llamadas`;
});

await test("T7", "campos por etapa del embudo", () => {
  const stage = (a, w) => observeWeaponNeed(w, a, scoredOf(w, a)).weaponNeed[0];
  // necesidad 0: un guerrero gana siempre al bandido comun, con o sin arma
  let a = withDefeats(makeAgent({ cls: "guerrero", id: "g" })); let w = makeWorld(a);
  let s = stage(a, w); assert.equal(s.need, 0); assert.equal(s.value, 0);
  // stock agotado (3 o menos): la compra no se ofrece
  a = withDefeats(makeAgent({ id: "s" })); w = makeWorld(a); w.markets[CITY].stock[WEAPON] = 3;
  s = stage(a, w); assert.ok(s.need > 0); assert.equal(s.stock, 3); assert.equal(s.offered, false);
  // sin oro para el precio x 1.05
  a = withDefeats(makeAgent({ id: "o", gold: 50 })); w = makeWorld(a);
  s = stage(a, w); assert.equal(s.affordable, false); assert.equal(s.offered, false);
  // ofrecida sin valor: le quedarian menos de 15 de oro
  a = withDefeats(makeAgent({ id: "v", gold: 70 })); w = makeWorld(a);
  s = stage(a, w); assert.equal(s.affordable, true); assert.equal(s.offered, true); assert.equal(s.value, 0);
  // ofrecida sin valor: ya tiene un arma en el inventario
  a = withDefeats(makeAgent({ id: "i" })); a.inventory[WEAPON] = 1; w = makeWorld(a);
  s = stage(a, w); assert.equal(s.hasInInventory, true); assert.equal(s.value, 0);
  // ofrecida con valor: rank y score salen de la lista puntuada real
  a = withDefeats(makeAgent({ id: "p" })); w = makeWorld(a);
  const d = decide(w, a); s = d.observation.weaponNeed[0];
  assert.ok(s.value > 0 && s.offered && s.buyRank >= 1 && s.buyRank <= s.nCandidates);
  assert.equal(s.inTop6, s.buyRank <= 6);
  const chosenBuy = d.action.type === "trade_buy" && d.action.data?.good === WEAPON;
  return `ofrecida con valor ${s.value}, puesto ${s.buyRank} de ${s.nCandidates}; eligio ${d.action.type}${chosenBuy ? " (compra por necesidad)" : ""}`;
});

await test("T8", "sin entrada de mercado: price null y sin excepcion", () => {
  const a = withDefeats(makeAgent()); const w = makeWorld(a);
  delete w.markets[CITY];
  const s = observeWeaponNeed(w, a, []).weaponNeed[0];
  assert.equal(s.market, false); assert.equal(s.price, null); assert.equal(s.affordable, false); assert.equal(s.value, 0);
});

await test("T9", "relevancia: arma equipada, sin derrotas o derrotas vencidas no registran", () => {
  let a = withDefeats(makeAgent({ id: "e" })); a.equipment.weapon = { itemId: WEAPON, durability: 100 };
  assert.equal(observeWeaponNeed(makeWorld(a), a, []), undefined);
  a = makeAgent({ id: "n" });
  assert.equal(observeWeaponNeed(makeWorld(a), a, []), undefined);
  a = withDefeats(makeAgent({ id: "x" }), NOW - 169);
  assert.equal(observeWeaponNeed(makeWorld(a), a, []), undefined);
  a = withDefeats(makeAgent({ id: "y" }), NOW - 168);
  assert.ok(observeWeaponNeed(makeWorld(a), a, []), "el limite de la ventana (168 h) cuenta, como en weaponGain");
});

await test("T11", "derrota en la hora 167 de 168: need > 0 y registrado sin redondear", () => {
  const a = makeAgent({ id: "b" }); a.memory.push(defeat(NOW - 167, "lobo", "comun")); const w = makeWorld(a);
  const s = observeWeaponNeed(w, a, scoredOf(w, a)).weaponNeed[0];
  const exactNeed = prog.weaponGain(worldSeed, a, NOW, WEAPON), exactValue = weaponPurchaseValue(w, a, WEAPON);
  assert.ok(s.need > 0, `need debe ser estrictamente positivo (${s.need})`);
  assert.equal(s.need, exactNeed, "need registrado = weaponGain exacto");
  assert.equal(s.value, exactValue, "value registrado = weaponPurchaseValue exacto");
  assert.ok(s.value > 0, `value debe ser positivo (${s.value})`);
  return `need=${s.need} value=${s.value}`;
});

await test("T10", "la politica LLM sin API key reenvia la observacion", async () => {
  const saved = process.env.DEEPSEEK_API_KEY; delete process.env.DEEPSEEK_API_KEY;
  try {
    const a = withDefeats(makeAgent({ id: "l" })); a.policy = "llm"; const w = makeWorld(a);
    const d = await decideLlm(w, a);
    assert.ok(d.observation?.weaponNeed, "debe llegar la observacion");
    assert.equal("weaponNeed" in d.rationale, false);
  } finally { if (saved !== undefined) process.env.DEEPSEEK_API_KEY = saved; }
});

await test("T5", "estatico: ni prompts LLM ni mecanismos ni persistencia leen weaponNeed/observation", () => {
  const engine = path.resolve(__dirname, "..");
  for (const f of ["llm/filteredWorldView.js", "llm/prompt.js", "actions.js", "progression.js", "economy.js", "store.js", "entities.js", "knowledge.js"]) {
    const bad = fs.readFileSync(path.join(engine, f), "utf-8").split("\n").filter((l) => !l.trim().startsWith("//") && /weaponNeed|observation/.test(l));
    assert.equal(bad.length, 0, `${f}: ${bad.join(" | ")}`);
  }
  const world = fs.readFileSync(path.join(engine, "world.js"), "utf-8").split("\n").filter((l) => !l.trim().startsWith("//") && /observation/.test(l));
  assert.deepEqual(world.map((l) => l.trim()), [
    "let action, rationale, observation;",
    "observation = d.observation;",
    "appendDecision({ agentId: agent.id, tick: world.time.tick, ...rationale, ...observation });",
  ], "world.js solo declara, asigna y pasa observation a appendDecision");
});

// ---- integracion: simulacion real en directorios temporales -----------------
// Mundo real de 24 ticks; al state.json se le agregan derrotas recientes a todos los agentes vivos
// (mismo formato que crea el Step 14) y se reanuda 12 ticks.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sanctuary-wneed-"));
function run(name, ticks, fixture) {
  const dir = path.join(tmp, name);
  if (fixture) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "state.json"), fixture, "utf-8"); }
  const env = { ...process.env, SANCTUARY_RUNTIME_DIR: dir }; delete env.DEEPSEEK_API_KEY; delete env.SANCTUARY_NARRATIVE;
  const r = spawnSync(process.execPath, ["src/sim/run.js", String(ticks)], { cwd: ROOT, env, encoding: "utf-8" });
  assert.equal(r.status, 0, `${name}: ${r.stderr}`);
  const read = (f) => fs.readFileSync(path.join(dir, f), "utf-8");
  return { state: read("state.json"), decisions: read("decisions.jsonl"), events: read("events.jsonl") };
}
const base = run("base", 24);
const st = JSON.parse(base.state);
for (const a of Object.values(st.agents)) if (a.alive) a.memory.push(defeat(st.time.tick), defeat(st.time.tick));
const fixture = JSON.stringify(st, null, 2);
const r1 = run("r1", 12, fixture);
const r2 = run("r2", 12, fixture);

await test("T3", "state.json no contiene weaponNeed (ni en recentDecisions)", () => {
  for (const r of [base, r1]) assert.equal(r.state.includes("weaponNeed"), false);
  const recent = Object.values(JSON.parse(r1.state).agents).flatMap((a) => a.recentDecisions);
  assert.ok(recent.length > 0);
  assert.equal(recent.some((d) => "weaponNeed" in d), false);
});

await test("T4", "decisions.jsonl contiene weaponNeed; events.jsonl no", () => {
  const n = r1.decisions.split("\n").filter((l) => l.includes('"weaponNeed"')).length;
  assert.ok(n > 0, "debe haber registros con weaponNeed");
  assert.equal(r1.events.includes("weaponNeed"), false);
  return `${n} registros con weaponNeed`;
});

await test("T6", "misma seed y mismo fixture: decisions.jsonl identico byte a byte", () => {
  assert.equal(r2.decisions, r1.decisions);
  assert.equal(r2.state, r1.state);
  assert.equal(r2.events, r1.events);
});

fs.rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} casos PASS`);
if (failed.length) { console.log("FALLAN:", failed.map((f) => f.id).join(", ")); process.exit(1); }

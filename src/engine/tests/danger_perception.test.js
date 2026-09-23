// Test: Step 9 — Danger Perception (dangerPenalty)
// T1.  sin knowledge → penalty = 0
// T2.  combat_loss fresco en destino, rT=0 → penalty = 0.25
// T3.  entry expirada (age > DANGER_WINDOW) → penalty = 0
// T4.  entry en otra localizacion → penalty = 0
// T5.  riskTolerance=1 → penalty = 0 (temerario ignora el peligro)
// T6.  riskTolerance diferenciado (0 vs 0.5) → penalizaciones distintas
// T7.  rebirth usa data.fromLocation (lugar de muerte), no data.location (renacimiento)
// T8.  permanent_death entry → penalty > 0
// T9.  múltiples entries acumulan señal — más entries, mayor penalty
// T10. cap en 0.6: señal saturada no supera el máximo

import assert from "node:assert/strict";
import { dangerPenalty } from "../decision.js";

function makeAgent({ riskTolerance = 0.5, knowledge = [] } = {}) {
  return { personality: { riskTolerance }, knowledge };
}

function makeWorld(tick = 0) {
  return { time: { tick } };
}

function makeCombatLoss(location, tick, confidence = 1) {
  return { type: "combat_loss", tick, confidence, data: { location } };
}

function makePermanentDeath(location, tick, confidence = 1) {
  return { type: "permanent_death", tick, confidence, data: { location } };
}

function makeRebirth(fromLocation, toLocation, tick, confidence = 1) {
  return { type: "rebirth", tick, confidence, data: { fromLocation, location: toLocation } };
}

// T1: sin knowledge
{
  const p = dangerPenalty(makeAgent({ riskTolerance: 0, knowledge: [] }), "valdemarca", makeWorld(0));
  assert.equal(p, 0, "T1 FAIL: penalty deberia ser 0 sin entries de knowledge");
  console.log("T1 PASS: sin knowledge → penalty = 0");
}

// T2: combat_loss fresco, rT=0 → signal=1 → penalty=0.25
{
  const agent = makeAgent({ riskTolerance: 0, knowledge: [makeCombatLoss("valdemarca", 0)] });
  const p = dangerPenalty(agent, "valdemarca", makeWorld(0));
  assert.equal(p, 0.25, "T2 FAIL: con signal=1 y rT=0, penalty deberia ser 0.25");
  console.log(`T2 PASS: combat_loss fresco → penalty = ${p}`);
}

// T3: entry expirada — age = 169 > DANGER_WINDOW=168 → excluida → penalty = 0
{
  const agent = makeAgent({ riskTolerance: 0, knowledge: [makeCombatLoss("valdemarca", 0)] });
  const p = dangerPenalty(agent, "valdemarca", makeWorld(169));
  assert.equal(p, 0, "T3 FAIL: entry con age > 168 deberia ser excluida");
  console.log("T3 PASS: entry expirada (age=169) → penalty = 0");
}

// T4: entry en otra localizacion → no afecta el destino
{
  const agent = makeAgent({ riskTolerance: 0, knowledge: [makeCombatLoss("puerto_grisal", 0)] });
  const p = dangerPenalty(agent, "valdemarca", makeWorld(0));
  assert.equal(p, 0, "T4 FAIL: entry de otra localizacion no deberia penalizar el destino");
  console.log("T4 PASS: entry en otra localizacion → penalty = 0");
}

// T5: riskTolerance=1 → (1 - rT) = 0 → penalty = 0
{
  const agent = makeAgent({ riskTolerance: 1, knowledge: [makeCombatLoss("valdemarca", 0)] });
  const p = dangerPenalty(agent, "valdemarca", makeWorld(0));
  assert.equal(p, 0, "T5 FAIL: agente con riskTolerance=1 no deberia recibir penalizacion");
  console.log("T5 PASS: riskTolerance=1 → penalty = 0");
}

// T6: rT diferenciado — mayor cautela = mayor penalizacion
{
  const entry = makeCombatLoss("valdemarca", 0);
  const pCautious = dangerPenalty(makeAgent({ riskTolerance: 0,   knowledge: [entry] }), "valdemarca", makeWorld(0));
  const pModerate = dangerPenalty(makeAgent({ riskTolerance: 0.5, knowledge: [entry] }), "valdemarca", makeWorld(0));
  assert.ok(pCautious > pModerate, "T6 FAIL: agente cauto (rT=0) deberia tener mayor penalty que moderado (rT=0.5)");
  assert.equal(pCautious, 0.25,  "T6 FAIL: rT=0   → penalty esperada 0.25");
  assert.equal(pModerate, 0.125, "T6 FAIL: rT=0.5 → penalty esperada 0.125");
  console.log(`T6 PASS: rT=0 → ${pCautious}, rT=0.5 → ${pModerate}`);
}

// T7: rebirth señala el lugar de muerte (fromLocation), no el de renacimiento (location)
{
  // El agente murió en puerto_grisal y renació en valdemarca
  const agent = makeAgent({ riskTolerance: 0, knowledge: [makeRebirth("puerto_grisal", "valdemarca", 0)] });
  const pAtDeath   = dangerPenalty(agent, "puerto_grisal", makeWorld(0));
  const pAtRebirth = dangerPenalty(agent, "valdemarca",    makeWorld(0));
  assert.ok(pAtDeath > 0, "T7 FAIL: rebirth deberia señalar peligro en el lugar de muerte (fromLocation)");
  assert.equal(pAtRebirth, 0, "T7 FAIL: el destino de renacimiento no deberia ser señalado como peligroso");
  console.log(`T7 PASS: rebirth → danger en fromLocation (${pAtDeath}), no en toLocation (${pAtRebirth})`);
}

// T8: permanent_death entry → penalty > 0
{
  const agent = makeAgent({ riskTolerance: 0, knowledge: [makePermanentDeath("valdemarca", 0)] });
  const p = dangerPenalty(agent, "valdemarca", makeWorld(0));
  assert.ok(p > 0, "T8 FAIL: permanent_death deberia producir penalizacion");
  console.log(`T8 PASS: permanent_death → penalty = ${p}`);
}

// T9: múltiples entries acumulan señal
{
  const k1 = [makeCombatLoss("valdemarca", 0)];
  const k3 = [makeCombatLoss("valdemarca", 0), makeCombatLoss("valdemarca", 0), makePermanentDeath("valdemarca", 0)];
  const p1 = dangerPenalty(makeAgent({ riskTolerance: 0, knowledge: k1 }), "valdemarca", makeWorld(0));
  const p3 = dangerPenalty(makeAgent({ riskTolerance: 0, knowledge: k3 }), "valdemarca", makeWorld(0));
  assert.ok(p3 > p1, "T9 FAIL: más entries deben acumular mayor señal");
  console.log(`T9 PASS: 1 entry → ${p1}, 3 entries → ${p3}`);
}

// T10: cap en 0.6 — señal saturada con rT=0 no puede superar el límite
{
  const knowledge = Array.from({ length: 10 }, () => makeCombatLoss("valdemarca", 0));
  const p = dangerPenalty(makeAgent({ riskTolerance: 0, knowledge }), "valdemarca", makeWorld(0));
  assert.ok(p <= 0.6, "T10 FAIL: penalty no puede superar 0.6 (cap)");
  assert.equal(p, 0.6, "T10 FAIL: con señal muy alta y rT=0 deberia saturar exactamente en 0.6");
  console.log(`T10 PASS: cap verificado — 10 entries saturan a ${p}`);
}

console.log("\nTodos los tests de danger_perception (Step 9) pasaron.");

// Hardening Step 10: la narrativa es observacional y no toca el estado causal.
// Corre la simulacion REAL (src/sim/run.js) como proceso hijo en dirs temporales.
// Solo se intercepta fetch (frontera de red) para contar llamadas a Ollama.
//
// Condicion experimental controlada (no depende de la trayectoria de ningun Step):
// se corre un mundo real 24 ticks, y a su state.json (solo datos, ninguna mecanica)
// se le inyecta a cada agente vivo un motivo para viajar y un motivo para no hacerlo:
//  - 3 de madera y un precio conocido muy alto en cada otra localizacion
//    (mismo formato que recordPriceObservation) -> destinationBonus por arbitraje
//  - derrotas frescas (combat_loss) en cada localizacion (formato de
//    broadcastLocalEvent) -> dangerPenalty sobre ese mismo viaje
// El contrafactual real de decide() produce Type A desde el primer tick.
// Las 4 corridas reanudan ese mismo fixture (hydrateWorld real).
//
// I1. OFF: cero llamadas de red, aunque haya decisiones Type A en la corrida
// I2. mismo seed: desde cero x2 y desde el fixture x2, state.json / decisions.jsonl /
//     events.jsonl identicos byte a byte (archivos completos)
// I3. ON con Ollama respondiendo: una llamada y una linea de narrative.jsonl por Type A,
//     todo lo causal identico a OFF
// I4. ON con Ollama caido: la simulacion termina y el resultado es identico a OFF
// I5. state.json no contiene narrativa; ningun archivo del motor lee .narrative (salvo el flag en world.js)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const BASE_TICKS = "24";
const TICKS = "12";
const DANGER_ENTRIES_PER_LOCATION = 4; // satura dangerPenalty salvo riskTolerance ~1
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sanctuary-narr-"));

const spy = `import fs from "node:fs";
globalThis.fetch = async (url) => {
  fs.appendFileSync(process.env.FETCH_LOG, String(url) + "\\n");
  if (process.env.FETCH_MODE === "down") throw new Error("ECONNREFUSED (ollama apagado)");
  return new Response(JSON.stringify({ response: "Mejor no arriesgarme hoy." }), { status: 200 });
};`;

function run(name, { ticks = TICKS, narrative = false, mode = "ok", fixture = null } = {}) {
  const dir = path.join(tmp, name);
  if (fixture) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "state.json"), fixture, "utf-8");
  }
  const env = { ...process.env, SANCTUARY_RUNTIME_DIR: dir, FETCH_LOG: path.join(tmp, `${name}.fetch.log`), FETCH_MODE: mode };
  delete env.DEEPSEEK_API_KEY;
  delete env.SANCTUARY_NARRATIVE;
  const args = ["--import", "data:text/javascript," + encodeURIComponent(spy), "src/sim/run.js", ticks];
  if (narrative) args.push("--narrative");
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: "utf-8" });
  assert.equal(r.status, 0, `${name}: la simulacion debe terminar (stderr: ${r.stderr})`);
  const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf-8") : null);
  const log = fs.existsSync(env.FETCH_LOG) ? fs.readFileSync(env.FETCH_LOG, "utf-8").split("\n").filter(Boolean) : [];
  return { state: read("state.json"), decisions: read("decisions.jsonl"), events: read("events.jsonl"), narrative: read("narrative.jsonl"), fetches: log };
}

const CAUSAL = ["state", "decisions", "events"];

// Reproducibilidad desde cero (no requiere Type A)
const base1 = run("base1", { ticks: BASE_TICKS });
const base2 = run("base2", { ticks: BASE_TICKS });
for (const k of CAUSAL) assert.equal(base2[k], base1[k], `I2: ${k} debe ser identico entre dos corridas desde cero`);
assert.equal(base1.fetches.length, 0, "I1: corrida desde cero OFF no debe hacer llamadas de red");

// Fixture: arbitraje atractivo + peligro fresco en cada localizacion, para todos los agentes vivos
const state = JSON.parse(base1.state);
const locations = state.worldSeed.locations.map((l) => l.id);
for (const agent of Object.values(state.agents)) {
  if (!agent.alive) continue;
  agent.inventory.madera = (agent.inventory.madera || 0) + 3;
  for (const location of locations) {
    if (location !== agent.location) {
      agent.knowledge.push({
        confidence: 1, tick: state.time.tick, fact: `fixture: madera se vendia a 1000 en ${location}`,
        type: "precio", source: "observado", data: { good: "madera", locationId: location, price: 1000 },
      });
    }
    for (let i = 0; i < DANGER_ENTRIES_PER_LOCATION; i++) {
      agent.knowledge.push({
        confidence: 1, tick: state.time.tick, fact: `fixture: derrota en ${location}`,
        type: "combat_loss", source: "observado", refId: null, data: { location },
      });
    }
  }
}
const fixture = JSON.stringify(state, null, 2);

const off1 = run("off1", { fixture });
const typeA = (off1.decisions.match(/"cfType":"A"/g) || []).length;
assert.ok(typeA > 0, "precondicion: el fixture de peligro debe producir al menos un Type A");

// I1
assert.equal(off1.fetches.length, 0, "I1: narrativa OFF no debe hacer ninguna llamada de red");
assert.equal(off1.narrative, null, "I1: narrativa OFF no escribe narrative.jsonl");
console.log(`I1 PASS — OFF: 0 llamadas a Ollama con ${typeA} decision(es) Type A en la corrida`);

// I2
const off2 = run("off2", { fixture });
for (const k of CAUSAL) assert.equal(off2[k], off1[k], `I2: ${k} debe ser identico entre dos corridas OFF`);
console.log(`I2 PASS — mismo seed: desde cero x2 y desde fixture x2, state.json (${off1.state.length} bytes), decisions y events identicos`);

// I3
const on = run("on", { fixture, narrative: true });
assert.equal(on.fetches.length, typeA, "I3: ON llama a Ollama exactamente una vez por Type A");
assert.ok(on.fetches.every((u) => u.includes("11434")), "I3: las llamadas van a Ollama");
assert.ok(on.narrative && on.narrative.trim().split("\n").length === typeA, "I3: una linea de narrative.jsonl por Type A");
for (const k of CAUSAL) assert.equal(on[k], off1[k], `I3: narrativa ON no debe alterar ${k}`);
console.log(`I3 PASS — ON: ${on.fetches.length} llamada(s), narrative.jsonl escrito, estado causal identico a OFF`);

// I4
const down = run("down", { fixture, narrative: true, mode: "down" });
assert.equal(down.fetches.length, typeA, "I4: ON intenta llamar a Ollama por cada Type A");
assert.equal(down.narrative, null, "I4: sin Ollama no hay narrativa");
for (const k of CAUSAL) assert.equal(down[k], off1[k], `I4: Ollama caido no debe alterar ${k}`);
console.log("I4 PASS — ON con Ollama caido: la simulacion termina con el mismo resultado");

// I5
for (const r of [base1, off1, on]) assert.equal(r.state.includes('"narrative"'), false, "I5: state.json no debe contener narrativa");
const engineDir = path.resolve(__dirname, "..");
const files = fs.readdirSync(engineDir).filter((f) => f.endsWith(".js")).concat(fs.readdirSync(path.join(engineDir, "llm")).map((f) => `llm/${f}`));
for (const f of files) {
  const bad = fs.readFileSync(path.join(engineDir, f), "utf-8").split("\n")
    .filter((l) => !l.trim().startsWith("//") && /\.narrative\b/.test(l))
    .filter((l) => !(f === "world.js" && /if \(world\.narrative && rationale\.cf\?\.cfType === "A"\)/.test(l)));
  assert.equal(bad.length, 0, `I5: ${f} no debe leer .narrative: ${bad.join(" | ")}`);
}
console.log("I5 PASS — state.json sin narrativa; solo world.js lee el flag, ningun mecanismo causal lee narrativa");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("\n✓ Aislamiento causal de la narrativa (Step 10) PASSED");

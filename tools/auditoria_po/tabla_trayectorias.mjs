// Temporal (auditoria PO): tabla de trayectorias para elegir agentes de cronica. Solo lectura.
// Reconstruye el estado inicial repitiendo la creacion del mundo de src/sim/run.js con la misma seed.
import fs from "node:fs"; import readline from "node:readline";
import { createWorld } from "../../src/engine/world.js";
import { createAgent, generateAgentName } from "../../src/engine/entities.js";
import { seedFromString, randInt, pick } from "../../src/engine/rng.js";

const [dir, label] = process.argv.slice(2);
const st = JSON.parse(fs.readFileSync(`${dir}/state.json`, "utf-8"));
const ws = st.worldSeed;
const w0 = createWorld(ws, seedFromString(label)); const used = new Set();
const tier1 = ws.jobs.filter((j) => j.tier === 1); const locs = ws.locations.filter((l) => l.governance !== "ninguna");
const init = {};
for (let i = 0; i < 70; i++) {
  const flavorBiasDef = pick(w0.rng, tier1); const home = locs[randInt(w0.rng, 0, locs.length - 1)].id; const name = generateAgentName(w0.rng, used);
  const a = createAgent({ id: `agent_${i + 1}`, name, flavorBiasDef, homeLocation: home, rng: w0.rng }); init[a.id] = a;
}
let mismatch = 0; for (const a of Object.values(st.agents)) if (a.id !== "agent_1" && (init[a.id].homeLocation !== a.homeLocation || Math.abs(init[a.id].personality.greed - a.personality.greed) > 1e-9)) mismatch++;
console.log(`seed ${seedFromString(label)} vs estado ${st.seedNumber} | agentes cuyo estado inicial reconstruido no coincide (hogar/personalidad): ${mismatch}`);

const ids = Object.keys(st.agents); const gold = Object.fromEntries(ids.map((id) => [id, {}])); const ev = Object.fromEntries(ids.map((id) => [id, {}]));
const RE = /"agentId":"(agent_\d+)","tick":(\d+),.*?oro=(-?\d+),/;
for await (const l of readline.createInterface({ input: fs.createReadStream(`${dir}/decisions.jsonl`) })) { const m = RE.exec(l); if (m) gold[m[1]][Math.floor(+m[2] / 24)] = +m[3]; }
for await (const l of readline.createInterface({ input: fs.createReadStream(`${dir}/events.jsonl`) })) {
  const m = /"type":"(\w+)","actorId":"(agent_\d+)"/.exec(l); if (!m) continue; ev[m[2]][m[1]] = (ev[m[2]][m[1]] || 0) + 1;
}
const at = (id, d) => { for (let k = d; k >= 0; k--) if (gold[id][k] != null) return gold[id][k]; return null; };
const rows = Object.values(st.agents).map((a) => ({ id: a.id, n: a.name, ini: init[a.id].gold, g30: at(a.id, 30), g100: at(a.id, 100), g200: at(a.id, 200), fin: Math.round(a.gold), max: Math.max(...Object.values(gold[a.id]), 0),
  cls: a.class, nv: a.progression.baseLevel, vidas: a.lives, vivo: a.alive, muertes: a.deathHistory.map((d) => `${d.cause}@${d.location}@d${Math.floor(d.tick / 24)}`).join(";"), casa: a.homeLocation, loc: a.location, gremio: a.guildId ? st.guilds[a.guildId].name : "-",
  work: ev[a.id].work || 0, win: ev[a.id].combat_win || 0, loss: ev[a.id].combat_loss || 0, emb: ev[a.id].guild_embezzle || 0, aport: ev[a.id].guild_contribution || 0, arrest: ev[a.id].arrest || 0, cc: ev[a.id].class_change || 0, heal: ev[a.id].heal || 0, craft: ev[a.id].craft || 0 }));
rows.sort((a, b) => b.fin - a.fin);
for (const r of rows) console.log(JSON.stringify(r));

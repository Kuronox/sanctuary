// Step 15 rev. 4, solo lectura: embudo de la necesidad de arma a partir del campo weaponNeed de decisions.jsonl.
// Uso: node tools/auditoria_po/weapon_need_funnel.mjs <carpeta de corrida> [...]
// Cada hora-agente con weaponNeed cae en una sola etapa, en este orden:
//   E0 necesidad 0 | E1 sin entrada de mercado | E2 stock <= 3 (la compra no se ofrece, actions.js)
//   E3 sin oro para precio x 1.05 | E4 ofrecida sin valor de necesidad | E5 ofrecida con valor y no elegida | E6 elegida con valor
// La oferta se lee del campo offered. EX = no ofrecida con stock > 3 y oro suficiente: incoherencia, se reporta (deberia ser 0).
// Nota: en el motor todas las localizaciones tienen mercado (economy.initMarket); "settled" no bloquea la compra.
import fs from "node:fs"; import readline from "node:readline";
const STAGES = ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "EX"];
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");
const fmt = (o, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(", ") || "—";
const med = (xs) => { if (!xs.length) return "—"; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function stageOf(w, rec) {
  if (w.need <= 0) return "E0";
  if (!w.market) return "E1";
  // la oferta se lee del campo registrado (offered), no se reconstruye con stock y oro
  if (!w.offered) return w.stock <= 3 ? "E2" : !w.affordable ? "E3" : "EX";
  const chosen = rec.selectedAction === "trade_buy" && rec.target === w.good;
  if (w.value <= 0) return "E4";
  return chosen ? "E6" : "E5";
}

for (const d of process.argv.slice(2)) {
  const count = Object.fromEntries(STAGES.map((s) => [s, 0]));
  const winnerE5 = {}, marginE5 = [], e4Chosen = { n: 0 };
  const byAgent = {}; let total = 0, forced = 0, withField = 0;
  for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/decisions.jsonl`) })) {
    total++;
    if (l.includes("instinto de supervivencia")) forced++;
    if (!l.includes('"weaponNeed"')) continue;
    const rec = JSON.parse(l); withField++;
    for (const w of rec.weaponNeed) {
      const s = stageOf(w, rec); count[s]++;
      if (s === "E4" && rec.selectedAction === "trade_buy" && rec.target === w.good) e4Chosen.n++;
      if (s === "E5") { winnerE5[rec.selectedAction] = (winnerE5[rec.selectedAction] || 0) + 1; if (w.topScore != null && w.buyScore != null) marginE5.push(Math.round((w.topScore - w.buyScore) * 100) / 100); }
      if (s !== "E0") (byAgent[rec.agentId] ||= []).push({ t: rec.tick, s });
    }
  }
  // episodios: horas consecutivas con necesidad > 0 del mismo agente (huecos de hasta 24 h)
  const episodes = [];
  for (const [id, rows] of Object.entries(byAgent)) {
    let cur = null;
    for (const r of rows) {
      if (!cur || r.t - cur.last > 24) { if (cur) episodes.push(cur); cur = { id, start: r.t, last: r.t, E2: 0, E5: 0, bought: false }; }
      cur.last = r.t; if (r.s === "E2") cur.E2++; if (r.s === "E5") cur.E5++; if (r.s === "E6") cur.bought = true;
    }
    if (cur) episodes.push(cur);
  }
  const withNeed = STAGES.slice(1).reduce((s, k) => s + count[k], 0);
  console.log(`\n######## ${d}`);
  console.log(`COBERTURA registros ${total} | con weaponNeed ${withField} | decisiones forzadas por supervivencia (no observadas) ${forced} | turnos de invitacion: no se registran en decisions.jsonl`);
  console.log(`ETAPAS ${STAGES.map((s) => `${s} ${count[s]}`).join(" | ")}`);
  console.log(`   con necesidad > 0: ${withNeed} | bloqueo por stock (E2) ${pct(count.E2, withNeed)} | ofrecidas (E4+E5+E6) ${count.E4 + count.E5 + count.E6} | conversion E6/(E5+E6) ${pct(count.E6, count.E5 + count.E6)} | compras elegidas sin valor de necesidad (E4) ${e4Chosen.n}`);
  console.log(`   E5 ganadora: ${fmt(winnerE5)} | margen mediano ${med(marginE5)}`);
  console.log(`EPISODIOS ${episodes.length} en ${Object.keys(byAgent).length} agentes | terminan en compra ${episodes.filter((e) => e.bought).length} | con horas en E2 ${episodes.filter((e) => e.E2).length} (mediana ${med(episodes.filter((e) => e.E2).map((e) => e.E2))} h) | con horas en E5 ${episodes.filter((e) => e.E5).length} (mediana ${med(episodes.filter((e) => e.E5).map((e) => e.E5))} h)`);
}

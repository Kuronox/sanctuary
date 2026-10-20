// Step 15, solo lectura: que limito el resultado (stock, prueba de comercio, roturas) y detalle de las salvaguardas.
// Uso: node tools/auditoria_po/step15_limites.mjs <carpeta de corrida> [...]
import fs from "node:fs"; import readline from "node:readline";
const NEED = "necesita un arma: recuerda derrotas que un arma habria evitado", W = 168, THRESHOLD = 80.63;
const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const out = (...a) => console.log(...a);
const clean = (s) => s.replace(" (sujeto de control)", "*");

for (const d of process.argv.slice(2)) {
  const st = JSON.parse(fs.readFileSync(`${d}/state.json`, "utf-8"));
  const ag = st.agents, ids = Object.keys(ag);
  const tradeJobs = new Set(st.worldSeed.jobs.filter((j) => j.trial?.type === "trade_count").map((j) => j.id));
  const markets = new Set(Object.keys(st.markets).filter((m) => st.locations?.[m]?.governance !== "ninguna" && st.worldSeed.locations.find((l) => l.id === m)?.governance !== "ninguna"));
  const stock = Object.fromEntries(Object.keys(st.markets).map((m) => [m, 10])), stockTL = Object.fromEntries(Object.keys(st.markets).map((m) => [m, [[0, 10]]]));
  const armedTL = Object.fromEntries(ids.map((i) => [i, [[0, false]]])), trialTL = Object.fromEntries(ids.map((i) => [i, [[0, false]]])), lossTicks = Object.fromEntries(ids.map((i) => [i, []]));
  const since = {}, armed = {}; // peleas desde el ultimo equipamiento o reparacion del arma
  const lossBy = { armed: {}, unarmed: {} }, winBy = { armed: 0, unarmed: 0 }, wearBucket = { "menos de 40": 0, "40 a 119": 0, "120 o mas": 0 };
  const needBuys = [];
  const fight = (id) => { if (armed[id]) since[id] = (since[id] || 0) + 1; };
  for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/events.jsonl`) })) {
    const m = /"type":"(\w+)"/.exec(l); if (!m) continue; const t = m[1];
    if (!["trade_buy", "trade_sell", "equip", "repair", "combat_loss", "combat_win", "party_combat_win", "party_combat_loss", "rebirth", "permanent_death", "trial_started", "class_change"].includes(t)) continue;
    const e = JSON.parse(l), id = e.actorId, k = e.tick;
    if (t === "trade_buy" || t === "trade_sell") { if (/ de arma_hierro por /.test(e.summary)) { stock[e.location] += t === "trade_buy" ? -e.data.qty : e.data.qty; stockTL[e.location].push([k, stock[e.location]]); } }
    else if (t === "equip") { if (e.data.slot === "weapon") { armed[id] = true; since[id] = 0; armedTL[id].push([k, true]); } }
    else if (t === "repair") { if (e.data.slot === "weapon") since[id] = 0; }
    else if (t === "rebirth" || t === "permanent_death") { armed[id] = false; armedTL[id].push([k, false]); trialTL[id].push([k, false]); }
    else if (t === "trial_started") trialTL[id].push([k, tradeJobs.has(e.data.jobId)]);
    else if (t === "class_change") trialTL[id].push([k, false]);
    else if (t === "combat_win") { winBy[armed[id] ? "armed" : "unarmed"]++; fight(id); }
    else if (t === "combat_loss") {
      const g = armed[id] ? "armed" : "unarmed", key = `${e.data.family} ${e.data.rank}`; lossBy[g][key] = (lossBy[g][key] || 0) + 1; lossTicks[id].push(k);
      if (armed[id]) { const n = since[id] || 0; wearBucket[n < 40 ? "menos de 40" : n < 120 ? "40 a 119" : "120 o mas"]++; }
      fight(id);
    } else { fight(id); if (e.data.partnerId) fight(e.data.partnerId); }
  }
  const at = (arr, tick) => { let lo = 0, hi = arr.length - 1, r = arr[0][1]; while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid][0] <= tick) { r = arr[mid][1]; lo = mid + 1; } else hi = mid - 1; } return r; };
  const recentLoss = (id, tick) => lossTicks[id].some((x) => x < tick && tick - x <= W);

  // decisiones: agente sin arma (aproximado), con derrota individual en las 168 h previas y oro por encima del umbral
  const sit = { sinMercado: 0, agotado: 0, disponible: 0, disponibleTrial: 0 }, agentsSit = { sinMercado: new Set(), agotado: new Set(), disponible: new Set() };
  let boughtNeed = 0, offered = 0; const afterGold = [], lastDec = {};
  const RE = /"agentId":"(agent_\d+)","tick":(\d+),.*?"situation":"En (\w+), hambre=([\d.]+), fatiga=[\d.]+, salud=([\d.]+)\/[\d.]+, oro=(-?\d+),.*?"selectedAction":"(\w+)","target":(?:"(\w+)"|null)/;
  for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/decisions.jsonl`) })) {
    const m = RE.exec(l); if (!m) continue; const id = m[1], tick = +m[2], loc = m[3], gold = +m[6];
    (lastDec[id] ??= []).push([tick, loc, +m[4], +m[5], gold, m[7]]); if (lastDec[id].length > 12) lastDec[id].shift();
    const need = l.includes(NEED); if (need && m[7] === "trade_buy") { boughtNeed++; needBuys.push({ id, tick, gold }); }
    if (gold < THRESHOLD || at(armedTL[id], tick) || !recentLoss(id, tick)) continue;
    if (!st.markets[loc] || st.worldSeed.locations.find((x) => x.id === loc)?.governance === "ninguna") { sit.sinMercado++; agentsSit.sinMercado.add(id); }
    else if (at(stockTL[loc], tick) <= 3) { sit.agotado++; agentsSit.agotado.add(id); }
    else { sit.disponible++; agentsSit.disponible.add(id); if (at(trialTL[id], tick)) sit.disponibleTrial++; if (l.includes('"type":"trade_buy","target":"arma_hierro"')) offered++; }
  }

  out(`\n######## ${d}`);
  const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "—";
  const tot = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  out(`PELEAS individuales con arma: ${winBy.armed + tot(lossBy.armed)}, perdidas ${tot(lossBy.armed)} (${(100 * tot(lossBy.armed) / Math.max(1, winBy.armed + tot(lossBy.armed))).toFixed(1)}%) | sin arma: ${winBy.unarmed + tot(lossBy.unarmed)}, perdidas ${tot(lossBy.unarmed)} (${(100 * tot(lossBy.unarmed) / Math.max(1, winBy.unarmed + tot(lossBy.unarmed))).toFixed(1)}%)`);
  out(`   derrotas con arma por monstruo: ${fmt(lossBy.armed)}`);
  out(`   derrotas sin arma por monstruo: ${fmt(lossBy.unarmed)}`);
  out(`   derrotas "con arma" segun peleas desde que la equipo o reparo (se rompe entre 40 y 120 peleas): ${fmt(wearBucket)}`);
  const total = sit.sinMercado + sit.agotado + sit.disponible;
  out(`LIMITES decisiones de un agente sin arma, con derrota individual en las ${W} h previas y oro >= ${THRESHOLD}: ${total}`);
  out(`   en lugar sin mercado: ${sit.sinMercado} (${agentsSit.sinMercado.size} agentes) | mercado con 3 armas o menos: ${sit.agotado} (${agentsSit.agotado.size} agentes) | mercado con arma disponible: ${sit.disponible} (${agentsSit.disponible.size} agentes), de ellas con prueba de comercio activa ${sit.disponibleTrial}`);
  out(`   con arma disponible: la compra del arma estuvo entre las 6 mejores en ${offered} | compras por necesidad en la corrida: ${boughtNeed}`);
  const inv = Object.values(ag).map((a) => [clean(a.name), a.inventory.arma_hierro || 0, a.class, !!a.progression.trial && tradeJobs.has(a.progression.trial.targetJobId), a.alive]).filter((x) => x[1] > 0);
  out(`INVENTARIO armas sin equipar al final: ${inv.reduce((s, x) => s + x[1], 0)} en ${inv.length} agentes: ${inv.map((x) => `${x[0]} ${x[1]} (${x[2]}${x[3] ? ", prueba de comercio" : ""}${x[4] ? "" : ", muerto"})`).join("; ") || "—"}`);
  out(`ORO tras cada compra por necesidad (oro previo menos 65.63 como minimo): oro previo minimo ${needBuys.length ? Math.min(...needBuys.map((x) => x.gold)) : "—"}, mediano ${med(needBuys.map((x) => x.gold))} | compras con oro previo menor de 100: ${needBuys.filter((x) => x.gold < 100).length}, menor de 200: ${needBuys.filter((x) => x.gold < 200).length}`);
  const buyers = new Set(needBuys.map((x) => x.id));
  const poor = Object.values(ag).filter((a) => a.gold < 5);
  out(`POBRES al final (oro < 5): ${poor.length}; de ellos compraron un arma por necesidad alguna vez: ${poor.filter((a) => buyers.has(a.id)).length} (${poor.filter((a) => buyers.has(a.id)).map((a) => `${clean(a.name)}, ultima compra tick ${Math.max(...needBuys.filter((x) => x.id === a.id).map((x) => x.tick))}`).join("; ") || "—"}) | con arma equipada ${poor.filter((a) => a.equipment.weapon).length} | muertos definitivos ${poor.filter((a) => !a.alive).length}`);
  for (const a of Object.values(ag)) for (const x of a.deathHistory) if (x.cause === "hambre") {
    const nb = needBuys.filter((b) => b.id === a.id && b.tick <= x.tick);
    out(`HAMBRE ${clean(a.name)} (${a.id}) muere en el tick ${x.tick} en ${x.location}, ${x.jobId} | compras por necesidad antes: ${nb.length}${nb.length ? `, la ultima ${x.tick - nb.at(-1).tick} h antes` : ""}${a.deathHistory.at(-1) === x ? ` | ultimas decisiones (tick, lugar, hambre, salud, oro, accion): ${lastDec[a.id].map((r) => r.join(" ")).join(" · ")}` : ""}`);
  }
}

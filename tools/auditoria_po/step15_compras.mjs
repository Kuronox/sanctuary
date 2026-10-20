// Step 15, solo lectura: compras de equipo, equipamiento, reventa, salvaguardas y oferta de armas de una corrida guardada.
// Uso: node tools/auditoria_po/step15_compras.mjs <carpeta de corrida> [...]
import fs from "node:fs"; import readline from "node:readline";
const NEED = "necesita un arma: recuerda derrotas que un arma habria evitado", W = 168, POOR = 5;
const EQUIP = { arma_hierro: "weapon", armadura_cuero: "armor", herramienta_recoleccion: "tool" };
const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const pct = (a, b) => (b ? `${Math.round(1000 * a / b) / 10}%` : "—");
const out = (...a) => console.log(...a);

for (const d of process.argv.slice(2)) {
  const st = JSON.parse(fs.readFileSync(`${d}/state.json`, "utf-8"));
  const ag = st.agents, ids = Object.keys(ag);
  const tradeJobs = new Set(st.worldSeed.jobs.filter((j) => j.trial?.type === "trade_count").map((j) => j.id));
  const markets = Object.keys(st.markets).filter((m) => st.markets[m].stock.arma_hierro != null);

  // ---------- pasada 1: eventos ----------
  const tl = Object.fromEntries(ids.map((i) => [i, []])); // por agente: compras, ventas y equipamientos de equipo, derrotas, muertes
  const armed = {}, trial = {}, types = {}, losses = [], buys = [];
  const stock = Object.fromEntries(markets.map((m) => [m, 10])), lowSince = {}, lowHours = Object.fromEntries(markets.map((m) => [m, 0])), firstLow = {};
  let wins = 0, repairs = 0, lastTick = 0;
  const moveStock = (m, good, dq, t) => {
    if (good !== "arma_hierro" || stock[m] == null) return;
    const was = stock[m] <= 3; stock[m] += dq; const is = stock[m] <= 3;
    if (!was && is) { lowSince[m] = t; firstLow[m] ??= t; } else if (was && !is) lowHours[m] += t - lowSince[m];
  };
  for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/events.jsonl`) })) {
    const m = /"type":"(\w+)"/.exec(l); if (!m) continue; const t = m[1]; types[t] = (types[t] || 0) + 1;
    if (!["trade_buy", "trade_sell", "equip", "combat_loss", "combat_win", "rebirth", "permanent_death", "trial_started", "class_change", "repair"].includes(t)) continue;
    const e = JSON.parse(l), id = e.actorId, k = e.tick; lastTick = k;
    if (t === "trade_buy" || t === "trade_sell") {
      const good = / de (\w+) por /.exec(e.summary)?.[1]; if (!EQUIP[good]) continue;
      moveStock(e.location, good, t === "trade_buy" ? -e.data.qty : e.data.qty, k);
      const x = { t: t === "trade_buy" ? "buy" : "sell", tick: k, good, qty: e.data.qty, loc: e.location, id, tradeTrial: !!trial[id], armed: !!armed[id] };
      tl[id].push(x); if (x.t === "buy") buys.push(x);
    } else if (t === "equip") { tl[id].push({ t: "equip", tick: k, good: e.data.itemId }); if (e.data.slot === "weapon") armed[id] = true; }
    else if (t === "combat_win") wins++;
    else if (t === "combat_loss") { const x = { t: "loss", tick: k, id, armed: !!armed[id] }; losses.push(x); tl[id].push(x); }
    else if (t === "rebirth" || t === "permanent_death") { armed[id] = false; trial[id] = false; tl[id].push({ t: "death", tick: k }); }
    else if (t === "trial_started") trial[id] = tradeJobs.has(e.data.jobId);
    else if (t === "class_change") trial[id] = false;
    else if (t === "repair") repairs++;
  }
  for (const m of markets) if (stock[m] <= 3) lowHours[m] += lastTick - lowSince[m];

  // ---------- pasada 2: decisiones ----------
  const buyKey = new Map(buys.map((b) => [`${b.id}|${b.tick}|${b.good}`, b]));
  const run = {}, streaks = []; let needReasonAll = 0;
  const RE = /"agentId":"(agent_\d+)","tick":(\d+),.*?oro=(-?\d+), oficio=(\w+).*?"selectedAction":"(\w+)","target":(?:"(\w+)"|null)/;
  for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/decisions.jsonl`) })) {
    const m = RE.exec(l); if (!m) continue; const id = m[1], tick = +m[2], gold = +m[3];
    if (gold < POOR) run[id] ??= tick; else if (run[id] != null) { streaks.push(tick - run[id]); run[id] = null; }
    if (m[5] !== "trade_buy") continue;
    const need = l.includes(NEED); if (need) needReasonAll++;
    const b = buyKey.get(`${id}|${tick}|${m[6]}`); if (b) { b.gold = gold; b.cls = m[4]; b.need = need; }
  }

  // ---------- que paso con cada arma comprada ----------
  const lossBefore = (id, tick) => tl[id].filter((x) => x.t === "loss" && x.tick <= tick && tick - x.tick <= W).length;
  for (const b of buys.filter((x) => x.good === "arma_hierro")) {
    const after = tl[b.id].filter((x) => x.tick >= b.tick && x !== b);
    const next = after.find((x) => (x.good === "arma_hierro" && (x.t === "equip" || x.t === "sell")) || x.t === "death");
    b.fate = !next ? "conserva" : next.t === "equip" ? "equipa" : next.t === "sell" ? "vende" : "muere";
    b.delay = next ? next.tick - b.tick : null; b.lossesBefore = lossBefore(b.id, b.tick);
    if (b.fate === "vende") b.sellWithNeed = lossBefore(b.id, next.tick) > 0 && !b.armed && !after.some((x) => x.t === "buy" && x.good === "arma_hierro" && x.tick <= next.tick);
    const eq = after.find((x) => x.t === "equip" && x.good === "arma_hierro"); const dth = after.find((x) => x.t === "death");
    b.everEquips = !!eq && (!dth || eq.tick <= dth.tick);
  }
  const wb = buys.filter((x) => x.good === "arma_hierro"), nb = wb.filter((x) => x.need);
  const row = (xs) => { const e24 = xs.filter((x) => x.fate === "equipa" && x.delay <= 24).length; const f = (k) => xs.filter((x) => x.fate === k).length;
    return `${xs.length} compras | equipadas en 24 h ${e24} (${pct(e24, xs.length)}) | equipa despues de 24 h ${f("equipa") - e24} | vende antes de equipar ${f("vende")} | muere antes ${f("muere")} | la conserva sin equipar ${f("conserva")}`; };
  const byCls = (xs) => Object.entries(xs.reduce((o, x) => ((o[x.cls] = (o[x.cls] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "—";

  out(`\n######## ${d} (seed ${st.seedNumber}, ${st.time.tick} ticks, ${ids.length} agentes)`);
  out(`VALIDACION stock de armas reconstruido = estado final: ${markets.filter((m) => Math.abs(stock[m] - st.markets[m].stock.arma_hierro) < 0.01).length} de ${markets.length} mercados | compras de equipo con decision encontrada: ${buys.filter((b) => b.gold != null).length} de ${buys.length} | decisiones de compra con la razon de necesidad: ${needReasonAll}`);
  out(`C1 por necesidad: ${row(nb)}`);
  out(`   por necesidad, sin prueba de comercio: ${row(nb.filter((x) => !x.tradeTrial))}`);
  out(`   por necesidad, con prueba de comercio activa: ${row(nb.filter((x) => x.tradeTrial))}`);
  out(`   todas las armas: ${row(wb)}`);
  out(`   todas, sin prueba de comercio: ${row(wb.filter((x) => !x.tradeTrial))}`);
  out(`   todas, con prueba de comercio activa: ${row(wb.filter((x) => x.tradeTrial))}`);
  out(`   sin razon de necesidad: ${row(wb.filter((x) => !x.need))}`);
  out(`   por necesidad: ${new Set(nb.map((x) => x.id)).size} agentes | clase: ${byCls(nb)} | oro al comprar: mediana ${med(nb.map((x) => x.gold))}, minimo ${nb.length ? Math.min(...nb.map((x) => x.gold)) : "—"} | horas hasta equipar (las que equipan): mediana ${med(nb.filter((x) => x.fate === "equipa").map((x) => x.delay))}, maximo ${Math.max(0, ...nb.filter((x) => x.fate === "equipa").map((x) => x.delay))} | terminan equipadas alguna vez ${nb.filter((x) => x.everEquips).length}`);
  out(`   compras por necesidad con prueba de comercio: ${new Set(nb.filter((x) => x.tradeTrial).map((x) => x.id)).size} agentes; de esas compras terminan equipadas alguna vez ${nb.filter((x) => x.tradeTrial && x.everEquips).length}`);
  out(`   todas las armas por clase: ${byCls(wb)}`);
  out(`C2 compras por necesidad sin ninguna derrota individual en las ${W} h previas: ${nb.filter((x) => !x.lossesBefore).length}`);
  const alive = Object.values(ag).filter((a) => a.alive);
  out(`C3 agentes con arma al final: ${Object.values(ag).filter((a) => a.equipment.weapon).length} de ${ids.length} (vivos ${alive.filter((a) => a.equipment.weapon).length} de ${alive.length}) | con armadura ${Object.values(ag).filter((a) => a.equipment.armor).length} | con herramienta ${Object.values(ag).filter((a) => a.equipment.tool).length} | agentes que equiparon un arma alguna vez ${ids.filter((i) => tl[i].some((x) => x.t === "equip" && x.good === "arma_hierro")).length}`);
  const un = losses.filter((x) => !x.armed);
  out(`   derrotas individuales ${losses.length} de ${losses.length + wins} peleas (${pct(losses.length, losses.length + wins)}) | sin arma ${un.length} | con arma ${losses.length - un.length}`);
  const cnt = (g) => buys.filter((x) => x.good === g);
  out(`C5 compras de herramienta: ${cnt("herramienta_recoleccion").length} (${byCls(cnt("herramienta_recoleccion"))}) | con la razon de necesidad ${cnt("herramienta_recoleccion").filter((x) => x.need).length}`);
  out(`C5b compras de armadura: ${cnt("armadura_cuero").length} (${byCls(cnt("armadura_cuero"))}) | con la razon de necesidad ${cnt("armadura_cuero").filter((x) => x.need).length}`);
  const deaths = Object.values(ag).flatMap((a) => a.deathHistory);
  out(`C6 muertes por hambre: ${deaths.filter((x) => x.cause === "hambre").length} | por combate ${deaths.filter((x) => x.cause === "combate").length} | total ${deaths.length} | definitivas ${Object.values(ag).filter((a) => !a.alive).length}`);
  const golds = alive.map((a) => a.gold);
  out(`C7 agentes con menos de ${POOR} de oro al final: ${Object.values(ag).filter((a) => a.gold < POOR).length} de ${ids.length} (vivos ${golds.filter((g) => g < POOR).length} de ${alive.length}) | oro mediano de los vivos ${Math.round(med(golds))}`);
  // C8 (rachas de pobreza) se mide con decisiones_po.mjs, que es el metodo de la linea base.
  const sold = nb.filter((x) => x.fate === "vende");
  out(`C10 armas compradas por necesidad y vendidas antes de equipar: ${sold.length} | de ellas, vendidas con alguna derrota individual en las ${W} h previas a la venta: ${sold.filter((x) => x.sellWithNeed).length} | horas de la compra a la venta: ${sold.map((x) => x.delay).join(", ") || "—"}`);
  out(`C11 mercados con 3 armas o menos al final: ${markets.filter((m) => st.markets[m].stock.arma_hierro <= 3).length} de ${markets.length} | stock final: ${markets.map((m) => `${m} ${st.markets[m].stock.arma_hierro}`).join(", ")}`);
  out(`   horas con 3 o menos: ${markets.filter((m) => lowHours[m] > 0).map((m) => `${m} ${lowHours[m]} h (desde el tick ${firstLow[m]})`).join(", ") || "ninguna"} | armas en todos los mercados al final: ${markets.reduce((s, m) => s + st.markets[m].stock.arma_hierro, 0)} de ${markets.length * 10} iniciales`);
  const firstEq = ids.map((i) => { const l0 = tl[i].find((x) => x.t === "loss"); const eq = l0 && tl[i].find((x) => x.t === "equip" && x.good === "arma_hierro" && x.tick >= l0.tick); return l0 ? (eq ? eq.tick - l0.tick : -1) : null; }).filter((x) => x != null);
  out(`OTROS agentes con alguna derrota individual ${firstEq.length}; de ellos equipan un arma despues ${firstEq.filter((x) => x >= 0).length}, mediana de horas desde la primera derrota ${med(firstEq.filter((x) => x >= 0))} | mantenimiento pagado ${Math.round(st.stats.equipmentMaintenancePaid)} en ${st.stats.equipmentMaintenancePayments} pagos | reparaciones ${repairs} | ventas de armas ${Object.values(tl).flat().filter((x) => x.t === "sell" && x.good === "arma_hierro").length}`);
  out(`   acciones: ${["work", "trade_buy", "trade_sell", "gather", "talk", "craft", "equip", "combat_win", "combat_loss", "party_combat_win", "party_combat_loss"].map((k) => `${k} ${types[k] || 0}`).join(", ")}`);
  out(`   con prueba de comercio abierta al final: ${alive.filter((a) => a.progression.trial && tradeJobs.has(a.progression.trial.targetJobId)).length} agentes`);
}

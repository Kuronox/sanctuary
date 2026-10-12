// Evidencia para las 5 decisiones de PO. Solo lectura: state.json + events.jsonl + decisions.jsonl de una corrida.
import fs from "node:fs"; import readline from "node:readline";
const d = process.argv[2];
const st = JSON.parse(fs.readFileSync(`${d}/state.json`, "utf-8"));
const ag = st.agents; const ids = Object.keys(ag); const N = ids.length; const idx = Object.fromEntries(ids.map((id, i) => [id, i]));
const locs = st.worldSeed.locations; const cityByName = Object.fromEntries(locs.map((l) => [l.name, l.id]));
const DAYS = 301; const day = (t) => Math.min(DAYS - 1, Math.floor(t / 24));
const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r1 = (x) => Math.round(x * 10) / 10;
const out = (...a) => console.log(...a);

// ---------- pasada por eventos ----------
const cls = Object.fromEntries(ids.map((id) => [id, "novato"]));
const work = {}, workN = new Float32Array(N), workGold = new Float32Array(N), eatN = new Float32Array(N);
const eatCityDay = {}; const buys = {}, buysByClass = {}, equipByClass = {}, crafts = {};
const rebirths = []; const rebirthRoute = {}; const travelDest = new Map(); const hungerDeathsDay = [];
let contrib = 0, contribN = 0, contractGold = 0, warDeclared = 0, bails = 0;
const emb = { n: 0, caught: 0, gold: 0, goldCaught: 0 }; const run = {}; const streaks = [];
const closeRun = (k, endedBy, tick) => { const r = run[k]; if (r && r.n) streaks.push({ ...r, endedBy, hours: tick - r.start }); delete run[k]; };
const curGuild = {}; const samples = {}; const donated = new Float32Array(N); const eqSell = {}; const lastEqBuy = {}; const resaleLag = [];
const EQ = /^(arma_hierro|armadura_cuero|herramienta_recoleccion)$/;
for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/events.jsonl`) })) {
  const m = /"type":"(\w+)"/.exec(l); if (!m) continue; const t = m[1];
  if (!["work", "eat", "trade_buy", "equip", "craft", "rebirth", "travel_start", "class_change", "guild_contribution", "guild_embezzle", "guild_contract_success", "guild_war_declared", "arrest", "guild_joined", "guild_left", "guild_founded", "guild_expelled", "trade_sell"].includes(t)) continue;
  const e = JSON.parse(l); const id = e.actorId;
  if (!samples[t]) samples[t] = l.slice(0, 260);
  switch (t) {
    case "class_change": cls[id] = e.data.jobId; break;
    case "work": { const c = cls[id]; (work[c] ??= { n: 0, g: 0 }); work[c].n++; work[c].g += e.data.income || 0; workN[idx[id]]++; workGold[idx[id]] += e.data.income || 0; break; }
    case "eat": { eatN[idx[id]]++; const k = e.location; (eatCityDay[k] ??= new Float32Array(DAYS))[day(e.tick)]++; break; }
    case "trade_buy": { const g = /compra [\d.]+ de (\w+) por/.exec(e.summary)?.[1] || "?"; (buys[g] ??= { n: 0, gold: 0 }); buys[g].n++; buys[g].gold += e.data.totalCost || 0; if (EQ.test(g)) { buysByClass[cls[id]] = (buysByClass[cls[id]] || 0) + 1; lastEqBuy[id + g] = e.tick; } break; }
    case "equip": { const item = e.data.itemId || /(arma_hierro|armadura_cuero|herramienta_recoleccion)/.exec(l)?.[1] || "?"; const k = `${cls[id]}:${item}`; equipByClass[k] = (equipByClass[k] || 0) + 1; break; }
    case "craft": { const g = e.data.good || /(arma_hierro|armadura_cuero|herramienta_recoleccion|pocion_curativa)/.exec(l)?.[1] || "?"; crafts[g] = (crafts[g] || 0) + 1; break; }
    case "rebirth": { rebirths.push({ id, tick: e.tick }); cls[id] = "novato"; const k = `${e.data.fromLocation}>${e.data.toLocation}`; rebirthRoute[k] = (rebirthRoute[k] || 0) + 1; break; }
    case "travel_start": { const name = /parte hacia (.+)\.$/.exec(e.summary)?.[1]; travelDest.set(`${id}|${e.tick}`, { from: e.location, to: cityByName[name] || name }); break; }
    case "guild_contribution": contrib += e.data.amount; contribN++; donated[idx[id]] += e.data.amount; break;
    case "trade_sell": { const g = /vende [\d.]+ de (\w+) por/.exec(e.summary)?.[1] || ""; if (EQ.test(g)) { eqSell[cls[id]] = (eqSell[cls[id]] || 0) + 1; const lb = lastEqBuy[id + g]; if (lb != null) { resaleLag.push(e.tick - lb); delete lastEqBuy[id + g]; } } break; }
    case "guild_contract_success": contractGold += +(/gana (\d+) de oro/.exec(e.summary)?.[1] || 0); break;
    case "guild_war_declared": warDeclared++; break;
    case "arrest": if (e.data.bailedBy) bails++; break;
    case "guild_joined": case "guild_founded": curGuild[id] = e.data.guildId; break;
    case "guild_left": closeRun(`${id}|${curGuild[id]}`, "se fue", e.tick); curGuild[id] = null; break;
    case "guild_embezzle": {
      emb.n++; emb.gold += e.data.amount; const k = `${id}|${e.data.guildId}`;
      if (e.data.caught) { emb.caught++; emb.goldCaught += e.data.amount; closeRun(k, "descubierto", e.tick); curGuild[id] = null; }
      else { (run[k] ??= { id, guild: e.data.guildId, n: 0, gold: 0, start: e.tick }); run[k].n++; run[k].gold += e.data.amount; }
      break;
    }
  }
}
for (const k of Object.keys(run)) closeRun(k, "fin de corrida", st.time.tick);

// ---------- pasada por decisiones ----------
const gold = Array.from({ length: N }, () => new Float32Array(DAYS).fill(-1)); const where = Array.from({ length: N }, () => new Array(DAYS).fill(null));
const openReb = {}; for (const r of rebirths) (openReb[r.id] ??= []).push({ tick: r.tick, t15: null, t40: null });
const spells = []; const spell = {}; const travel = {}; const travelFlow = {};
const RE = /"agentId":"(agent_\d+)","tick":(\d+),.*?"situation":"En (\w+), hambre=([\d.]+), fatiga=[\d.]+, salud=[\d.]+\/[\d.]+, oro=(-?\d+), oficio=(\w+)/;
for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/decisions.jsonl`) })) {
  const m = RE.exec(l);
  if (m) {
    const id = m[1], tick = +m[2], g = +m[5], i = idx[id], dd = day(tick);
    gold[i][dd] = g; where[i][dd] = m[3];
    for (const r of openReb[id] || []) { if (tick <= r.tick) continue; if (r.t15 == null && g >= 15) r.t15 = tick - r.tick; if (r.t40 == null && g >= 40) r.t40 = tick - r.tick; }
    if (g < 5 && spell[id] == null) spell[id] = tick; else if (g >= 15 && spell[id] != null) { spells.push(tick - spell[id]); spell[id] = null; }
  }
  if (l.includes('"selectedAction":"travel"')) {
    const r = JSON.parse(l); const td = travelDest.get(`${r.agentId}|${r.tick}`); if (!td) continue;
    const rs = r.reasons.join(" ");
    const cat = /supervivencia/.test(rs) ? "huida forzada (salud/hambre)" : /encargo/.test(rs) ? "encargo de transporte" : /arbitraje/.test(rs) ? "arbitraje" : /amigo/.test(rs) ? "sigue a un amigo" : "disposicion a explorar";
    (travel[td.to] ??= {})[cat] = (travel[td.to][cat] || 0) + 1;
    const fk = `${td.from}>${td.to}`; if (cat.startsWith("huida")) travelFlow[fk] = (travelFlow[fk] || 0) + 1;
  }
}
// completar dias sin decision con el ultimo valor conocido
for (let i = 0; i < N; i++) { let lg = ag[ids[i]] ? -1 : -1, lw = ag[ids[i]].homeLocation; for (let k = 0; k < DAYS; k++) { if (gold[i][k] >= 0) lg = gold[i][k]; else gold[i][k] = lg; if (where[i][k]) lw = where[i][k]; else where[i][k] = lw; } }

// ================= PO1 =================
out(`\n######## ${d} (seed ${st.seedNumber})`);
out("== PO1 economia");
const alive = Object.values(ag).filter((a) => a.alive); const G = alive.map((a) => a.gold).sort((a, b) => a - b); const tot = G.reduce((s, x) => s + x, 0);
const gini = G.reduce((s, x, i) => s + (2 * (i + 1) - G.length - 1) * x, 0) / (G.length * tot);
out(` oro final (vivos ${G.length}): p10 ${r1(q(G, 0.1))} p25 ${r1(q(G, 0.25))} mediana ${r1(q(G, 0.5))} p75 ${r1(q(G, 0.75))} p90 ${r1(q(G, 0.9))} max ${Math.round(G.at(-1))} | total ${Math.round(tot)} | los 5 mas ricos tienen ${r1(100 * G.slice(-5).reduce((s, x) => s + x, 0) / tot)}% | Gini ${gini.toFixed(2)} | con menos de 5: ${G.filter((x) => x < 5).length}, menos de 15: ${G.filter((x) => x < 15).length}`);
out(" mediana de oro por dia:", [10, 30, 60, 100, 150, 200, 250, 300].map((k) => `d${k}=${med(gold.map((g) => g[k]).filter((x) => x >= 0))}`).join(" "), "| % agentes con oro<5:", [30, 100, 200, 300].map((k) => `d${k}=${Math.round(100 * gold.filter((g) => g[k] >= 0 && g[k] < 5).length / N)}%`).join(" "));
out(" ingreso por jornada de trabajo, por clase:", Object.entries(work).sort((a, b) => b[1].n - a[1].n).map(([c, v]) => `${c} ${r1(v.g / v.n)} (${v.n})`).join(" | "));
const wpd = [...workN].map((x) => x / 300), epd = [...eatN].map((x) => x / 300), ipd = [...workGold].map((x) => x / 300);
out(` por agente y dia (mediana / p25 / p75): jornadas ${r1(med(wpd))} / ${r1(q(wpd, 0.25))} / ${r1(q(wpd, 0.75))} | oro por trabajo ${r1(med(ipd))} / ${r1(q(ipd, 0.25))} / ${r1(q(ipd, 0.75))} | comidas ${r1(med(epd))} / ${r1(q(epd, 0.25))} / ${r1(q(epd, 0.75))} | agentes con 0 jornadas: ${wpd.filter((x) => x === 0).length}`);
const rb = Object.values(openReb).flat();
out(` recuperacion tras renacer (oro 0): ${rb.length} renacimientos | llegan a 15 de oro: ${rb.filter((r) => r.t15 != null).length}, mediana ${med(rb.filter((r) => r.t15 != null).map((r) => r.t15))} h, p75 ${q(rb.filter((r) => r.t15 != null).map((r) => r.t15).concat([0]), 0.75)} h | llegan a 40: ${rb.filter((r) => r.t40 != null).length}, mediana ${med(rb.filter((r) => r.t40 != null).map((r) => r.t40))} h`);
out(` rachas de pobreza (baja de 5 hasta volver a 15): ${spells.length} cerradas, duracion mediana ${med(spells)} h, p75 ${spells.length ? q(spells, 0.75) : "-"} h, p90 ${spells.length ? q(spells, 0.9) : "-"} h | abiertas al final: ${Object.values(spell).filter((x) => x != null).length}`);
out(` mantenimiento de equipo pagado en total ${Math.round(st.stats.equipmentMaintenancePaid)} en ${st.stats.equipmentMaintenancePayments} pagos`);

// ================= PO2 =================
out("== PO2 malversacion");
out(` total ${emb.n}, descubiertas ${emb.caught} (${r1(100 * emb.caught / (emb.n || 1))}%) | oro ${Math.round(emb.gold)}, en descubiertas ${Math.round(emb.goldCaught)}`);
const big = streaks.filter((s) => s.n >= 3).sort((a, b) => b.n - a.n);
out(` rachas sin descubrir (>=1): ${streaks.length} | de 3 o mas: ${big.length} | oro en rachas sin descubrir ${Math.round(streaks.reduce((s, x) => s + x.gold, 0))} | como terminan: ${JSON.stringify(streaks.reduce((o, s) => ((o[s.endedBy] = (o[s.endedBy] || 0) + 1), o), {}))}`);
for (const s of big.slice(0, 5)) { const g = st.guilds[s.guild]; out(`   ${ag[s.id].name} en ${g?.name}: ${s.n} robos, ${Math.round(s.gold)} oro, ${s.hours} h, termina: ${s.endedBy} | gremio hoy: ${g?.disbanded ? "disuelto (" + g.disbandReason + ")" : "activo, " + g.members.length + " miembros"}`); }

// ================= PO3 =================
out("== PO3 tesoros");
const Gs = Object.values(st.guilds); const act = Gs.filter((g) => !g.disbanded).sort((a, b) => b.treasury - a.treasury); const tt = act.reduce((s, g) => s + g.treasury, 0);
out(` gremios activos ${act.length}, tesoro total ${Math.round(tt)} | los 3 mayores tienen ${r1(100 * act.slice(0, 3).reduce((s, g) => s + g.treasury, 0) / (tt || 1))}% | oro en manos de agentes ${Math.round(tot)} | tesoro en gremios disueltos ${Math.round(Gs.filter((g) => g.disbanded).reduce((s, g) => s + g.treasury, 0))} (${Gs.filter((g) => g.disbanded).length} gremios)`);
out("  " + act.slice(0, 6).map((g) => `${g.name}: ${Math.round(g.treasury)} oro, ${g.members.length} miembros, rep ${Math.round(g.reputation)}, creado dia ${Math.floor(g.createdTick / 24)}`).join(" | "));
out(` entradas (eventos): aportes voluntarios ${Math.round(contrib)} en ${contribN} | recompensas de encargos ${contractGold} | salidas: malversado ${Math.round(emb.gold)} | declaraciones de guerra ${warDeclared} x ${st.worldSeed.guildWar.commitmentCost} = ${warDeclared * st.worldSeed.guildWar.commitmentCost} | multas cubiertas ${bails}`);

// ================= PO4 =================
{
  const dn = [...donated]; const totD = dn.reduce((a, b) => a + b, 0); const order = ids.map((id, i) => [id, dn[i], workGold[i]]).sort((a, b) => b[1] - a[1]);
  out(`EXTRA aportes: donantes ${dn.filter((x) => x > 0).length} de ${N} | mediana por donante ${Math.round(med(dn.filter((x) => x > 0)))} | los 5 mayores aportan ${r1(100 * order.slice(0, 5).reduce((a, x) => a + x[1], 0) / totD)}% | donaron mas de lo que ganaron trabajando: ${order.filter((x) => x[1] > x[2] && x[1] > 0).length} agentes | aporte medio por agente y dia ${r1(totD / N / 300)} | ingreso medio por trabajo por agente y dia ${r1([...workGold].reduce((a, b) => a + b, 0) / N / 300)}`);
  out("EXTRA mayores donantes: " + order.slice(0, 5).map((x) => `${ag[x[0]].name}: dono ${Math.round(x[1])}, gano trabajando ${Math.round(x[2])}, oro final ${Math.round(ag[x[0]].gold)}, lealtad ${ag[x[0]].personality.loyalty.toFixed(2)}, clase ${ag[x[0]].class}`).join(" | "));
  out(`EXTRA equipo revendido: ventas de equipo al mercado por clase ${JSON.stringify(eqSell)} | comprado y luego revendido ${resaleLag.length} veces, espera mediana ${med(resaleLag)} h`);
}
out("== PO4 equipo");
const A = Object.values(ag); const wp = st.worldSeed.goods.find((g) => g.id === "arma_hierro").basePrice;
out(` al final: con arma ${A.filter((a) => a.equipment.weapon).length}, armadura ${A.filter((a) => a.equipment.armor).length}, herramienta ${A.filter((a) => a.equipment.tool).length} de ${A.length}`);
const rich = alive.filter((a) => !a.equipment.weapon && a.gold >= wp * 3);
out(` vivos sin arma con oro >= ${wp * 3} (3 veces el precio base): ${rich.length} | por clase ${JSON.stringify(rich.reduce((o, a) => ((o[a.class] = (o[a.class] || 0) + 1), o), {}))} | con arma por clase ${JSON.stringify(A.filter((a) => a.equipment.weapon).reduce((o, a) => ((o[a.class] = (o[a.class] || 0) + 1), o), {}))}`);
out(" compras en mercado por bien:", Object.entries(buys).sort((a, b) => b[1].n - a[1].n).map(([g, v]) => `${g} ${v.n}`).join(", "), "| compras de equipo por clase:", JSON.stringify(buysByClass));
out(" equipamientos (clase:objeto):", JSON.stringify(equipByClass), "| fabricaciones:", JSON.stringify(crafts));
out(" stock de arma_hierro por mercado:", Object.entries(st.markets).map(([k, m]) => `${k} ${r1(m.stock.arma_hierro || 0)}`).join(", "));

// ================= PO5 =================
out("== PO5 concentracion");
const popAt = (k) => { const o = {}; for (let i = 0; i < N; i++) { if (!ag[ids[i]].alive && k >= 300) continue; o[where[i][k]] = (o[where[i][k]] || 0) + 1; } return o; };
for (const k of [1, 30, 100, 200, 300]) out(`  dia ${k}:`, Object.entries(popAt(k)).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", "));
for (const c of ["valdemarca", "aldea_tejo", "puerto_grisal", "praderas_vann"]) {
  const e = eatCityDay[c] || new Float32Array(DAYS); const pop = Array.from({ length: DAYS }, (_, k) => where.filter((w) => w[k] === c).length);
  const loc = locs.find((l) => l.id === c); const bonus = (loc.resources || []).filter((r) => r === "grano" || r === "pescado").length * 0.4;
  const days = [...Array(200).keys()].map((k) => k + 100);
  out(`  ${c}: poblacion media dias 100-300 ${r1(days.reduce((s, k) => s + pop[k], 0) / 200)} (max ${Math.max(...pop)}) | comidas/dia media ${r1(days.reduce((s, k) => s + e[k], 0) / 200)} | reposicion maxima/dia segun formula ${r1((0.6 + 0.4 + bonus) * 24)} | stock final ${r1(st.markets[c].stock.racion_comida || 0)}`);
}
out("  llegadas por motivo:"); for (const c of ["valdemarca", "aldea_tejo", "puerto_grisal", "praderas_vann", "ribera_sauce", "cruce_fangoso", "bosque_umbrio"]) out(`   ${c}: ${JSON.stringify(travel[c] || {})}`);
out("  huidas forzadas por ruta (top):", Object.entries(travelFlow).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(", "));
out("  renacimientos por ruta:", JSON.stringify(rebirthRoute));
const hd = []; for (const a of A) for (const x of a.deathHistory) if (x.cause === "hambre") hd.push(`${a.name} dia ${Math.floor(x.tick / 24)} en ${x.location}`); out("  muertes por hambre:", hd.join(" | ") || "ninguna");
out("  muestras:", JSON.stringify({ equip: samples.equip, craft: samples.craft, trade_buy: samples.trade_buy }));

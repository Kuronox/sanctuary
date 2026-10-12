// Solo lectura. Cruza derrotas sin arma, pertenencia a gremio, oro propio, tesoro del gremio y hambre.
// Uso: node tools/auditoria_po/tesoreria_y_armas.mjs <carpeta de corrida>
import fs from "node:fs"; import readline from "node:readline";
const d = process.argv[2];
const st = JSON.parse(fs.readFileSync(`${d}/state.json`, "utf-8"));
const ag = st.agents, ids = Object.keys(ag), G = st.guilds;
const WEAPON = Math.round(25 * (25 / 10) * 1.05 * 100) / 100; // precio con stock 10 (x2.5) mas 5% de impuesto = 65.63
const WEAPON_BASE = 25 * 1.05, MEAL_MAX = 6, RICH = 1000, HUNGER = 0.85;
const MARKETS = new Set(st.worldSeed.locations.filter((l) => l.governance !== "ninguna").map((l) => l.id));
const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : 0);
const clean = (s) => s.replace(" (sujeto de control)", "*");
const byNameLen = Object.values(ag).sort((a, b) => b.name.length - a.name.length);
const gw = (a, goal) => a.goals.find((x) => x.goal === goal)?.weight || 0;

// ---------- pasada 1: eventos ----------
const cur = {}, armed = {}; const memTL = Object.fromEntries(ids.map((i) => [i, [[0, null]]])), wpnTL = Object.fromEntries(ids.map((i) => [i, [[0, false]]]));
const tre = {}; const losses = []; let fightsSolo = 0;
const setGuild = (id, g, t) => { cur[id] = g; memTL[id].push([t, g]); };
const setArmed = (id, v, t) => { armed[id] = v; wpnTL[id].push([t, v]); };
const delta = (g, t, v) => { if (g) (tre[g] ??= []).push([t, v]); };
for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/events.jsonl`) })) {
  const m = /"type":"(\w+)"/.exec(l); if (!m) continue; const t = m[1];
  if (!["combat_loss", "combat_win", "equip", "rebirth", "permanent_death", "guild_founded", "guild_joined", "guild_left", "guild_expelled", "guild_contribution", "guild_embezzle", "guild_war_declared"].includes(t)) continue;
  const e = JSON.parse(l), id = e.actorId, k = e.tick;
  switch (t) {
    case "guild_founded": case "guild_joined": setGuild(id, e.data.guildId, k); break;
    case "guild_left": setGuild(id, null, k); break;
    case "guild_expelled": { const a = byNameLen.find((x) => e.summary.startsWith(`${x.name} es expulsado de `)); if (a) setGuild(a.id, null, k); break; }
    case "rebirth": case "permanent_death": setGuild(id, null, k); setArmed(id, false, k); break;
    case "equip": if (e.data.slot === "weapon") setArmed(id, true, k); break;
    case "guild_contribution": delta(cur[id], k, e.data.amount); break;
    case "guild_embezzle": delta(e.data.guildId, k, -e.data.amount); break;
    case "guild_war_declared": delta(cur[id], k, -st.worldSeed.guildWar.commitmentCost); break;
    case "combat_win": fightsSolo++; break;
    case "combat_loss": fightsSolo++; losses.push({ id, tick: k, armed: !!armed[id], guild: cur[id] || null, loc: e.location }); break;
  }
}
// tesoro reconstruido (aportes - malversado - inscripciones a disputas; no incluye cuotas, encargos, multas ni mantenimiento)
const trePrefix = {}; for (const [g, arr] of Object.entries(tre)) { let s = 0; trePrefix[g] = arr.map(([t, v]) => [t, (s += v)]); }
const lookup = (arr, tick) => { let lo = 0, hi = arr.length - 1, r = null; while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid][0] <= tick) { r = arr[mid][1]; lo = mid + 1; } else hi = mid - 1; } return r; };
const treasuryAt = (g, tick) => (g && trePrefix[g] ? lookup(trePrefix[g], tick) ?? 0 : 0);
const guildAt = (id, tick) => lookup(memTL[id], tick);
const armedAt = (id, tick) => lookup(wpnTL[id], tick);

// ---------- pasada 2: decisiones ----------
const lossKey = new Map(losses.map((x) => [`${x.id}|${x.tick}`, x]));
const hungerRich = {}, hungerAny = {}; const buy = { n: 0, chosen: {}, chosenScore: [], buyScore: [], inTop6: 0, picked: 0, agents: new Set(), fightChosen: 0 };
const RE = /"agentId":"(agent_\d+)","tick":(\d+),.*?"situation":"En (\w+), hambre=([\d.]+), fatiga=[\d.]+, salud=[\d.]+\/[\d.]+, oro=(-?\d+),.*?"selectedAction":"(\w+)"/;
for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/decisions.jsonl`) })) {
  const m = RE.exec(l); if (!m) continue;
  const id = m[1], tick = +m[2], loc = m[3], hunger = +m[4], gold = +m[5], sel = m[6];
  const L = lossKey.get(`${id}|${tick}`); if (L && sel === "fight_monster") L.gold = gold;
  if (hunger >= HUNGER) {
    const g = guildAt(id, tick);
    if (g) { (hungerAny[id] ??= { n: 0, poor: 0 }); hungerAny[id].n++; if (gold < MEAL_MAX) hungerAny[id].poor++;
      if (treasuryAt(g, tick) >= RICH) { (hungerRich[id] ??= { n: 0, poor: 0, guilds: new Set() }); hungerRich[id].n++; hungerRich[id].guilds.add(g); if (gold < MEAL_MAX) hungerRich[id].poor++; } }
  }
  if (gold >= WEAPON && MARKETS.has(loc) && !armedAt(id, tick)) {
    const r = JSON.parse(l); const a = ag[id]; buy.n++; buy.agents.add(id);
    buy.chosen[sel] = (buy.chosen[sel] || 0) + 1; const top = r.availableActions[0]; if (top) buy.chosenScore.push(top.score);
    buy.buyScore.push(a.personality.greed * 0.4 + gw(a, "riqueza") * 0.3);
    if (r.availableActions.some((x) => x.type === "trade_buy" && x.target === "arma_hierro")) buy.inTop6++;
    if (sel === "trade_buy" && r.target === "arma_hierro") buy.picked++;
  }
}

// ---------- salida ----------
const out = (...a) => console.log(...a);
out(`\n######## ${d} (seed ${st.seedNumber}) | precio de referencia del arma ${WEAPON}`);
// validacion
let memOk = 0; for (const id of ids) if ((cur[id] || null) === (ag[id].guildId || null)) memOk++;
const act = Object.values(G).filter((g) => !g.disbanded); const errs = act.filter((g) => g.treasury > 500).map((g) => ({ n: g.name, real: g.treasury, rec: treasuryAt(g.id, 1e9) }));
out(`VALIDACION pertenencia final reconstruida = estado: ${memOk} de ${ids.length} | tesoro reconstruido vs real (gremios activos con mas de 500): error relativo mediano ${med(errs.map((x) => Math.abs(x.rec - x.real) / x.real * 100))?.toFixed(1)}%, maximo ${Math.max(...errs.map((x) => Math.abs(x.rec - x.real) / x.real * 100)).toFixed(1)}% (${errs.length} gremios)`);

out("   detalle tesoro (nombre: real / reconstruido): " + errs.map((x) => `${x.n}: ${Math.round(x.real)} / ${Math.round(x.rec)}`).join(" | "));
out("   pertenencia que no coincide: " + (ids.filter((id) => (cur[id] || null) !== (ag[id].guildId || null)).map((id) => `${clean(ag[id].name)} reconstruido ${cur[id] || "ninguno"} estado ${ag[id].guildId || "ninguno"} vivo ${ag[id].alive}`).join(" | ") || "ninguna"));
const un = losses.filter((x) => !x.armed), unG = un.filter((x) => x.guild), withGold = unG.filter((x) => x.gold != null);
out(`P1 derrotas individuales ${losses.length} de ${fightsSolo} peleas | sin arma ${un.length} | sin arma y en gremio ${unG.length} (${new Set(unG.map((x) => x.id)).size} agentes) | sin arma y sin gremio ${un.length - unG.length} (${new Set(un.filter((x) => !x.guild).map((x) => x.id)).size} agentes)`);
const can = withGold.filter((x) => x.gold >= WEAPON), cannot = withGold.filter((x) => x.gold < WEAPON);
out(`P2 con oro conocido ${withGold.length} | podian pagar (oro >= ${WEAPON}) ${can.length} (${pct(can.length, withGold.length)}%), ${new Set(can.map((x) => x.id)).size} agentes | no podian ${cannot.length} (${pct(cannot.length, withGold.length)}%), ${new Set(cannot.map((x) => x.id)).size} agentes | sensibilidad con precio base ${WEAPON_BASE}: podian ${withGold.filter((x) => x.gold >= WEAPON_BASE).length}`);
out(`   oro al perder (sin arma, en gremio): mediana ${med(withGold.map((x) => x.gold))}, p25 ${withGold.map((x) => x.gold).sort((a, b) => a - b)[Math.floor(withGold.length / 4)]}, p75 ${withGold.map((x) => x.gold).sort((a, b) => a - b)[Math.floor(withGold.length * 3 / 4)]}`);
for (const x of cannot) x.tre = treasuryAt(x.guild, x.tick);
const fund1 = cannot.filter((x) => x.tre >= WEAPON), fundR = cannot.filter((x) => x.tre >= RICH);
out(`P3 no podian pagar y su gremio tenia al menos un arma de fondos (${WEAPON}): ${fund1.length} derrotas, ${new Set(fund1.map((x) => x.id)).size} agentes | gremio con ${RICH} o mas: ${fundR.length} derrotas, ${new Set(fundR.map((x) => x.id)).size} agentes | gremio sin fondos: ${cannot.length - fund1.length} derrotas`);
const perG = {}; for (const x of fund1) { (perG[x.guild] ??= { ids: new Set(), n: 0, tre: [] }); perG[x.guild].ids.add(x.id); perG[x.guild].n++; perG[x.guild].tre.push(x.tre); }
out(`P4 coste de armar a esos miembros (una vez cada uno, a ${WEAPON}):`);
let totC = 0; for (const [g, v] of Object.entries(perG).sort((a, b) => b[1].ids.size - a[1].ids.size)) { const c = v.ids.size * WEAPON; totC += c; out(`   ${G[g].name} [${g}]: ${v.ids.size} miembros, ${v.n} derrotas, coste ${Math.round(c)} | tesoro reconstruido en esas derrotas: mediana ${Math.round(med(v.tre))}, minimo ${Math.round(Math.min(...v.tre))} | tesoro real final ${Math.round(G[g].treasury)}${G[g].disbanded ? " (disuelto)" : ""} | ${[...v.ids].map((i) => clean(ag[i].name)).join(", ")}`); }
out(`   total: ${Object.values(perG).reduce((s, v) => s + v.ids.size, 0)} pares miembro-gremio, coste ${Math.round(totC)}`);
// estado final: miembros sin arma que pelearon
const fought = {}; for (const x of losses) fought[x.id] = 1;
out("   al final de la corrida, por gremio activo (miembros vivos / sin arma / sin arma con alguna derrota individual / coste de armar a estos / tesoro):");
for (const g of act.sort((a, b) => b.treasury - a.treasury).slice(0, 6)) { const ms = g.members.map((i) => ag[i]).filter((a) => a && a.alive); const noW = ms.filter((a) => !a.equipment.weapon); const need = noW.filter((a) => fought[a.id]); out(`   ${g.name}: ${ms.length} / ${noW.length} / ${need.length} / ${Math.round(need.length * WEAPON)} / ${Math.round(g.treasury)}`); }
const hr = Object.entries(hungerRich), ha = Object.entries(hungerAny);
out(`P5 miembros de gremios con ${RICH}+ de tesoro con hambre >= ${HUNGER} en alguna decision: ${hr.length} agentes, ${hr.reduce((s, [, v]) => s + v.n, 0)} decisiones (mediana por agente ${med(hr.map(([, v]) => v.n))}) | con 24 o mas decisiones asi: ${hr.filter(([, v]) => v.n >= 24).length} | de esas decisiones, con oro < ${MEAL_MAX}: ${hr.reduce((s, [, v]) => s + v.poor, 0)} (${hr.filter(([, v]) => v.poor > 0).length} agentes) | en cualquier gremio: ${ha.length} agentes, ${ha.reduce((s, [, v]) => s + v.n, 0)} decisiones`);
const hd = []; for (const a of Object.values(ag)) for (const x of a.deathHistory) if (x.cause === "hambre") hd.push(`${clean(a.name)} tick ${x.tick} gremio ${x.guildId ? G[x.guildId]?.name : "ninguno"}`); out(`   muertes por hambre: ${hd.join(" | ") || "ninguna"}`);
out(`COMPRA decisiones de un agente sin arma, con oro >= ${WEAPON}, en ciudad con mercado: ${buy.n} (${buy.agents.size} agentes) | compro un arma: ${buy.picked} | la compra del arma aparecio entre las 6 mejores: ${buy.inTop6}`);
out(`   puntuacion de la accion ganadora: mediana ${med(buy.chosenScore)?.toFixed(2)} | puntuacion calculada de comprar (codicia x0.4 + meta riqueza x0.3): mediana ${med(buy.buyScore)?.toFixed(2)}, maxima ${buy.buyScore.reduce((m, x) => (x > m ? x : m), 0).toFixed(2)} | decisiones en que comprar habria superado a la accion ganadora: ${buy.buyScore.filter((x, i) => x > buy.chosenScore[i]).length}`);
out("   que eligio en su lugar:", Object.entries(buy.chosen).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => `${k} ${pct(v, buy.n)}%`).join(", "));

// Auditoria Step 14: une cada decision de pelear sola (decisions.jsonl) con su resultado (events.jsonl)
// y reconstruye la penalizacion por derrotas previas con la misma formula del motor. Solo lectura.
import fs from "node:fs"; import readline from "node:readline";
const W = 168, FLAG = "recuerda derrotas recientes";
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : 0);
const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

for (const d of process.argv.slice(2)) {
  const st = JSON.parse(fs.readFileSync(`${d}/state.json`, "utf-8"));
  const ag = st.agents; const name = (id) => ag[id].name.replace(" (sujeto de control)", "*");
  // 1) eventos: resultado de cada pelea individual, y si iba equipado (aprox: hubo "equip" desde el ultimo renacimiento)
  const outcome = new Map(); const armed = {};
  for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/events.jsonl`) })) {
    const m = /"type":"(combat_win|combat_loss|rebirth|equip)"/.exec(l); if (!m) continue;
    const e = JSON.parse(l);
    if (m[1] === "rebirth") armed[e.actorId] = false;
    else if (m[1] === "equip") armed[e.actorId] = true;
    else outcome.set(`${e.actorId}|${e.tick}`, { mon: `${e.data.family}:${e.data.rank}`, win: m[1] === "combat_win", loc: e.location, armed: !!armed[e.actorId] });
  }
  // 2) decisiones de pelear
  const F = []; const lossTicks = {};
  for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/decisions.jsonl`) })) {
    if (!l.includes('"selectedAction":"fight_monster"')) continue;
    const r = JSON.parse(l); const o = outcome.get(`${r.agentId}|${r.tick}`); if (!o) continue;
    const s = /salud=([\d.]+)\/([\d.]+), oro=(-?\d+), oficio=(\w+) \(nivel (\d+)\), nivel base=(\d+)/.exec(r.situation);
    const key = `${r.agentId}|${o.mon}`; const prev = (lossTicks[key] ??= []);
    let sig = 0; for (const t of prev) { const age = r.tick - t; if (age <= W) sig += 1 - age / W; }
    const risk = ag[r.agentId].personality.riskTolerance;
    const P = Math.min(4, sig * (1 - 0.5 * risk));
    const top = r.availableActions; const self = top.find((a) => a.type === "fight_monster"); const rival = top.find((a) => a.type !== "fight_monster");
    F.push({ id: r.agentId, tick: r.tick, ...o, P, flag: r.reasons.some((x) => x.startsWith(FLAG)), risk, hp: +s[1] / +s[2], gold: +s[3], cls: s[4], lvl: +s[6],
      score: self?.score, margin: self && rival ? self.score - rival.score : null, rivalType: rival?.type });
    if (!o.win) prev.push(r.tick);
  }
  const L = F.filter((f) => !f.win);
  const grp = (key, rows = F) => { const g = {}; for (const f of rows) { const k = key(f); (g[k] ??= { n: 0, l: 0 }); g[k].n++; if (!f.win) g[k].l++; } return Object.entries(g).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k}: ${v.n} peleas, ${v.l} perdidas (${pct(v.l, v.n)}%)`).join(" | "); };
  const bucketP = (p) => (p === 0 ? "0" : p <= 0.5 ? "0-0.5" : p <= 1 ? "0.5-1" : p <= 2 ? "1-2" : "2-4");
  console.log(`\n================ ${d} (seed ${st.seedNumber})`);
  console.log(`peleas individuales decididas: ${F.length} | perdidas ${L.length} (${pct(L.length, F.length)}%)`);
  console.log(`marca "recuerda derrotas" en la decision: ${F.filter((f) => f.flag).length} peleas | penalizacion reconstruida > 0: ${F.filter((f) => f.P > 0).length} | coinciden: ${F.filter((f) => f.flag === (f.P > 0)).length} de ${F.length}`);
  console.log("por penalizacion reconstruida ->", grp((f) => bucketP(f.P)));
  console.log(`derrotas sin ningun recuerdo activo (penalizacion 0): ${L.filter((f) => f.P === 0).length} de ${L.length} (${pct(L.filter((f) => f.P === 0).length, L.length)}%)`);
  const flagged = F.filter((f) => f.P > 0 && f.margin != null);
  console.log(`peleas con penalizacion activa: margen mediano sobre la mejor alternativa ${med(flagged.map((f) => f.margin))?.toFixed(2)} | penalizacion mediana ${med(flagged.map((f) => f.P))?.toFixed(2)} | puntuacion mediana ${med(flagged.map((f) => f.score))?.toFixed(2)}`);
  const rv = {}; for (const f of flagged) rv[f.rivalType] = (rv[f.rivalType] || 0) + 1; console.log("  mejor alternativa en esas peleas:", JSON.stringify(rv));
  console.log("por monstruo ->", grp((f) => f.mon));
  console.log("por clase en el momento ->", grp((f) => f.cls));
  console.log("por nivel base ->", grp((f) => (f.lvl <= 2 ? "nv1-2" : f.lvl <= 5 ? "nv3-5" : f.lvl <= 9 ? "nv6-9" : "nv10+")));
  console.log("por equipo (aprox) ->", grp((f) => (f.armed ? "con equipo" : "sin equipo")));
  console.log("por tolerancia al riesgo ->", grp((f) => (f.risk < 0.5 ? "riesgo<0.5" : f.risk < 0.75 ? "riesgo 0.5-0.75" : "riesgo>=0.75")));
  console.log("por salud al decidir ->", grp((f) => (f.hp < 0.5 ? "salud<50%" : f.hp < 0.8 ? "salud 50-80%" : "salud>=80%")));
  console.log("por ciudad ->", grp((f) => f.loc));
  // concentracion y perfil personal
  const per = {}; for (const f of F) { (per[f.id] ??= { n: 0, l: 0, mons: {} }); per[f.id].n++; const mm = (per[f.id].mons[f.mon] ??= { n: 0, l: 0 }); mm.n++; if (!f.win) { per[f.id].l++; mm.l++; } }
  const ranked = Object.entries(per).sort((a, b) => b[1].l - a[1].l);
  const share = (k) => pct(ranked.slice(0, k).reduce((s, x) => s + x[1].l, 0), L.length);
  console.log(`agentes que pelearon solos: ${ranked.length} | con alguna derrota: ${ranked.filter((x) => x[1].l).length} | los 5 que mas pierden concentran ${share(5)}% | los 10, ${share(10)}%`);
  const chronic = ranked.filter(([, v]) => v.n >= 10 && v.l / v.n >= 0.4), solid = ranked.filter(([, v]) => v.n >= 10 && v.l / v.n < 0.15);
  console.log(`perdedores cronicos (>=10 peleas y >=40% perdidas): ${chronic.length} agentes, ${pct(chronic.reduce((s, x) => s + x[1].l, 0), L.length)}% de las derrotas | luchadores solidos (<15% perdidas): ${solid.length} agentes, ${pct(solid.reduce((s, x) => s + x[1].l, 0), L.length)}% de las derrotas`);
  for (const [id, v] of ranked.slice(0, 6)) {
    const mine = F.filter((f) => f.id === id), ml = mine.filter((f) => !f.win); const a = ag[id];
    const mons = Object.entries(v.mons).sort((x, y) => y[1].l - x[1].l).map(([k, m]) => `${k} ${m.l}/${m.n}`).join(", ");
    const cls = {}; for (const f of ml) cls[f.cls] = (cls[f.cls] || 0) + 1;
    console.log(`  ${name(id)} [${id}] riesgo ${a.personality.riskTolerance.toFixed(2)}, meta ${a.goals[0].goal}: ${v.l} derrotas en ${v.n} peleas (${pct(v.l, v.n)}%) | perdidas/peleas por monstruo: ${mons} | clase al perder ${JSON.stringify(cls)} | nivel mediano al perder ${med(ml.map((f) => f.lvl))} | sin equipo ${pct(ml.filter((f) => !f.armed).length, ml.length)}% | salud mediana al decidir ${Math.round(100 * med(ml.map((f) => f.hp)))}% | con penalizacion activa ${pct(ml.filter((f) => f.P > 0).length, ml.length)}% | penalizacion mediana ${med(ml.map((f) => f.P)).toFixed(2)} | muertes ${a.deathHistory.length}`);
  }
  // 3) retencion: derrotas de los ultimos 7 dias segun eventos vs recuerdos con familia/rango en memoria final
  let evRecent = 0, memRecent = 0; const T = st.time.tick;
  for (const f of L) if (T - f.tick <= W) evRecent++;
  for (const a of Object.values(ag)) for (const m of a.memory) if (m.family && T - m.tick <= W) memRecent++;
  console.log(`retencion: derrotas individuales en los ultimos 7 dias segun eventos ${evRecent} | recuerdos de derrota con monstruo en memoria final ${memRecent}`);
}

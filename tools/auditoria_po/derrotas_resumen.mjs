import fs from "node:fs"; import readline from "node:readline";
const W = 168;
for (const d of process.argv.slice(2)) {
  const st = JSON.parse(fs.readFileSync(`${d}/state.json`, "utf-8"));
  const lastLoss = {}; // agent|monster -> [ticks de derrotas]
  const per = {}; let wins = 0, losses = 0, repeatLosses = 0, fightsAfterLoss48 = 0, lossEvents = 0, pwin = 0, ploss = 0;
  const pending = []; // derrotas abiertas para contar peleas en las 48h siguientes contra el mismo monstruo
  let maxStreak = 0; const streak = {}; // derrotas seguidas contra el mismo monstruo sin una victoria en medio
  for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/events.jsonl`) })) {
    const m = /"type":"(combat_win|combat_loss|party_combat_win|party_combat_loss)"/.exec(l); if (!m) continue;
    if (m[1] === "party_combat_win") { pwin++; continue; } if (m[1] === "party_combat_loss") { ploss++; continue; }
    const e = JSON.parse(l); const k = `${e.actorId}|${e.data.family}:${e.data.rank}`;
    const prev = (lastLoss[k] ??= []);
    if (prev.some((t) => e.tick - t <= 48)) fightsAfterLoss48++;
    if (e.type === "combat_win") { wins++; streak[k] = 0; continue; }
    losses++; per[e.actorId] = (per[e.actorId] || 0) + 1;
    if (prev.some((t) => e.tick - t <= W)) repeatLosses++;
    prev.push(e.tick); streak[k] = (streak[k] || 0) + 1; maxStreak = Math.max(maxStreak, streak[k]);
  }
  const A = Object.values(st.agents); const sorted = Object.entries(per).sort((a, b) => b[1] - a[1]);
  const deaths = {}; for (const a of A) for (const x of a.deathHistory || []) deaths[x.cause] = (deaths[x.cause] || 0) + 1;
  const dist = (f) => A.reduce((o, a) => ((o[f(a)] = (o[f(a)] || 0) + 1), o), {});
  const gold = A.map((a) => a.gold).sort((x, y) => x - y);
  console.log(d, JSON.stringify({
    peleasSolo: wins + losses, derrotasSolo: losses, pctDerrotas: +(100 * losses / (wins + losses)).toFixed(1),
    derrotasRepetidasEn7d: repeatLosses, peleasEn48hTrasDerrotaMismoMonstruo: fightsAfterLoss48, rachaMaxDerrotasSeguidas: maxStreak,
    maxDerrotasUnAgente: sorted[0] ? `${st.agents[sorted[0][0]].name}:${sorted[0][1]}` : "-", agentesCon20oMas: sorted.filter(([, c]) => c >= 20).length,
    grupoGanadas: pwin, grupoPerdidas: ploss, muertes: deaths, definitivas: st.stats.permanentDeaths, vivos: A.filter((a) => a.alive).length,
    novatos: A.filter((a) => a.class === "novato").length, nivelProm: +(A.reduce((s, a) => s + a.progression.baseLevel, 0) / 70).toFixed(2),
    oroMediana: Math.round(gold[35]), clases: dist((a) => a.class),
  }));
}

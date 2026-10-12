import fs from "node:fs"; import readline from "node:readline";
for (const d of process.argv.slice(2)) {
  const st = JSON.parse(fs.readFileSync(`${d}/state.json`, "utf-8"));
  const cur = {}; const expelledFrom = {}; // agent -> guildId -> tick
  let n = 0, caught = 0, gold = 0, goldCaught = 0, rejoinSame = 0, rejoinWithin48 = 0, embezzleAfterRejoin = 0; const by = {}; const gaps = [];
  const rejoined = new Set(); // agent|guild que volvio tras expulsion
  let runs = 0, runLen = {}, maxRun = 0; // malversaciones seguidas sin ser descubierto en el mismo gremio
  for await (const l of readline.createInterface({ input: fs.createReadStream(`${d}/events.jsonl`) })) {
    if (!/"type":"(guild_joined|guild_embezzle|guild_left|guild_founded)"/.test(l)) continue;
    const e = JSON.parse(l); const id = e.actorId;
    if (e.type === "guild_joined" || e.type === "guild_founded") {
      const g = e.data.guildId; cur[id] = g; runLen[id] = 0;
      const t = expelledFrom[id]?.[g];
      if (e.type === "guild_joined" && t != null) { rejoinSame++; gaps.push(e.tick - t); if (e.tick - t <= 48) rejoinWithin48++; rejoined.add(`${id}|${g}`); }
    } else if (e.type === "guild_left") { cur[id] = null; }
    else {
      n++; gold += e.data.amount; by[id] = (by[id] || 0) + 1;
      if (rejoined.has(`${id}|${cur[id]}`)) embezzleAfterRejoin++;
      if (e.data.caught) { caught++; goldCaught += e.data.amount; (expelledFrom[id] ??= {})[cur[id]] = e.tick; cur[id] = null; runLen[id] = 0; }
      else { runLen[id] = (runLen[id] || 0) + 1; maxRun = Math.max(maxRun, runLen[id]); }
    }
  }
  gaps.sort((a, b) => a - b);
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, c]) => `${st.agents[id].name}:${c}`);
  console.log(d, JSON.stringify({ malversaciones: n, descubiertas: caught, oroTotal: Math.round(gold), oroEnDescubiertas: Math.round(goldCaught),
    reingresosAlMismoGremioTrasExpulsion: rejoinSame, deEllosEn48h: rejoinWithin48, esperaMediana: gaps[Math.floor(gaps.length / 2)] ?? null,
    malversacionesTrasReingresar: embezzleAfterRejoin, rachaMaxSinSerDescubierto: maxRun, malversadores: Object.keys(by).length, top }));
}

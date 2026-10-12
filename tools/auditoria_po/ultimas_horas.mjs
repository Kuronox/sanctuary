import fs from "node:fs"; import readline from "node:readline";
const [dir, id, T, span = 120] = process.argv.slice(2); const t1 = +T, t0 = t1 - +span;
const dec = {}, seq = []; const evs = {}; let lastSit = [];
for await (const l of readline.createInterface({ input: fs.createReadStream(`${dir}/decisions.jsonl`) })) {
  if (!l.startsWith(`{"agentId":"${id}",`)) continue;
  const r = JSON.parse(l); if (r.tick < t0 || r.tick > t1) continue;
  const k = `${r.situation.startsWith("En ") ? "decision normal" : r.situation} -> ${r.selectedAction}`; dec[k] = (dec[k] || 0) + 1;
  seq.push(`${r.tick}:${r.selectedAction}${r.situation.startsWith("En ") ? "" : "(" + r.situation.slice(0, 10) + ")"}`);
  if (r.situation.startsWith("En ")) lastSit.push(`${r.tick} ${r.situation}`);
}
for await (const l of readline.createInterface({ input: fs.createReadStream(`${dir}/events.jsonl`) })) {
  if (!l.includes(id)) continue; const e = JSON.parse(l); if (e.tick < t0 || e.tick > t1) continue;
  const role = e.actorId === id ? e.type : `<-${e.type}`; evs[`${role}@${e.location}`] = (evs[`${role}@${e.location}`] || 0) + 1;
}
console.log(`${id} ticks ${t0}-${t1}`); console.log(" decisiones:", JSON.stringify(dec)); console.log(" eventos:", JSON.stringify(evs));
console.log(" ultimas situaciones:\n  " + lastSit.slice(-6).join("\n  ")); console.log(" secuencia final:", seq.slice(-40).join(" "));

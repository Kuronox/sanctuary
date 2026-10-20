// Cronica de personaje: la vida de un agente contada en orden, a partir de una corrida ya guardada.
// Uso: node chronicle.mjs <carpeta_de_corrida> <id o nombre> [<id o nombre> ...]
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const [runDir = "data_runtime", ...wanted] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path.join(runDir, "state.json"), "utf-8"));
const narrativeFile = path.join(runDir, "narrative.jsonl");
const narrativeByAgent = {};
if (fs.existsSync(narrativeFile)) for (const l of fs.readFileSync(narrativeFile, "utf-8").split("\n").filter(Boolean)) {
  const n = JSON.parse(l);
  (narrativeByAgent[n.agentId] ||= []).push(n);
}
const agents = state.agents;
const clean = (s) => String(s).replaceAll(" (sujeto de control)", "");
const nameOf = (id) => (agents[id] ? clean(agents[id].name) : id);
const cityOf = (id) => state.worldSeed.locations.find((l) => l.id === id)?.name || id;

const targets = wanted.map((w) => {
  const hit = agents[w] || Object.values(agents).find((a) => clean(a.name) === w);
  if (!hit) throw new Error(`No existe el agente "${w}"`);
  return hit;
});
if (!targets.length) throw new Error("Indica al menos un agente (id o nombre exacto).");

// Tipos que cuentan como hito. El resto solo suma a las estadisticas de cada vida.
const ROLLUP_LABEL = {
  theft: "robos", theft_failed: "intentos de robo fallidos", arrest: "arrestos", robbed: "veces que le robaron",
  guild_founded: "gremios fundados", guild_joined: "ingresos a gremios", guild_left: "salidas de gremios",
  guild_embezzle: "malversaciones", guild_expelled: "expulsiones", guild_war_declared: "disputas de gremio declaradas",
  combat_loss: "derrotas en solitario", party_combat_loss: "derrotas en grupo", guild_new_leader: "ascensos a lider",
};
const NEVER_ROLLUP = new Set(["class_change", "trial_started", "first_visit", "first_kill"]);

const newLife = (startLocation) => ({ startLocation, milestones: [], counts: {}, talkWith: {}, givenGold: 0, receivedGold: 0, benefactors: {}, flow: {}, end: null });
const book = new Map(targets.map((a) => [a.id, { agent: a, lives: [newLife(a.homeLocation)], visited: new Set([a.homeLocation]), killed: new Set(), lastDay: 1 }]));
const byWorldName = targets.map((a) => [a.id, `${a.name} `]);

function record(id, e) {
  const b = book.get(id);
  const life = b.lives.at(-1);
  const isActor = e.actorId === id;
  const d = e.data || {};
  const bump = (k, n = 1) => (life.counts[k] = (life.counts[k] || 0) + n);
  const milestone = (type, text, amount) => life.milestones.push({ day: e.day, type, text: clean(text), amount, id: e.id });
  const flow = (k, n) => (life.flow[k] = (life.flow[k] || 0) + (n || 0));
  b.lastDay = e.day;

  if (e.type === "permanent_death" && isActor) {
    life.end = { day: e.day, permanent: true, id: e.id };
    return;
  }
  if (e.type === "rebirth" && isActor) {
    life.end = { day: e.day, to: d.toLocation, livesRemaining: d.livesRemaining, id: e.id };
    b.visited.add(d.toLocation);
    b.lives.push(newLife(d.toLocation));
    return;
  }
  if (isActor) {
    // Flujos de oro que el evento registra de forma explicita (no incluye comida, cuotas ni mantenimiento: no emiten monto).
    if (e.type === "work") flow("trabajo", d.income);
    else if (e.type === "guild_contribution") flow("aportes al gremio", d.amount);
    else if (e.type === "guild_embezzle") flow("malversado", d.amount);
    else if (e.type === "combat_win") flow("botin de combate individual", d.goldWon);
    else if (e.type === "trade_sell") flow("ventas al mercado", d.totalGain);
    else if (e.type === "trade_buy") flow("compras al mercado", d.totalCost);
    else if (e.type === "arrest") flow("multas", d.fine);
    else if (e.type === "rest_inn") flow("posadas", d.cost);
    else if (e.type === "repair") flow("reparaciones", d.cost);
    else if (e.type === "job_completed") flow("encargos de transporte", +(/gana (\d+) de oro/.exec(e.summary)?.[1] || 0));
  }
  if (!isActor && e.actorId) {
    // Lo que otros le hicieron a este personaje.
    if (e.type === "theft") milestone("robbed", e.summary, d.amount);
    else if (e.type === "help") { bump("helpReceived"); life.receivedGold += d.amount || 0; life.benefactors[e.actorId] = (life.benefactors[e.actorId] || 0) + (d.amount || 0); }
    else if (e.type === "heal") bump("healReceived");
    else if (e.type === "talk") life.talkWith[e.actorId] = (life.talkWith[e.actorId] || 0) + 1;
    else if (e.type === "party_combat_win" || e.type === "party_combat_loss") combat(e, d);
    return;
  }
  if (!e.actorId) { milestone(e.type, e.summary); return; }

  switch (e.type) {
    case "talk": if (d.targetId) life.talkWith[d.targetId] = (life.talkWith[d.targetId] || 0) + 1; bump("talk"); break;
    case "help": bump("help"); life.givenGold += d.amount || 0; break;
    case "travel_end":
      if (!b.visited.has(e.location)) { b.visited.add(e.location); milestone("first_visit", `Llega por primera vez a ${cityOf(e.location)}.`); }
      bump("travel"); break;
    case "combat_win": case "combat_loss": case "party_combat_win": case "party_combat_loss": combat(e, d); break;
    case "class_change": case "trial_started": case "theft": case "theft_failed": case "arrest":
    case "guild_founded": case "guild_joined": case "guild_left": case "guild_embezzle": case "guild_war_declared":
      milestone(e.type, e.summary, d.amount); break;
    default: bump(e.type);
  }

  function combat(ev, data) {
    const won = ev.type.endsWith("win");
    bump(won ? "wins" : "losses");
    if (!won) { milestone(ev.type, ev.summary); return; }
    if (data.rank === "comun") return;
    const key = `${data.family}:${data.rank}`;
    if (b.killed.has(key)) return;
    b.killed.add(key);
    milestone("first_kill", `${ev.summary} Es su primera victoria contra un enemigo de rango ${data.rank} de esa familia.`);
  }
}

for await (const line of readline.createInterface({ input: fs.createReadStream(path.join(runDir, "events.jsonl")) })) {
  if (!line) continue;
  const e = JSON.parse(line);
  if (e.actorId && book.has(e.actorId)) record(e.actorId, e);
  const other = e.data?.targetId || e.data?.partnerId;
  if (other && other !== e.actorId && book.has(other)) record(other, e);
  if (!e.actorId && (e.type === "guild_expelled" || e.type === "guild_new_leader")) {
    // nombre completo seguido del verbo: "Fenna " tambien es prefijo de "Fenna el Manco"
    for (const [id, prefix] of byWorldName) if (e.summary.startsWith(`${prefix}es expulsado`) || e.summary.startsWith(`${prefix}asume`)) record(id, e);
  }
}

// Oro del agente al cierre de cada dia, leido del log de decisiones (cada decision registra "oro=N").
const goldByDay = new Map(targets.map((a) => [a.id, {}]));
const decisionsFile = path.join(runDir, "decisions.jsonl");
if (fs.existsSync(decisionsFile)) {
  const RE = /"agentId":"(agent_\d+)","tick":(\d+),.*?oro=(-?\d+),/;
  for await (const line of readline.createInterface({ input: fs.createReadStream(decisionsFile) })) {
    const m = RE.exec(line);
    if (m && goldByDay.has(m[1])) goldByDay.get(m[1])[Math.floor(+m[2] / 24) + 1] = +m[3];
  }
}

// Mas de 3 hitos del mismo tipo en una vida: se dejan los 2 primeros y una linea de resumen.
function compact(milestones) {
  const groups = {};
  for (const m of milestones) (groups[m.type] ??= []).push(m);
  const drop = new Set();
  const extra = [];
  for (const [type, list] of Object.entries(groups)) {
    if (NEVER_ROLLUP.has(type) || list.length <= 3) continue;
    const rest = list.slice(2);
    rest.forEach((m) => drop.add(m));
    let text = `…y ${rest.length} ${ROLLUP_LABEL[type] || type} más hasta el día ${rest.at(-1).day}`;
    const withAmount = list.filter((m) => m.amount != null);
    if (withAmount.length) {
      const total = withAmount.reduce((s, m) => s + m.amount, 0);
      const top = withAmount.reduce((a, m) => (m.amount > a.amount ? m : a));
      text += ` (en total ${Math.round(total)} de oro en ${list.length}; la mayor, ${Math.round(top.amount)} el día ${top.day})`;
    }
    extra.push({ day: rest[0].day, type, text: text + ".", rollup: true, id: `${rest[0].id}…${rest.at(-1).id}` });
  }
  return [...milestones.filter((m) => !drop.has(m)), ...extra].sort((a, b) => a.day - b.day);
}

const TRAITS = {
  ambition: ["ambicioso", "sin ambición"], sociability: ["sociable", "solitario"], riskTolerance: ["temerario", "cauto"],
  greed: ["codicioso", "desprendido"], loyalty: ["leal", "desleal"], empathy: ["empático", "frío"],
};
const temperament = (p) => Object.entries(TRAITS).flatMap(([k, [hi, lo]]) => (p[k] >= 0.7 ? [hi] : p[k] <= 0.3 ? [lo] : [])).join(", ") || "sin rasgos extremos";
const ORDINAL = ["Primera", "Segunda", "Tercera"];
const label = (aff) => (aff <= -60 ? "enemigo" : aff <= -20 ? "rival" : aff < 20 ? "conocido" : aff < 60 ? "aliado" : "amigo");
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];

function lifeSummary(life) {
  const c = life.counts;
  const parts = [];
  if (c.wins || c.losses) parts.push(`${pl(c.wins || 0, "combate ganado", "combates ganados")} y ${pl(c.losses || 0, "perdido", "perdidos")}`);
  if (c.work) parts.push(`${c.work} jornadas de trabajo`);
  if (c.help) parts.push(`ayudó ${c.help} veces (${Math.round(life.givenGold)} de oro regalado)`);
  if (c.helpReceived) {
    const [who] = top(life.benefactors);
    parts.push(`recibió ayuda ${c.helpReceived} veces (${Math.round(life.receivedGold)} de oro, sobre todo de ${nameOf(who)})`);
  }
  if (c.heal) parts.push(`curó a otros ${c.heal} veces`);
  if (c.craft) parts.push(`fabricó ${pl(c.craft, "objeto", "objetos")}`);
  if (c.job_completed) parts.push(`completó ${pl(c.job_completed, "encargo", "encargos")} de transporte`);
  const companion = top(life.talkWith);
  if (companion) parts.push(`con quien más habló fue ${nameOf(companion[0])} (${companion[1]} conversaciones)`);
  return parts.length ? `En resumen: ${parts.join("; ")}.` : "";
}

for (const { agent: a, lives, lastDay } of book.values()) {
  const out = [];
  out.push(`# ${clean(a.name)}`, "");
  out.push(`Nació en ${cityOf(a.homeLocation)}. Temperamento: ${temperament(a.personality)}. Busca: ${a.goals.map((g) => g.goal.replaceAll("_", " ")).join(" y ")}.`, "");

  lives.forEach((life, i) => {
    const from = i === 0 ? 1 : lives[i - 1].end.day;
    const to = life.end ? life.end.day : lastDay;
    out.push(`## ${ORDINAL[i] || `${i + 1}ª`} vida — días ${from} a ${to}, comienza en ${cityOf(life.startLocation)}`, "");
    for (const m of compact(life.milestones)) out.push(`- **Día ${m.day}.** ${m.text} [${m.id}]`);
    const death = a.deathHistory?.[i];
    if (life.end?.permanent && death) {
      out.push(`- **Día ${life.end.day}. Muere definitivamente en ${cityOf(death.location)}** (${death.cause}${death.killer ? `, a manos de un ${death.killer}` : ""}), siendo ${death.jobId} de nivel ${death.baseLevel}. No le quedaban vidas. [${life.end.id}; deathHistory tick ${death.tick}]`);
    } else if (life.end && death) {
      out.push(`- **Día ${life.end.day}. Muere en ${cityOf(death.location)}** (${death.cause}${death.killer ? `, a manos de un ${death.killer}` : ""}), siendo ${death.jobId} de nivel ${death.baseLevel}. Renace en ${cityOf(life.end.to)}; ${life.end.livesRemaining === 1 ? "le queda 1 vida" : `le quedan ${life.end.livesRemaining} vidas`}. [${life.end.id}; deathHistory tick ${death.tick}]`);
    }
    out.push("", lifeSummary(life), "");
    const flows = Object.entries(life.flow).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${Math.round(v)}`);
    if (flows.length) out.push(`Oro con monto registrado en eventos: ${flows.join("; ")}.`, "");
    const g = goldByDay.get(a.id);
    if (g) {
      const days = Object.keys(g).map(Number).filter((k) => k >= from && k <= to).sort((x, y) => x - y);
      if (days.length) {
        const peak = days.reduce((m, k) => (g[k] > g[m] ? k : m), days[0]);
        const marks = [...new Set([days[0], ...days.filter((k) => k % 30 === 0), peak, days.at(-1)])].sort((x, y) => x - y);
        out.push(`Oro al cierre del día (según el log de decisiones): ${marks.map((k) => `día ${k}: ${g[k]}${k === peak ? " (máximo)" : ""}`).join("; ")}.`, "");
      }
    }
  });

  out.push("## Cómo termina", "");
  const guild = a.guildId ? state.guilds[a.guildId]?.name : null;
  out.push(`${a.alive ? "Sigue con vida" : "Murió definitivamente"}: ${a.class} de nivel ${a.progression.baseLevel}, con ${Math.round(a.gold)} de oro, en ${cityOf(a.location)}. ${a.lives === 1 ? "Le queda 1 vida" : `Le quedan ${a.lives} vidas`}. ${guild ? `Pertenece al gremio ${guild}.` : "No pertenece a ningún gremio."}`, "");

  const rels = Object.entries(a.relationships).filter(([, r]) => r.interactions > 0).sort((x, y) => y[1].affinity - x[1].affinity);
  const close = rels.slice(0, 3).filter(([, r]) => r.affinity >= 20);
  if (close.length) out.push(`**A quién aprecia:** ${close.map(([id, r]) => `${nameOf(id)} (${label(r.affinity)})`).join(", ")}.`, "");
  const disliked = rels.filter(([, r]) => r.affinity <= -20).map(([id, r]) => `${nameOf(id)} (${label(r.affinity)})`);
  if (disliked.length) out.push(`**A quién no soporta:** ${disliked.join(", ")}.`, "");
  const haters = Object.values(agents).filter((o) => (o.relationships[a.id]?.affinity ?? 0) <= -20).map((o) => `${nameOf(o.id)} (lo ve como ${label(o.relationships[a.id].affinity)})`);
  out.push(`**Quién le guarda rencor:** ${haters.length ? haters.join(", ") : "nadie"}.`, "");

  const scars = new Map();
  for (const [id, r] of rels) for (const m of r.memories || []) if (m.weight >= 2.5) scars.set(`${nameOf(id)}: ${m.note}`, m.affinityDelta);
  if (scars.size) {
    out.push("**Recuerdos que pesan:**", "");
    for (const [text, delta] of [...scars].slice(0, 8)) out.push(`- ${clean(text)} (${delta < 0 ? "herida" : "vínculo"})`);
    out.push("");
  }
  const voice = narrativeByAgent[a.id] || a.narrative || []; // a.narrative: corridas previas a la separacion
  if (voice.length) {
    out.push("**En sus propias palabras** (frases generadas por el narrador):", "");
    for (const n of voice) out.push(`- Día ${Math.floor(n.tick / 24) + 1}: «${n.text}»`);
    out.push("");
  }
  const bans = Object.values(state.guilds).filter((g) => g.bannedIds?.includes(a.id)).map((g) => g.name);
  if (bans.length) out.push(`**Vetado en ${bans.length} gremios por malversar:** ${bans.join(", ")}.`, "");
  const mem = [...a.memory].sort((x, y) => y.importance - x.importance || x.tick - y.tick).slice(0, 8);
  if (mem.length) {
    out.push(`**Memoria propia al final** (las ${mem.length} entradas de mayor importancia, de ${a.memory.length} guardadas):`, "");
    for (const m of mem) out.push(`- Día ${Math.floor(m.tick / 24) + 1}: ${clean(m.summary)} (importancia ${m.importance})`);
    out.push("");
  }
  out.push(`**Trazabilidad:** corrida \`${runDir}\`, seed ${state.seedNumber}, agente \`${a.id}\`, ${state.time.tick} ticks. Los identificadores entre corchetes son eventos de \`events.jsonl\`; el estado final sale de \`state.json\`.`, "");
  console.log(out.join("\n"));
  console.log("\n---\n");
}

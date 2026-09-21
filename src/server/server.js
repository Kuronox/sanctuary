import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadState, stateExists, saveState, readJsonl, EVENTS_FILE, DECISIONS_FILE, LLM_DECISIONS_FILE } from "../engine/store.js";
import { hydrateWorld, serializeWorld, tick, attachEventSink } from "../engine/world.js";
import { relationshipLabel } from "../engine/entities.js";
import * as prog from "../engine/progression.js";
import * as guildsMod from "../engine/guilds.js";
import * as llmBudget from "../engine/llm/budget.js";

llmBudget.load();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = path.resolve(__dirname, "../../dashboard");
const PORT = process.env.PORT || 5177;

let world = null;
function ensureWorld() {
  if (!stateExists()) return null;
  if (!world) {
    world = hydrateWorld(loadState());
    attachEventSink(world);
  }
  return world;
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json" };

function serveStatic(req, res) {
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(DASHBOARD_DIR, decodeURIComponent(filePath.split("?")[0]));
  if (!filePath.startsWith(DASHBOARD_DIR)) return json(res, { error: "forbidden" }, 403);
  fs.readFile(filePath, (err, data) => {
    if (err) return json(res, { error: "not found" }, 404);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function summarizeAgent(w, a) {
  const jobDef = prog.jobDef(w.worldSeed, a.progression.job.id);
  return {
    id: a.id,
    name: a.name,
    class: a.class,
    className: jobDef ? jobDef.name : a.class,
    tier: jobDef ? jobDef.tier : 0,
    location: a.location,
    status: a.status,
    guildId: a.guildId,
    gold: Math.round(a.gold),
    health: Math.round(a.stats.health),
    maxHealth: a.stats.maxHealth,
    baseLevel: a.progression.baseLevel,
    baseXp: a.progression.baseXp,
    baseXpNext: prog.baseXpForLevel(a.progression.baseLevel),
    jobLevel: a.progression.job.level,
    jobXp: a.progression.job.xp,
    jobXpNext: prog.jobXpForLevel(a.progression.job.level),
    combatPower: prog.effectiveCombatPower(w.worldSeed, a),
    equipment: a.equipment,
    needs: a.needs,
    alive: a.alive,
    goals: a.goals,
    prison: a.prison,
    trial: a.progression.trial,
  };
}

function handleApi(req, res, url) {
  const w = ensureWorld();
  if (!w) return json(res, { error: "no hay simulacion iniciada. Ejecuta: npm run sim" }, 404);

  if (url.pathname === "/api/state") {
    return json(res, {
      time: w.time,
      locations: w.worldSeed.locations.map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        safety: l.safety,
        guardStrength: l.guardStrength,
        monsterFamily: l.monsterFamily || null,
        institution: l.institution || null,
        huntPressure: (w.huntPressure[l.id] && l.monsterFamily) ? (w.huntPressure[l.id][l.monsterFamily] || 0) : 0,
        goldReserve: Math.round(w.markets[l.id].goldReserve),
        agentCount: Object.values(w.agents).filter((a) => a.alive && a.location === l.id).length,
      })),
      agents: Object.values(w.agents).map((a) => summarizeAgent(w, a)),
      guilds: Object.values(w.guilds).map((g) => ({
        ...g,
        memberNames: g.members.map((m) => w.agents[m]?.name).filter(Boolean),
        leaderName: w.agents[g.leaderId]?.name || null,
        founderName: w.agents[g.founderId]?.name || null,
        specialization: g.disbanded ? null : guildsMod.guildSpecialization(w, g),
        relationLabels: Object.fromEntries(Object.entries(g.relations).map(([otherId, r]) => [w.guilds[otherId]?.name || otherId, { ...r, label: guildsMod.guildRelationLabel(r.score) }])),
      })),
      opportunities: w.opportunities.slice(-40),
      guildContracts: w.guildContracts.slice(-40),
      guildWar: w.guildWar ? { ...w.guildWar, locationName: w.worldSeed.locations.find((l) => l.id === w.guildWar.locationId)?.name, participants: Object.fromEntries(Object.entries(w.guildWar.participants).map(([gid, power]) => [w.guilds[gid]?.name || gid, Math.round(power)])) } : null,
      guildWarBonus: w.guildWarBonus ? { ...w.guildWarBonus, guildName: w.guilds[w.guildWarBonus.guildId]?.name, locationName: w.worldSeed.locations.find((l) => l.id === w.guildWarBonus.locationId)?.name } : null,
    });
  }

  if (url.pathname.startsWith("/api/agent/")) {
    const id = url.pathname.split("/").pop();
    const agent = w.agents[id];
    if (!agent) return json(res, { error: "agente no encontrado" }, 404);
    const relationships = Object.entries(agent.relationships).map(([otherId, rel]) => ({
      otherId,
      otherName: w.agents[otherId]?.name || otherId,
      ...rel,
      label: relationshipLabel(rel),
    }));
    const jobDef = prog.jobDef(w.worldSeed, agent.progression.job.id);
    const nextOptions = prog.nextClassOptions(w.worldSeed, agent).map((target) => ({
      jobId: target.id,
      name: target.name,
      tier: target.tier,
      meetsRequirement: prog.meetsRequirement(w.worldSeed, agent, target),
      trialStatus: prog.trialStatus(agent, target),
      requirement: target.requirement,
    }));
    return json(res, {
      ...summarizeAgent(w, agent),
      personality: agent.personality,
      inventory: agent.inventory,
      standing: agent.standing,
      progression: agent.progression,
      nextClassOptions: nextOptions,
      relationships,
      knowledge: agent.knowledge.slice(-30).reverse(),
      memory: agent.memory.slice(-30).reverse(),
      recentDecisions: agent.recentDecisions.slice().reverse(),
    });
  }

  if (url.pathname === "/api/timeline") {
    const limit = Number(url.searchParams.get("limit")) || 150;
    const filter = url.searchParams.get("filter");
    let events;
    if (filter) {
      // Sin filtro, basta la cola del archivo (readJsonl ya la recorta).
      // Con filtro, un tipo de evento raro (ej. "class_change": ~50 en
      // miles de ticks) puede no aparecer nunca en una ventana fija de la
      // cola aunque exista mas atras en el archivo — readJsonl igual lee
      // el archivo completo en memoria antes de recortar, asi que pedirle
      // todo (sin limite) no agrega I/O extra, solo mas JSON.parse.
      events = readJsonl(EVENTS_FILE)
        .filter((e) => e.type === filter)
        .slice(-limit)
        .reverse();
    } else {
      events = readJsonl(EVENTS_FILE, limit).reverse();
    }
    return json(res, { events });
  }

  if (url.pathname === "/api/tick" && req.method === "POST") {
    const n = Number(url.searchParams.get("n")) || 24;
    return (async () => {
      for (let i = 0; i < n; i++) await tick(w);
      saveState(serializeWorld(w));
      llmBudget.save();
      return json(res, { ok: true, time: w.time });
    })();
  }

  if (url.pathname === "/api/llm-status") {
    // Panel minimo de observabilidad (seccion 20 del encargo V3): totales
    // acumulados reales vienen de llmBudget (persistido); el desglose por
    // agente usa solo una ventana reciente del log, no el total historico.
    const llmAgents = Object.values(w.agents).filter((a) => a.policy === "llm");
    const recentDecisions = readJsonl(LLM_DECISIONS_FILE, 400);
    const lastByAgent = {};
    for (const d of recentDecisions) lastByAgent[d.agentId] = d;
    return json(res, {
      budget: llmBudget.getSummary(),
      agents: llmAgents.map((a) => {
        const last = lastByAgent[a.id];
        return {
          id: a.id,
          name: a.name,
          location: a.location,
          decisionsLogged: recentDecisions.filter((d) => d.agentId === a.id).length,
          fallbacksLogged: recentDecisions.filter((d) => d.agentId === a.id && d.fallback).length,
          lastDecision: last ? { tick: last.tick, selectedAction: last.selectedAction, reason: last.reason, fallback: last.fallback, fallbackReason: last.fallbackReason, model: last.model } : null,
        };
      }),
    });
  }

  return json(res, { error: "not found" }, 404);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    try {
      return handleApi(req, res, url);
    } catch (err) {
      return json(res, { error: String(err && err.message || err) }, 500);
    }
  }
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Sanctuary dashboard: http://localhost:${PORT}`);
});

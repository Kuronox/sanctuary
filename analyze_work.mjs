// Analiza métricas de work y agentes atrapados desde state + events
import fs from "node:fs";

const state = JSON.parse(fs.readFileSync("data_runtime/state.json", "utf-8"));
const lines = fs.readFileSync("data_runtime/events.jsonl", "utf-8").trim().split("\n");
const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const alive = Object.values(state.agents).filter(a => a.alive);

// Métricas de agentes
const novatos = alive.filter(a => a.class === "novato");
const gold0 = alive.filter(a => a.gold === 0);
const goldLt15 = alive.filter(a => a.gold < 15);
const hungerHigh = alive.filter(a => a.needs.hunger > 0.7);

console.log("=== AGENT METRICS ===");
console.log(`Novatos: ${novatos.length} | gold=0: ${gold0.length} | gold<15: ${goldLt15.length} | hunger>0.7: ${hungerHigh.length}`);

// Work events
const workEvents = events.filter(e => e.type === "work");
const agentWorkCounts = {};
for (const e of workEvents) agentWorkCounts[e.actorId] = (agentWorkCounts[e.actorId] || 0) + 1;
const neverWorked = alive.filter(a => !agentWorkCounts[a.id]);
console.log(`\n=== WORK METRICS ===`);
console.log(`Total work events: ${workEvents.length}`);
console.log(`Agentes que trabajaron: ${Object.keys(agentWorkCounts).length} | Nunca trabajaron: ${neverWorked.length}`);
console.log(`Work por agente (promedio entre quienes sí trabajaron): ${(workEvents.length / Object.keys(agentWorkCounts).length).toFixed(1)}`);

// Work con gold<15 vs gold>=15 — aproximar desde eventos recientes
// (no tenemos gold en cada evento de work, usamos estado final)
const recentWork = events.filter(e => e.type === "work" && e.tick > (state.time.tick - 240));
console.log(`Work en últimas 240t: ${recentWork.length}`);

// Distribución de work por clase
const workByClass = {};
for (const e of workEvents) {
  const ag = state.agents[e.actorId];
  if (ag) workByClass[ag.class] = (workByClass[ag.class] || 0) + 1;
}
console.log(`Work por clase: ${JSON.stringify(workByClass)}`);

// Detalle novatos atrapados
console.log(`\n=== NOVATOS CON gold<15 ===`);
const poorNovatos = novatos.filter(a => a.gold < 15).sort((a,b) => a.gold - b.gold);
for (const a of poorNovatos) {
  const worked = agentWorkCounts[a.id] || 0;
  console.log(`  ${a.name} | gold=${a.gold.toFixed(1)} | hunger=${a.needs.hunger.toFixed(2)} | ${a.location} | work_total=${worked}`);
}

// Verificar loop work→work→work (¿aparece?)
const workStreaks = [];
let streak = 0;
let lastActor = null;
for (const e of events) {
  if (e.type === "work") {
    if (e.actorId === lastActor) streak++;
    else { if (streak > 2) workStreaks.push(streak); streak = 1; lastActor = e.actorId; }
  } else {
    if (streak > 2) workStreaks.push(streak); streak = 0; lastActor = null;
  }
}
console.log(`\n=== WORK LOOP CHECK ===`);
console.log(`Rachas de work≥3 ticks consecutivos (por agente): ${workStreaks.length}`);
if (workStreaks.length > 0) console.log(`Máx racha: ${Math.max(...workStreaks)} | distribución: ${JSON.stringify(workStreaks.slice(0,20))}`);

// Talk ratio global
const talkEvents = events.filter(e => e.type === "talk");
console.log(`\n=== SOCIAL CHECK ===`);
console.log(`Talk events total: ${talkEvents.length} | Work/Talk ratio: ${(workEvents.length/talkEvents.length).toFixed(3)}`);

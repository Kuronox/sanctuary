import fs from "node:fs";
import { createWorld } from "./src/engine/world.js";
import { decide } from "./src/engine/decision.js";

const state = JSON.parse(fs.readFileSync("data_runtime/state.json", "utf-8"));
const { agents, worldSeed } = state;

const world = createWorld(worldSeed, 42);
world.agents = agents;
world.markets = state.markets;
world.time = state.time;
world.guilds = state.guilds ?? {};
world.opportunities = state.opportunities ?? [];

const alive = Object.values(agents).filter(a => a.alive);
const locName = id => worldSeed.locations.find(l => l.id === id)?.name ?? id;

const goalWeight = (agent, g) => agent.goals.find(x => x.goal === g)?.weight ?? 0;

const stuck = alive.filter(a => a.class === "novato" && a.gold === 0);
console.log("══ SCORING: STUCK NOVATOS ══\n");

for (const agent of stuck.slice(0, 5)) {
  const p = agent.personality;
  const workScore = goalWeight(agent,"riqueza")*2 + goalWeight(agent,"maestria_oficio")*1.5 + p.ambition*0.8 - agent.needs.fatigue*1.2;
  const talkScore = p.sociability*2 + goalWeight(agent,"pertenencia")*1.5 + agent.needs.social*1.5;
  console.log(`${agent.name} | gold=${agent.gold} | hunger=${agent.needs.hunger.toFixed(2)} | fatigue=${agent.needs.fatigue.toFixed(2)} | social=${agent.needs.social.toFixed(2)}`);
  console.log(`  personality: ambition=${p.ambition.toFixed(2)} sociability=${p.sociability.toFixed(2)} empathy=${p.empathy.toFixed(2)} greed=${p.greed.toFixed(2)}`);
  console.log(`  goals: ${agent.goals.map(g=>`${g.goal}:${g.weight.toFixed(2)}`).join(", ")}`);
  console.log(`  WORK score=${workScore.toFixed(2)}  TALK score=${talkScore.toFixed(2)}  delta=${(talkScore-workScore).toFixed(2)}`);

  const result = decide(world, agent);
  console.log(`  chosen=${result.action.type} | top actions:`);
  (result.rationale.availableActions || []).forEach(a => {
    const mark = a.type === "work" ? " ◄WORK" : a.type === result.action.type ? " ◄CHOSEN" : "";
    console.log(`    ${a.type.padEnd(18)} ${a.score}${mark}`);
  });
  console.log();
}

console.log("══ SCORING: PROGRESSED AGENTS ══\n");
const progressed = alive.filter(a => a.class !== "novato" && a.gold > 1000).slice(0, 4);
for (const agent of progressed) {
  const p = agent.personality;
  const workScore = goalWeight(agent,"riqueza")*2 + goalWeight(agent,"maestria_oficio")*1.5 + p.ambition*0.8 - agent.needs.fatigue*1.2;
  const talkScore = p.sociability*2 + goalWeight(agent,"pertenencia")*1.5 + agent.needs.social*1.5;
  console.log(`${agent.name} | ${agent.class} | gold=${agent.gold.toFixed(0)} | fatigue=${agent.needs.fatigue.toFixed(2)}`);
  console.log(`  personality: ambition=${p.ambition.toFixed(2)} sociability=${p.sociability.toFixed(2)} empathy=${p.empathy.toFixed(2)}`);
  console.log(`  goals: ${agent.goals.map(g=>`${g.goal}:${g.weight.toFixed(2)}`).join(", ")}`);
  console.log(`  WORK score=${workScore.toFixed(2)}  TALK score=${talkScore.toFixed(2)}  delta=${(talkScore-workScore).toFixed(2)}`);
  const result = decide(world, agent);
  console.log(`  chosen=${result.action.type}`);
  (result.rationale.availableActions || []).forEach(a => {
    const mark = a.type === "work" ? " ◄WORK" : a.type === result.action.type ? " ◄CHOSEN" : "";
    console.log(`    ${a.type.padEnd(18)} ${a.score}${mark}`);
  });
  console.log();
}

// Test: Step 13 — El gremio no readmite a quien expulso por malversar
// B1. antes de malversar, el gremio se le ofrece a un forastero conocido
// B2. malversacion descubierta -> expulsado y vetado en ese gremio
// B3. vetado: ese gremio no se le vuelve a ofrecer, ni pasado el enfriamiento
// B4. el veto es por gremio: otro gremio si se le ofrece
// B5. malversacion NO descubierta -> sin veto
// B6. el veto sobrevive a la muerte y renacimiento del ladron
// B7. expulsion por no pagar cuotas -> sin veto

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const worldSeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data/world_seed.json"), "utf-8"));

import { createWorld } from "../world.js";
import { createAgent, createGuild } from "../entities.js";
import { listCandidateActions, execute, handleDeath } from "../actions.js";
import { expelMember } from "../guilds.js";
import { makeRng } from "../rng.js";

const HERE = "aldea_tejo";

function setup({ witnessHere = true } = {}) {
  const world = createWorld(worldSeed, 5);
  world.time = { tick: 100, day: 5, hour: 10 };
  const mk = (id, location) => {
    const a = createAgent({ id, name: `Agente_${id}`, flavorBiasDef: null, homeLocation: location, rng: makeRng(40 + id.length) });
    a.gold = 100; world.agents[id] = a; return a;
  };
  const thief = mk("ladron", HERE);
  const member = mk("miembro", witnessHere ? HERE : "valdemarca");
  const other = mk("otro_lider", HERE);
  const mkGuild = (id, leader, members) => {
    const g = createGuild({ id, name: `Gremio_${id}`, founderId: leader.id, tick: 0 });
    g.members = members.map((m) => m.id); g.treasury = 200; g.reputation = 40; // reputacion > 25: gremio conocido, se ofrece a cualquiera
    for (const m of members) { m.guildId = id; m.guildJoinedTick = 0; }
    world.guilds[id] = g; return g;
  };
  const gA = mkGuild("guild_A", member, [member, thief]);
  const gB = mkGuild("guild_B", other, [other]);
  const offered = (gid) => listCandidateActions(world, thief).some((x) => x.type === "join_guild" && x.data.guildId === gid);
  return { world, thief, member, gA, gB, offered };
}

{
  const { world, thief, gA, offered } = setup();
  thief.guildId = null; gA.members = gA.members.filter((m) => m !== thief.id);
  assert.equal(offered("guild_A"), true);
  console.log("B1 PASS: sin antecedentes, el gremio se le ofrece");
}

{
  const { world, thief, gA, offered } = setup();
  const ev = execute(world, thief, { type: "malversar_tesoro" });
  assert.equal(ev.data.caught, true);
  assert.equal(ev.data.guildId, "guild_A");
  assert.equal(thief.guildId, null);
  assert.deepEqual(gA.bannedIds, [thief.id]);
  console.log("B2 PASS: malversacion descubierta -> expulsado y vetado");

  assert.equal(offered("guild_A"), false);
  world.time.tick += 5000;
  assert.equal(offered("guild_A"), false);
  console.log("B3 PASS: el gremio no se le vuelve a ofrecer, ni 5000 horas despues");

  assert.equal(offered("guild_B"), true);
  console.log("B4 PASS: el veto es solo de ese gremio; otro gremio si se le ofrece");

  handleDeath(world, thief, { cause: "combate", killer: "Lobo salvaje" });
  thief.location = HERE; thief.status = "idle"; world.time.tick += 5000;
  assert.equal(thief.alive, true);
  assert.equal(offered("guild_A"), false);
  console.log("B6 PASS: el veto sobrevive a la muerte y renacimiento del ladron");
}

{
  const { world, thief, gA, offered } = setup({ witnessHere: false });
  const ev = execute(world, thief, { type: "malversar_tesoro" });
  assert.equal(ev.data.caught, false);
  assert.equal(thief.guildId, "guild_A");
  assert.equal(gA.bannedIds, undefined);
  console.log("B5 PASS: malversacion no descubierta -> sigue dentro, sin veto");
}

{
  const { world, thief, gA, offered } = setup();
  expelMember(world, gA, thief, "no pudo pagar la cuota del gremio repetidamente");
  assert.equal(gA.bannedIds, undefined);
  assert.equal(offered("guild_A"), true);
  console.log("B7 PASS: expulsion por cuotas impagas -> sin veto, puede volver");
}

console.log("✓ Todos los tests de veto de gremio (Step 13) PASSED");

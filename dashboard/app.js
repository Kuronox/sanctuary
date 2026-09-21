let selectedAgentId = null;
let state = null;
let currentTab = "world";
let classFilter = null;

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  return res.json();
}

function el(cls, html) {
  const e = document.createElement("div");
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ---------- tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentTab = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.id === `pane-${currentTab}`));
    if (currentTab === "timeline") loadTimeline();
  });
});

function renderClock(time) {
  document.getElementById("clock").textContent = `Dia ${time.day} · ${String(time.hour).padStart(2, "0")}:00 · tick ${time.tick}`;
}

// ---------- resumen rapido ----------
function renderStatStrip(state) {
  const strip = document.getElementById("statStrip");
  const alive = state.agents.filter((a) => a.alive);
  const totalGold = Math.round(alive.reduce((s, a) => s + a.gold, 0));
  const activeGuilds = state.guilds.filter((g) => !g.disbanded).length;
  const imprisoned = alive.filter((a) => a.prison).length;
  const inParty = state.opportunities ? state.opportunities.filter((o) => o.status === "accepted").length : 0;
  const chip = (label, value, accent) => `<div class="stat-chip"><div class="stat-label">${label}</div><div class="stat-value${accent ? " accent" : ""}">${value}</div></div>`;
  strip.innerHTML =
    chip("Poblacion", alive.length) +
    chip("Oro en circulacion", totalGold.toLocaleString("es")) +
    chip("Gremios activos", activeGuilds) +
    chip("En carcel", imprisoned) +
    chip("Encargos en curso", inParty) +
    chip("Localizaciones", state.locations.length, true);
}

// ---------- cohorte LLM (Experimento V3-LLM, panel minimo de observabilidad) ----------
async function renderLlmPanel() {
  const panel = document.getElementById("llmPanel");
  const data = await fetchJson("/api/llm-status");
  if (!data.agents || !data.agents.length) { panel.style.display = "none"; return; }
  panel.style.display = "";
  const b = data.budget;
  const rows = data.agents.map((a) => {
    const last = a.lastDecision;
    const lastTxt = last
      ? `t${last.tick}: ${last.fallback ? `fallback (${last.fallbackReason})` : `${last.selectedAction} — "${last.reason || ""}"`}`
      : "sin decisiones LLM registradas todavia";
    return `<div class="hint" style="margin-top:4px"><b>${a.name}</b> (${a.location}) — ${a.decisionsLogged} decisiones recientes, ${a.fallbacksLogged} fallback · ultima: ${lastTxt}</div>`;
  }).join("");
  panel.innerHTML = `
    <h2 style="margin-bottom:6px">Cohorte LLM (deepseek-flash)</h2>
    <div class="hint">Presupuesto: $${b.cumulativeCostUsd.toFixed(4)} acumulado de $1.00 · ${b.successfulCalls} llamadas ok · ${b.fallbackCalls} fallback de ${b.totalCalls} intentos${b.hardLimitReachedAtTick ? ` · LIMITE ALCANZADO en tick ${b.hardLimitReachedAtTick}` : ""}</div>
    ${rows}
  `;
}

// ---------- world / locations ----------
function renderLocations(locations) {
  const grid = document.getElementById("locationGrid");
  grid.innerHTML = "";
  for (const loc of locations) {
    const wild = !loc.institution && loc.guardStrength === 0;
    const card = el("loc-card" + (wild ? " wild" : ""));
    let badges = "";
    if (loc.institution) badges += `<span class="loc-badge badge-institution">${loc.institution.type}</span> `;
    if (loc.monsterFamily) badges += `<span class="loc-badge badge-danger">peligro: ${loc.monsterFamily}</span>`;
    card.innerHTML = `
      <div class="loc-name">${loc.name}</div>
      <div class="loc-type">${loc.type.replace(/_/g, " ")}</div>
      <div style="margin-bottom:8px">${badges}</div>
      <div class="loc-stat-row"><span>Agentes presentes</span><b>${loc.agentCount}</b></div>
      <div class="loc-stat-row"><span>Seguridad</span><b>${(loc.safety * 100).toFixed(0)}%</b></div>
      <div class="loc-stat-row"><span>Guardia</span><b>${(loc.guardStrength * 100).toFixed(0)}%</b></div>
      <div class="loc-stat-row"><span>Reserva del mercado</span><b>${loc.goldReserve} oro</b></div>
      ${loc.monsterFamily ? `<div class="loc-stat-row"><span>Presion de caza</span><b>${(loc.huntPressure * 100).toFixed(0)}%</b></div><div class="pressure-bar"><div style="width:${loc.huntPressure * 100}%"></div></div>` : ""}
    `;
    grid.appendChild(card);
  }
}

// ---------- agents ----------
function renderClassChips(agents) {
  const container = document.getElementById("classChips");
  const counts = {};
  for (const a of agents) counts[a.className] = (counts[a.className] || 0) + 1;
  const classes = Object.keys(counts).sort();
  container.innerHTML = "";
  const allChip = el("chip" + (classFilter === null ? " active" : ""), `todos (${agents.length})`);
  allChip.addEventListener("click", () => { classFilter = null; renderClassChips(agents); renderAgentList(agents); });
  container.appendChild(allChip);
  for (const c of classes) {
    const chip = el("chip" + (classFilter === c ? " active" : ""), `${c} (${counts[c]})`);
    chip.addEventListener("click", () => { classFilter = classFilter === c ? null : c; renderClassChips(agents); renderAgentList(agents); });
    container.appendChild(chip);
  }
}

function renderAgentList(agents) {
  const container = document.getElementById("agentList");
  document.getElementById("agentCount").textContent = `(${agents.length})`;
  const query = (document.getElementById("agentSearch").value || "").toLowerCase();
  container.innerHTML = "";
  const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name));
  for (const a of sorted) {
    if (classFilter && a.className !== classFilter) continue;
    if (query && !a.name.toLowerCase().includes(query) && !a.className.toLowerCase().includes(query)) continue;
    const div = el("agent-item" + (a.id === selectedAgentId ? " selected" : ""));
    div.innerHTML = `
      <div class="name">${a.name} <span class="tier-badge tier-${a.tier}">${a.className}</span> <span class="status-badge status-${a.status}">${a.status}</span></div>
      <div class="meta">${a.location} · nivel base ${a.baseLevel} · oficio nivel ${a.jobLevel} · oro ${a.gold}${a.prison ? " · en carcel" : ""}</div>
      <div class="bar health"><div style="width:${(a.health / a.maxHealth) * 100}%"></div></div>
    `;
    div.addEventListener("click", () => { selectedAgentId = a.id; loadDetail(); renderAgentList(agents); });
    container.appendChild(div);
  }
}

function relClass(label) { return "rel-" + label; }

function slotIcon(slot) { return { weapon: "arma", armor: "armadura", tool: "herramienta" }[slot]; }

async function loadDetail() {
  const container = document.getElementById("agentDetail");
  if (!selectedAgentId) { container.innerHTML = '<p class="hint">Selecciona un agente de la lista para ver su historia.</p>'; return; }
  const a = await fetchJson(`/api/agent/${selectedAgentId}`);
  if (a.error) { container.innerHTML = `<p class="hint">${a.error}</p>`; return; }

  const goals = a.goals.map((g) => `${g.goal} (${g.weight})`).join(", ");
  const personality = Object.entries(a.personality).map(([k, v]) => `<span>${k} <b>${v.toFixed(2)}</b></span>`).join(" · ");
  const invEntries = Object.entries(a.inventory).filter(([, v]) => v > 0);

  let html = `
    <div class="detail-header"><span class="dname">${a.name}</span><span class="dclass">${a.className}${a.prison ? " · EN CARCEL" : ""}</span></div>
    <div class="detail-sub">${a.location} · estado: ${a.status} · gremio: ${a.guildId || "ninguno"}</div>

    <div class="stat-grid">
      <div class="stat-tile"><div class="label">Salud</div><div class="value">${a.health}/${a.maxHealth}</div></div>
      <div class="stat-tile"><div class="label">Oro</div><div class="value">${a.gold}</div></div>
      <div class="stat-tile"><div class="label">Poder de combate</div><div class="value">${a.combatPower}</div></div>
      <div class="stat-tile"><div class="label">Nivel base</div><div class="value">${a.baseLevel}</div></div>
      <div class="stat-tile"><div class="label">Nivel de oficio</div><div class="value">${a.jobLevel}</div></div>
    </div>

    <div class="bar xp" title="XP de nivel base"><div style="width:${Math.min(100, (a.baseXp / a.baseXpNext) * 100)}%"></div></div>
    <div class="hint" style="margin:2px 0 10px">XP base: ${a.baseXp}/${a.baseXpNext}</div>
    <div class="bar xp" title="XP de oficio"><div style="width:${Math.min(100, (a.jobXp / a.jobXpNext) * 100)}%"></div></div>
    <div class="hint" style="margin:2px 0 14px">XP de oficio: ${a.jobXp}/${a.jobXpNext}</div>

    <div class="section-title">Equipo</div>
    <div class="equip-row">
      ${["weapon", "armor", "tool"].map((slot) => {
        const eq = a.equipment[slot];
        return `<div class="equip-slot"><div class="slot-name">${slotIcon(slot)}</div>${eq ? `${eq.itemId} <span class="hint">(${eq.durability} dur.)</span>` : '<span class="hint">vacio</span>'}</div>`;
      }).join("")}
    </div>

    <div class="section-title">Objetivos y personalidad</div>
    <div class="hint">objetivos: ${goals}</div>
    <div class="hint" style="margin-top:4px">${personality}</div>

    <div class="section-title">Inventario</div>
    <div class="hint">${invEntries.length ? invEntries.map(([k, v]) => `${k} x${v}`).join(", ") : "vacio"}</div>
  `;

  if (a.nextClassOptions && a.nextClassOptions.length) {
    html += `<div class="section-title">Progresion de clase</div>`;
    for (const opt of a.nextClassOptions) {
      const ready = opt.meetsRequirement;
      html += `<div class="class-option ${ready ? "ready" : "locked"}">
        <b>${opt.name}</b> (tier ${opt.tier}) — ${ready ? "elegible" : "requisitos no cumplidos"}
        ${opt.trialStatus.need ? `<div class="hint">prueba: ${opt.trialStatus.have}/${opt.trialStatus.need}</div>` : ""}
      </div>`;
    }
  }

  if (Object.keys(a.standing).length) {
    html += `<div class="section-title">Posicion institucional</div>`;
    for (const [inst, val] of Object.entries(a.standing)) {
      html += `<div class="standing-row"><span>${inst}</span><b>${val.toFixed(1)}</b></div>`;
    }
  }

  html += `<div class="section-title">Relaciones (${a.relationships.length})</div>`;
  for (const r of a.relationships.sort((x, y) => y.affinity - x.affinity).slice(0, 12)) {
    html += `<div class="rel-item"><span class="rel-label ${relClass(r.label)}">${r.otherName}</span> — ${r.label} (afinidad ${Math.round(r.affinity)}, confianza ${Math.round(r.trust)}, ${r.interactions} interacciones)
      ${r.memories && r.memories.length ? `<div class="hint">${r.memories.slice(-2).map((m) => m.note).join("; ")}</div>` : ""}
    </div>`;
  }

  html += `<div class="section-title">Conocimiento reciente</div>`;
  for (const k of a.knowledge.slice(0, 10)) {
    html += `<div class="know-item">[t${k.tick}] ${k.fact} <span class="hint">(${k.source}, confianza ${(k.confidence ?? 1).toFixed(2)})</span></div>`;
  }

  html += `<div class="section-title">Memoria</div>`;
  for (const m of a.memory.slice(0, 10)) {
    html += `<div class="mem-item">[t${m.tick}] ${m.summary} <span class="hint">(importancia ${m.importance})</span></div>`;
  }

  html += `<div class="section-title">Decisiones recientes</div>`;
  for (const d of a.recentDecisions.slice(0, 12)) {
    html += `<div class="dec-item">[t${d.tick}] objetivo=${d.goal} → <span class="action">${d.selectedAction}</span>${d.target ? ` (${d.target})` : ""}
      <div class="reasons">${(d.reasons || []).join("; ")} — esperado: ${d.expectedOutcome}</div></div>`;
  }

  container.innerHTML = html;
}

document.getElementById("agentSearch").addEventListener("input", () => { if (state) renderAgentList(state.agents); });

// ---------- guilds ----------
function renderWar(war, warBonus) {
  const panel = document.getElementById("warPanel");
  if (!war && !warBonus) { panel.innerHTML = '<h2>Disputa entre gremios</h2><p class="hint">Sin disputa activa en este momento.</p>'; return; }
  let html = "<h2>Disputa entre gremios</h2>";
  if (war) {
    const participants = Object.entries(war.participants);
    html += `<p class="hint">Se disputa el control de <b>${war.locationName}</b> · declaraciones hasta el tick ${war.declarationDeadline} · se resuelve en el tick ${war.resolveTick}</p>`;
    html += participants.length
      ? `<div class="hint">Participantes: ${participants.map(([n, p]) => `${n} (poder ${p})`).join(", ")}</div>`
      : '<div class="hint">Ningun gremio se ha declarado todavia.</div>';
  }
  if (warBonus) {
    html += `<p class="hint" style="margin-top:8px">Control vigente: <b>${warBonus.guildName}</b> domina ${warBonus.locationName} hasta el tick ${warBonus.expiresTick} (descuento de impuestos y bono de recoleccion para sus miembros ahi).</p>`;
  }
  panel.innerHTML = html;
}

function renderGuilds(guilds) {
  const grid = document.getElementById("guildGrid");
  grid.innerHTML = "";
  if (!guilds.length) { grid.innerHTML = '<p class="hint">Ningun gremio se ha fundado todavia.</p>'; return; }
  for (const g of [...guilds].sort((a, b) => (a.disbanded ? 1 : 0) - (b.disbanded ? 1 : 0))) {
    const card = el("guild-card" + (g.disbanded ? " disbanded" : ""));
    const active = (g.contractHistory || []).length ? g.contractHistory.slice(-3).reverse().map((c) => `${c.type} → ${c.outcome}`).join(", ") : "ninguno todavia";
    const relEntries = Object.entries(g.relationLabels || {});
    card.innerHTML = `
      <div class="gname">${g.name}${g.disbanded ? ` (disuelto: ${g.disbandReason || ""})` : ""}</div>
      <div class="gmeta">
        lider: <b>${g.leaderName || "—"}</b>${g.founderName && g.founderName !== g.leaderName ? ` · fundador: ${g.founderName}` : ""}<br/>
        reputacion: <b>${Math.round(g.reputation)}</b> · tesoro: <b>${Math.round(g.treasury)}</b> oro · fundado tick ${g.createdTick}<br/>
        especializacion: ${g.specialization || "ninguna (mezcla de oficios)"}
      </div>
      <div class="gmembers"><b>Miembros (${g.memberNames.length}):</b> ${g.memberNames.length ? g.memberNames.join(", ") : "sin miembros"}</div>
      <div class="hint" style="margin-top:6px">Encargos recientes: ${active}</div>
      ${relEntries.length ? `<div class="hint" style="margin-top:4px">Relaciones: ${relEntries.map(([n, r]) => `${n} (${r.label})`).join(", ")}</div>` : ""}
    `;
    grid.appendChild(card);
  }
}

// ---------- quests / opportunities ----------
function renderQuests(opps, guildContracts) {
  const grid = document.getElementById("questGrid");
  grid.innerHTML = "";
  const all = [
    ...(guildContracts || []).map((c) => ({ ...c, kind: "Encargo de gremio" })),
    ...(opps || []).map((o) => ({ ...o, kind: "Encargo individual" })),
  ];
  if (!all.length) { grid.innerHTML = '<p class="hint">Sin oportunidades recientes.</p>'; return; }
  for (const o of all.reverse()) {
    const card = el("quest-card");
    const statusClass = { open: "qs-open", accepted: "qs-accepted", completado: "qs-completado", "fallido": "qs-fallido", expirado: "qs-expirado" }[o.status] || "qs-open";
    card.innerHTML = `
      <span class="quest-status ${statusClass}">${o.status}</span>
      <div class="hint">${o.kind}</div>
      <div>${o.description}</div>
      <div style="margin-top:6px" class="qreward">${o.reward} oro</div>
      <div class="hint">plazo: tick ${o.deadlineTick}${o.guildId ? ` · gremio: ${o.guildId}` : ""}</div>
    `;
    grid.appendChild(card);
  }
}

// ---------- timeline ----------
async function loadTimeline() {
  const filter = document.getElementById("timelineFilter").value;
  const data = await fetchJson(`/api/timeline?limit=150${filter ? `&filter=${filter}` : ""}`);
  const container = document.getElementById("timelineList");
  container.innerHTML = "";
  for (const e of data.events) {
    const div = el("timeline-item");
    div.innerHTML = `<span class="type-dot dot-${e.type}"></span><span class="t">D${e.day} ${String(e.hour).padStart(2, "0")}:00</span><span>${e.summary}</span>`;
    container.appendChild(div);
  }
}
document.getElementById("timelineFilter").addEventListener("change", loadTimeline);

// ---------- refresh loop ----------
async function refresh() {
  state = await fetchJson("/api/state");
  if (state.error) {
    document.getElementById("clock").textContent = state.error;
    return;
  }
  renderClock(state.time);
  renderStatStrip(state);
  renderLlmPanel();
  renderLocations(state.locations);
  renderClassChips(state.agents);
  renderAgentList(state.agents);
  renderGuilds(state.guilds);
  renderWar(state.guildWar, state.guildWarBonus);
  renderQuests(state.opportunities, state.guildContracts);
  if (selectedAgentId) loadDetail();
  if (currentTab === "timeline") loadTimeline();
}

document.getElementById("advance1").addEventListener("click", async () => {
  await fetchJson("/api/tick?n=24", { method: "POST" });
  refresh();
});
document.getElementById("advance7").addEventListener("click", async () => {
  await fetchJson("/api/tick?n=168", { method: "POST" });
  refresh();
});

setInterval(() => {
  if (document.getElementById("autorefresh").checked) refresh();
}, 5000);

refresh();

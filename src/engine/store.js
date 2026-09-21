import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RUNTIME_DIR = path.resolve(__dirname, "../../data_runtime");
export const STATE_FILE = path.join(RUNTIME_DIR, "state.json");
export const EVENTS_FILE = path.join(RUNTIME_DIR, "events.jsonl");
export const DECISIONS_FILE = path.join(RUNTIME_DIR, "decisions.jsonl");
export const LLM_DECISIONS_FILE = path.join(RUNTIME_DIR, "llm_decisions.jsonl");
export const LLM_BUDGET_FILE = path.join(RUNTIME_DIR, "llm_budget.json");

export function ensureRuntimeDir() {
  if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

export function stateExists() {
  return fs.existsSync(STATE_FILE);
}

export function loadState() {
  ensureRuntimeDir();
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
}

export function saveState(state) {
  ensureRuntimeDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function appendEvent(event) {
  ensureRuntimeDir();
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + "\n", "utf-8");
}

export function appendDecision(record) {
  ensureRuntimeDir();
  fs.appendFileSync(DECISIONS_FILE, JSON.stringify(record) + "\n", "utf-8");
}

// Log de decisiones de la politica LLM (Experimento V3), separado de
// decisions.jsonl (que registra TODAS las decisiones, deterministas y LLM,
// vecinas al agente). Este log adicional existe para reconstruir sin
// ambiguedad cada llamada real a DeepSeek: tokens, costo, latencia,
// fallback. Nunca contiene la API key ni razonamiento extenso (seccion 19).
export function appendLlmDecision(record) {
  ensureRuntimeDir();
  fs.appendFileSync(LLM_DECISIONS_FILE, JSON.stringify(record) + "\n", "utf-8");
}

export function loadLlmBudget() {
  ensureRuntimeDir();
  if (!fs.existsSync(LLM_BUDGET_FILE)) return null;
  return JSON.parse(fs.readFileSync(LLM_BUDGET_FILE, "utf-8"));
}

export function saveLlmBudget(budgetState) {
  ensureRuntimeDir();
  fs.writeFileSync(LLM_BUDGET_FILE, JSON.stringify(budgetState, null, 2), "utf-8");
}

export function readJsonl(file, limit) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
  const slice = limit ? lines.slice(-limit) : lines;
  return slice.map((l) => JSON.parse(l));
}

export function resetRuntime() {
  ensureRuntimeDir();
  for (const f of [STATE_FILE, EVENTS_FILE, DECISIONS_FILE, LLM_DECISIONS_FILE, LLM_BUDGET_FILE]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

// Cliente minimo para la API de DeepSeek (compatible con el formato de
// chat completions de OpenAI). Unica responsabilidad: hacer UNA llamada
// HTTP y devolver un resultado normalizado. No sabe nada de presupuesto,
// reintentos ni fallback — eso vive en llmDecision.js.

const BASE_URL = "https://api.deepseek.com";
const MODEL = "deepseek-flash";
const TIMEOUT_MS = 15000;
const MAX_OUTPUT_TOKENS = 220; // solo un JSON corto + una razon breve (seccion 10 del encargo)
const TEMPERATURE = 0.3; // baja/moderada: buscamos decision consistente, no creatividad (seccion 18)

// deepseek-flash es un modelo con "thinking mode" activado por defecto: sin
// esto, la API antepone un bloque reasoning_content (observado: ~90-110
// tokens) al JSON real, y con max_tokens acotado el contenido final puede
// quedar vacio (confirmado en pruebas: content="" cuando el razonamiento
// agota el presupuesto de tokens). Desactivarlo server-side, ademas de
// evitar ese fallo, es exactamente lo que pide el encargo: no necesitamos
// ni queremos guardar cadena de razonamiento (seccion 10).
const THINKING_DISABLED = { type: "disabled" };

// Nunca se imprime, loguea ni persiste el valor de la key en ningun sitio.
export function hasApiKey() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

let warnedMissingKey = false;

export async function callDeepSeek({ systemPrompt, userPrompt }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.error("DEEPSEEK_API_KEY is not configured. Los agentes LLM usaran la politica determinista como fallback.");
      warnedMissingKey = true;
    }
    return { ok: false, errorType: "missing_api_key", latencyMs: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: TEMPERATURE,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        thinking: THINKING_DISABLED,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;

    if (res.status === 401 || res.status === 403) {
      return { ok: false, errorType: "auth_error", latencyMs, httpStatus: res.status };
    }
    if (res.status === 402) {
      return { ok: false, errorType: "insufficient_balance", latencyMs, httpStatus: res.status };
    }
    if (res.status === 429) {
      return { ok: false, errorType: "rate_limit", latencyMs, httpStatus: res.status };
    }
    if (!res.ok) {
      return { ok: false, errorType: res.status >= 500 ? "server_error" : "http_error", latencyMs, httpStatus: res.status };
    }

    const body = await res.json();
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, errorType: "empty_response", latencyMs };
    }
    return { ok: true, content, usage: body.usage || null, latencyMs, model: body.model || MODEL };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const errorType = err.name === "AbortError" ? "timeout" : "network_error";
    return { ok: false, errorType, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

export const DEEPSEEK_MODEL = MODEL;
export const DEEPSEEK_MAX_OUTPUT_TOKENS = MAX_OUTPUT_TOKENS;
export const DEEPSEEK_TEMPERATURE = TEMPERATURE;

// Cliente minimo para Ollama local. Solo hace la llamada HTTP y devuelve
// texto o null. No sabe nada de SANCTUARY.

const OLLAMA_URL = "http://localhost:11434/api/generate";

export async function ollamaGenerate(model, prompt, timeoutMs = 30000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), timeoutMs)
  );
  try {
    const res = await Promise.race([
      fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false }),
      }),
      timeout,
    ]);
    if (!res.ok) {
      console.warn(`[ollama] HTTP ${res.status}`);
      return null;
    }
    const body = await res.json();
    return body.response?.trim() || null;
  } catch (err) {
    console.warn(`[ollama] ${err.message}`);
    return null;
  }
}

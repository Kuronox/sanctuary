// PreToolUse hook (matcher: Bash). Heuristica de mejor esfuerzo: si un
// comando menciona un JSONL de simulacion (data_runtime/, data_runtime_step5/)
// y no contiene ningun indicador de lectura acotada (tail/head/grep/jq/node/
// awk/sed -n/wc/findstr/Select-Object/-Tail/ls/du/stat), pide confirmacion
// en vez de bloquear directamente: es un heuristico de texto, no un analisis
// real del comando, asi que puede tener falsos positivos/negativos (ver
// limitaciones documentadas para este hook).
const TARGET_PATTERN = /data_runtime(_step5)?[\\/][^ \t"'`|<>]*\.jsonl/i;
const SAFE_MARKERS =
  /(\btail\b|\bhead\b|Select-Object\s+-(First|Last)|-TotalCount|\bwc\b|\bgrep\b|\bjq\b|\bnode\b|\bawk\b|sed\s+-n|Get-Content[^\n]*-Tail|findstr|\bls\b|\bdu\b|\bstat\b|-Tail\b)/i;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const command = (input.tool_input && input.tool_input.command) || "";

  if (TARGET_PATTERN.test(command) && !SAFE_MARKERS.test(command)) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason:
            "Este comando menciona un .jsonl de simulacion (data_runtime/data_runtime_step5, pueden pesar cientos de MB) " +
            "sin un indicador de lectura acotada (tail/head/grep/node/wc/...). Confirma si es intencional, o usa un metodo acotado.",
        },
      })
    );
  }
  process.exit(0);
});

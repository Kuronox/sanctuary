// PreToolUse hook (matcher: Read). Bloquea lecturas de Read con un `limit`
// explicito por encima del default seguro de la propia tool (2000 lineas)
// sobre los JSONL de simulacion (data_runtime/, data_runtime_step5/), que
// pueden pesar cientos de MB. Un Read sin `limit` ya usa ese default seguro
// y nunca se bloquea aqui.
const SAFE_DEFAULT_LIMIT = 2000;
const TARGET_PATTERN = /(^|[\\/])data_runtime(_step5)?[\\/].*\.jsonl$/i;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const filePath = (input.tool_input && input.tool_input.file_path) || "";
  const limit = input.tool_input && input.tool_input.limit;

  if (TARGET_PATTERN.test(filePath) && typeof limit === "number" && limit > SAFE_DEFAULT_LIMIT) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            `Read con limit=${limit} sobre un JSONL de simulacion (data_runtime/data_runtime_step5, pueden pesar cientos de MB). ` +
            `Usa Bash con tail/head/grep, o un script Node que procese linea por linea, en vez de subir el limit por encima del default seguro (${SAFE_DEFAULT_LIMIT}).`,
        },
      })
    );
  }
  process.exit(0);
});

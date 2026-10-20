# Sanctuary

Experimento 4: un pequeño mundo persistente donde agentes autónomos deciden
qué hacer bajo reglas, recursos y consecuencias — sin historia
predeterminada.

- [`docs/REPORT.md`](docs/REPORT.md) — informe de V1 (MVP): motor base, información limitada, primeras corridas.
- [`docs/REPORT_V2.md`](docs/REPORT_V2.md) — informe de V2: progresión por clases, economía con sumideros reales, crimen/instituciones, partidas temporales, decisiones por instancia.
- [`docs/REPORT_EXPERIMENT_A.md`](docs/REPORT_EXPERIMENT_A.md) — Experimento A: gremios como instituciones persistentes (tesorería, cuotas, encargos colectivos, guerra periódica, sucesión de liderazgo).
- [`docs/REPORT_EXPERIMENT_B.md`](docs/REPORT_EXPERIMENT_B.md) — Experimento B: farming tipo "Cartman", reacción del mercado a la sobreexplotación, progresión criminal (Novato → Pícaro → Contrabandista/Asesino), riqueza social pasiva.
- [`docs/REPORT_EXPERIMENT_C.md`](docs/REPORT_EXPERIMENT_C.md) — Experimento C: escala a 70 agentes + novena ciudad (Praderas de Vann), un año completo. Farming aún más extremo, gremios de hasta 20 miembros, y un bug de escala (colapso de comida en ciudades superpobladas) encontrado y corregido.
- [`docs/REPORT_EXPERIMENT_D.md`](docs/REPORT_EXPERIMENT_D.md) — Experimento D: la memoria de relaciones pasa de decorativa a tener efecto real en las decisiones (una traición pesa aunque la afinidad se haya recuperado), `help_agent` ahora exige necesidad real — la mediana de riqueza pasó de 0 a 15 con ese único cambio. Primera clase Asesino de todo el proyecto y cinco trayectorias reconstruidas desde los logs. Cierra con una evaluación crítica de Sanctuary como plataforma experimental.
- [`docs/REPORT_PRE_V3.md`](docs/REPORT_PRE_V3.md) — PRE-V3: limpieza antes de introducir un policy LLM. Elimina `agent.reputation.global` (código muerto) y corrige el loop degenerativo de fundación de gremios (456 fundaciones/año con un solo agente al 79% → 61 fundaciones/año con el más activo al 20%), sin tocar el resto del motor.
- [`docs/REPORT_EXPERIMENT_V3_LLM.md`](docs/REPORT_EXPERIMENT_V3_LLM.md) — Experimento V3: una cohorte de 5 agentes (Ulra incluida) pasa a decidir vía DeepSeek en vez de la política determinista, con vista de mundo filtrada, elección por índice validado por el motor, presupuesto duro de $1 y fallback determinista automático. 300 días, 0 fallos de presupuesto/JSON, y un hallazgo concreto: Ulra concentra el 100% del crimen de las 70 agentes bajo política LLM, algo que ningún agente determinista replicó con ninguna personalidad. **Empieza aquí si es tu primera vez en el proyecto.**

### Steps experimentales (a partir de Step 7)

Cada Step es un cambio mínimo al motor con una pregunta, una hipótesis y un
veredicto honesto (APOYADA / MIXTO / NO APOYADA / PARCIAL).

| Step | Pregunta | Veredicto |
|---|---|---|
| [7](docs/REPORT_STEP7_HAMBRE.md) | Muerte por hambre | Apoyada, con matiz |
| [8](docs/REPORT_STEP8_RECURRENCIA.md) | ¿La mortalidad compone? | Mixto |
| [9](docs/REPORT_STEP9_PERCEPCION.md) | Percepción y reacción a eventos del mundo | Mixto |
| [9.5](docs/REPORT_STEP95_CONTRAFACTUAL.md) | ¿El conocimiento de peligro cambia la decisión? (contrafactual) | Mixto |
| [9.6](docs/REPORT_STEP9_6_CADENAS_CAUSALES.md) | ¿La decisión divergente produce consecuencias distintas? | Cadena causal |
| [10](docs/REPORT_STEP10_PRIMERA_VOZ.md) | Narrativa observacional con LLM local (Ollama) | Parcial |
| [11](docs/REPORT_STEP11_COMER_ANTES_QUE_HUIR.md) | Comer antes que huir | Apoyada |
| [12](docs/REPORT_STEP12_REGALAR_POR_NECESIDAD.md) | Regalar oro solo ante necesidad real | Apoyada |
| [13](docs/REPORT_STEP13_VETO_DE_GREMIO.md) | El gremio no readmite a quien malversó | Apoyada / mixto |
| [14](docs/REPORT_STEP14_APRENDER_DE_LAS_DERROTAS.md) | Aprender de las derrotas | Mixto |
| [15](docs/REPORT_STEP15_COMPRA_DE_EQUIPO.md) | Compra de equipo por necesidad vivida | Mixto (en curso) |

**Metodología.** Diseño aprobado → implementación acotada a archivos
permitidos → tests → corrida de 7200 ticks (300 días, 70 agentes) en 1–3
seeds fijas → comparación contra el Step anterior → veredicto. Cada corrida
queda en `data_runtime_step<N>_<seed>/` (ignorado por git).

**Step 10 y la narrativa.** El narrador (`src/engine/llm/narrator.js`) solo
*interpreta* decisiones ya tomadas (divergencias Tipo A). Está apagado por
defecto, escribe en `narrative.jsonl` y nunca en `state.json`, y ningún
mecanismo del motor lo lee: no participa en la causalidad. Que distintos
agentes "suenen" distinto **no** está demostrado como personalidad emergente
(6 frases, 2 agentes, y el prompt incluye los rasgos).

## Uso

```bash
npm run sim -- 7200              # 300 dias, corrida estandar de los Steps (default sin argumento: 168 ticks)
npm run sim -- 7200 <seedLabel>  # otra seed (default sanctuary-v2)
npm run sim -- 7200 --narrative  # activa el narrador Ollama (opcional, observacional)
npm test                         # todos los tests de src/engine/tests (incluye reproducibilidad, ~10 s)
npm run server                   # dashboard en http://localhost:5177
npm run reset                    # borra data_runtime/ y vuelve a empezar de cero
```

`npm run sim` retoma el último estado guardado si existe; corre `npm run
reset` primero para regenerar el mundo desde cero. Con narrativa OFF y sin
`DEEPSEEK_API_KEY`, la misma seed y el mismo código producen exactamente el
mismo `state.json`, `events.jsonl` y `decisions.jsonl`. Ollama y DeepSeek son
opcionales: si no están, la simulación avanza igual. `SANCTUARY_RUNTIME_DIR`
cambia el directorio de salida.

## Estructura

```
src/engine/
  world.js          orquestador: reloj, tick(), resolucion de invitaciones a grupo, carcel, caducidad de encargos
  entities.js        modelo de agente/gremio, relaciones (con decaimiento)
  progression.js       nivel base, nivel de oficio, cambio de clase (novato -> tier1 -> tier2)
  institutions.js        posicion institucional (separada de las relaciones personales), guardia
  guilds.js                gremios como instituciones: cuotas, encargos colectivos, sucesion, guerra
  economy.js                  mercado con reserva de oro finita, impuestos, reparacion de equipo
  knowledge.js                  conocimiento limitado, rumores, memoria de precios (arbitraje)
  actions.js                      unica superficie de accion de un agente (ver seccion 22 del encargo)
  decision.js                       politica de decision (mock/utilidad) — puntua INSTANCIAS concretas, no solo tipos
  geo.js                             caminos mas cortos entre localizaciones (para viajar con proposito)
  rng.js                             RNG determinista con seed
  store.js                           persistencia (JSON + JSONL append-only)
  llm/                               cohorte DeepSeek (V3) y narrador Ollama (Step 10, observacional)
  tests/                             tests por Step (npm test)
src/data/world_seed.json    mundo semilla: localizaciones, clases/oficios, bienes, monstruos por rango, instituciones
src/sim/run.js                 CLI para avanzar la simulacion
src/server/server.js               servidor HTTP (sin Express) que expone el estado como API
dashboard/                          interfaz web de observacion
data_runtime/                        estado persistido + logs de eventos/decisiones (+ narrative.jsonl si --narrative) (generado, no versionar)
analyze_*.mjs, chronicle.mjs         analisis de solo lectura sobre un data_runtime_* (ver cada Step)
tools/auditoria_po/                  scripts de auditoria de solo lectura
```

## Cambiar el "cerebro" de los agentes

`src/engine/decision.js` expone `decide(world, agent) -> { action, rationale }`.
Es la unica pieza que "decide" — el motor de mundo es autoritativo y solo
ejecuta acciones que `actions.js` permite. Hoy es una politica determinista
basada en utilidad. DeepSeek es opcional: si `DEEPSEEK_API_KEY` esta
configurada, la cohorte LLM (ver `src/engine/llm/`) puede usar ese proveedor
segun la configuracion existente; si no esta configurada, Sanctuary cae
automaticamente al fallback determinista sin ninguna accion adicional. Las
simulaciones deterministas nunca requieren una API key. Sustituir la politica
por otro adaptador de LLM implicaria reemplazar este archivo sin tocar el
resto del motor.

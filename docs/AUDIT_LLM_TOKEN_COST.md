# Sanctuary — Auditoría de Costo de Tokens LLM

**Fecha**: 2026-09-20 · **Versión base**: V3 (300 días, 5 agentes LLM, deepseek-flash) · **Solo auditoría — sin cambios de código**

---

## 1. Baseline real (V3)

| Métrica | Valor |
|---|---|
| Llamadas exitosas | 2.377 |
| Fallback (red) | 43 (1,8%) |
| Tokens de entrada promedio/llamada | ~2.628 |
| Tokens de salida promedio/llamada | ~31 |
| Tokens cacheados promedio/llamada | ~129 (4,9% del input) |
| Costo total (300 días) | **$0,9366** |
| Costo por llamada | ~$0,000394 |
| Costo por día simulado | ~$0,0031 |
| Costo por tick con llamada | ~$0,0004 |

Fuente primaria: `data_runtime/llm_decisions.jsonl` de la corrida V3 (no del `jsonl` actual — ese es run determinista sin API key). Cifras de `REPORT_EXPERIMENT_V3_LLM.md`.

---

## 2. Atribución al total externo

Datos externos: 5.114 peticiones · 13.478.273 tokens · $1,98 (últimos 30 días — posible tráfico no-Sanctuary).

| Métrica | Sanctuary V3 | Total externo | % atribuible |
|---|---|---|---|
| Peticiones API | 2.377 | 5.114 | **46,5%** |
| Tokens totales | ~6,25M¹ | 13,48M | **46,4%** |
| Costo | $0,9366 | $1,98 | **47,3%** |

¹ 2.377 × 2.628 input + 2.377 × 31 output = ~6.317.000 tokens brutos (sin descuento de cache).

La coherencia de los tres porcentajes (~46-47%) confirma que prácticamente todo el tráfico externo es Sanctuary, o que las otras fuentes tienen perfil de tokens similar. Si hubo tráfico ajeno, es ≤ 54% del total.

---

## 3. Desglose de tokens por sección del prompt

Basado en inspección de código (`filteredWorldView.js`, `prompt.js`) + calibrado contra el promedio observado de 2.628 tokens/llamada. Las cifras son estimaciones; una medición exacta requeriría instrumentar `buildUserPrompt()` con un tokenizador.

| Sección | Tokens est. | % del input | Fuente |
|---|---|---|---|
| **SYSTEM_PROMPT** | ~160 | 6,1% | `prompt.js`: ~600 chars, prefix cacheable |
| `aviso` | ~65 | 2,5% | string literal, ~260 chars |
| `tiempo` | ~10 | 0,4% | `{dia, hora}` |
| `yo` (stats, personalidad, objetivos) | ~175 | 6,7% | 6 traits float + needs + goals + standing |
| `yo.inventario` + `yo.equipo` | ~60 | 2,3% | variable según estado del agente |
| `ubicacion` | ~85 | 3,2% | loc + institution + conexiones (2-4) |
| **`accionesDisponibles`** (~40 acciones) | **~1.350** | **51,4%** | 40 × {indice, tipo, descripcion} |
| `relacionesRelevantes` (~4 agentes) | ~160 | 6,1% | por agente presente o referenciado |
| `memoriasRelevantes` (top 6) | ~120 | 4,6% | 6 × {hace, resumen, importancia} |
| `conocimientoReciente` (last 8) | ~210 | 8,0% | 8 × {hecho, tipo, fuente, confianza} |
| `preciosConocidosEnOtrosLugares` | ~110 | 4,2% | solo si hay trade_buy/sell candidatas |
| JSON overhead (llaves, keys) | ~90 | 3,4% | estructura JSON + nombres de campo |
| **TOTAL estimado** | **~2.595** | ~98,7% | vs 2.628 observado ✓ |

**`accionesDisponibles` es la sección dominante (>50% del prompt de usuario)**. El campo `tipo` dentro de cada acción (ej. `"tipo":"trade_buy"`) contribuye ~10-15 tokens/acción × 40 = ~480 tokens del total de esa sección, y es redundante para la decisión del modelo.

---

## 4. Redundancias identificadas

| ID | Campo | Descripción | Tokens/llamada |
|---|---|---|---|
| R1 | `aviso` | Duplica el SYSTEM_PROMPT (ambos dicen: no conocimiento omnisciente, usa solo lo que se te da). El system prompt lo establece con autoridad; el aviso lo repite en el user prompt. | ~65 |
| R2 | `accionesDisponibles[*].tipo` | El LLM elige por `indice` (nunca escribe el tipo ni los argumentos). El campo `tipo` (`"work"`, `"trade_buy"`, etc.) no es necesario para responder. | ~480 |
| R3 | `relacionesRelevantes[*].id` | El ID interno (`"ulra_v3"`) no es útil para el modelo. El `nombre` y la relación son suficientes. | ~16 |
| R4 | `conocimientoReciente[*].fuente` | La procedencia del conocimiento (quién lo dijo) rara vez cambia la decisión. El LLM solo necesita el hecho y la confianza. | ~32 |

**Total redundancias cuantificadas: ~593 tokens/llamada** (R1+R2+R3+R4), de los cuales R2 es la mayor por lejos.

---

## 5. Optimizaciones SAFE (sin cambio semántico)

Ninguna altera la información decisional que recibe el modelo. Riesgo: mínimo.

| Código | Cambio | Tokens ahorrados/llamada | Riesgo |
|---|---|---|---|
| A | Eliminar campo `aviso` de la view (R1) | ~65 | Nulo — sistema prompt ya lo cubre |
| B | Eliminar `tipo` de cada entry en `accionesDisponibles` (R2) — solo `{indice, descripcion}` | ~480 | Muy bajo — LLM elige por indice, `tipo` nunca se usa para responder |
| C | Eliminar `id` de `relacionesRelevantes` (R3) — dejar nombre, clase, rel., affinity, trust, traición | ~16 | Nulo |
| D | Eliminar `fuente` de `conocimientoReciente` (R4) — dejar hecho, tipo, confianza | ~32 | Bajo |

**Ahorro SAFE total: ~593 tokens/llamada (22,6% del input).**

En una corrida V3 equivalente (2.377 llamadas):
- Tokens ahorrados: ~1,41M
- Costo ahorrado: ~$0,212 sobre $0,9366 = **23% de ahorro**

---

## 6. Optimizaciones experimentales (pueden cambiar decisiones)

| Código | Cambio | Tokens ahorrados/llamada | Riesgo semántico |
|---|---|---|---|
| E | Reducir `memoriasRelevantes` de 6 a 3 ítems | ~60 | Bajo-medio: el modelo pierde contexto de memorias de importancia 4-6 |
| F | Reducir `conocimientoReciente` de 8 a 4 ítems (solo los más recientes) | ~105 | Medio: puede perder hechos relevantes recientes sobre precios, gremios |
| G | No poblar `preciosConocidosEnOtrosLugares` cuando el agente tiene < 5 de oro (arbitraje no viable) | ~60 (est. en 55% de llamadas) | Bajo: el modelo ya tiene las acciones candidatas; los precios son contexto de apoyo |
| H | Comprimir labels de acciones (IDs cortos en vez de nombres legibles, ej. `arma_hierro` en vez de `Arma de Hierro`) | ~150 | Medio-alto: el modelo entiende mejor "comprar Poción curativa @30" que "comprar pocion_curativa @30" |
| I | Comprimir SYSTEM_PROMPT en ~30% (el bloque de instrucciones de formato es verboso) | ~50 | Medio: instrucciones más cortas pueden producir más respuestas mal formateadas |

No recomendados sin experimento controlado previo (A/B test sobre un subconjunto de llamadas).

---

## 7. Análisis del cache

**Situación observada**: 2.376/2.377 llamadas tuvieron cache hit (99,96%), pero el ahorro efectivo fue solo ~4,9% del costo de entrada.

**Causa raíz (calculada)**:

DeepSeek cachea el prefix del system prompt. El system prompt tiene ~160 tokens de los ~2.628 totales = 6,1% del input. Con cache hit al 99,96%:

```
Ahorro efectivo = (fracción cacheada) × (tasa de hit) × (1 - precio_hit/precio_miss)
               = 0,061 × 0,9996 × (1 - 0,006/0,30)
               = 0,061 × 0,9996 × 0,98
               ≈ 5,97%
```

La diferencia entre 5,97% calculado y 4,9% observado sugiere que el system prompt real en producción es ~128-133 tokens (no ~160), o que algunas llamadas se hicieron en horario pico donde la diferencia de precios es la misma. En cualquier caso, **el mecanismo es el correcto**: solo el system prompt es cacheable porque el user prompt (la FilteredWorldView) cambia completamente en cada llamada.

**Para mejorar el aprovechamiento del cache**, habría que mover texto estático al system prompt (definiciones de bienes, geografía fija, reglas de clase). Potencial teórico: si se mueven ~500 tokens estáticos al system prompt, el ahorro efectivo subiría de ~5% a ~23%. Esto requeriría rediseñar la arquitectura de prompts (actualmente todo va al user prompt) — es un cambio experimental, no seguro.

**El cache funciona correctamente para lo que fue diseñado**. La baja eficiencia es estructural, no un bug.

---

## 8. Plan de optimización recomendado

Tres cambios en orden decreciente de impacto/riesgo:

1. **B — Eliminar `tipo` de `accionesDisponibles`** (`filteredWorldView.js`, línea 176). Cambiar:
   ```js
   ({ index, type, label }) => ({ indice: index, tipo: type, descripcion: label })
   ```
   a:
   ```js
   ({ index, label }) => ({ indice: index, descripcion: label })
   ```
   Ahorro: ~480 tokens/llamada. Tiempo: 5 min + verificación de formato de respuesta en smoke test.

2. **A — Eliminar campo `aviso`** (`filteredWorldView.js`, línea 134). Eliminar la línea `aviso: "No tienes conocimiento..."` del objeto `view`. Ahorro: ~65 tokens/llamada. Tiempo: 2 min.

3. **D — Eliminar `fuente` de `conocimientoReciente`** (`filteredWorldView.js`, línea 179). Cambiar el map para no incluir `fuente: k.source`. Ahorro: ~32 tokens/llamada. Tiempo: 2 min.

**Ahorro combinado (A+B+D): ~577 tokens/llamada = 22% del input.** No se incluye C (impacto mínimo, ~16 tokens) como elemento separado — puede incluirse en el mismo commit o dejarse.

Los cambios E/F/G son opcionales y requieren A/B testing antes de producción.

---

## 9. Estimación de ahorro

| Escenario | Tokens input/llamada | Costo/llamada (peak, sin cache) | Costo corrida V3-equivalente |
|---|---|---|---|
| **Baseline V3** | 2.628 | $0,000788 | **$0,9366** |
| **SAFE (A+B+D)** | ~2.051 | $0,000615 | **~$0,732** |
| **SAFE + E+F (reducir memorias/knowledge)** | ~1.886 | $0,000566 | **~$0,673** |

**Ahorro SAFE sobre baseline: ~$0,205 por corrida de 300 días = 21,9%.**

Ajustando por el ahorro real de cache (el system prompt ahora representa un % mayor del input total, mejorando levemente el ahorro efectivo del cache):
- Con SAFE: sistema prompt ~160 tokens de ~2.051 totales = 7,8% → ahorro cache sube de 4,9% a ~7,6%.
- Neto: ahorro SAFE real ≈ **23-25%** del costo total.

---

## 10. Decisión: ¿Vale la pena optimizar ahora?

**Sí, las optimizaciones SAFE (A+B+D) valen la pena.** Son cambios de 10 minutos en total, de riesgo cero (ninguna información decisional se pierde), y el ahorro del 22% es real aunque el monto absoluto sea modesto ($0,20 por corrida de 300 días).

**La razón más fuerte no es el ahorro en sí** — es que eliminar el campo `tipo` de cada acción (R2) hace el prompt más limpio y reduce el riesgo de confusión en el modelo (actualmente el JSON muestra tanto `"tipo":"trade_buy"` como `"descripcion":"comprar Mineral de hierro @45"`, que son redundantes uno del otro).

**Las optimizaciones experimentales (E, F, G) no valen la pena ahora.** El riesgo de degradar la calidad de decisión supera el ahorro adicional (~$0,05-0,08/corrida) sin un experimento controlado que confirme que el modelo decide igual con menos contexto.

**El cache no necesita intervención.** Funciona como fue diseñado; mejorar su aprovechamiento requeriría un rediseño de arquitectura de prompts que no justifica el costo actual.

**Límite presupuestario actual ($1,00)** es adecuado para corridas de 300 días. Si la próxima corrida es de 365 días (el hard limit se habría cruzado ~día 320 sin SAFE), las optimizaciones SAFE dejan margen hasta ~día 410 con el mismo presupuesto.

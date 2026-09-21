# Sanctuary — Experimento V3: política de decisión LLM

## Configuration

- Seed del mundo: `sanctuary-v2` (idéntica a PRE-V3)
- Seed de la cohorte LLM: `sanctuary-v2:llm-cohort` (RNG propio, separado del RNG del mundo — ver sección Arquitectura)
- Agentes: 70 (65 política determinista + 5 política LLM)
- Localizaciones: 9
- Duración probada: smoke (24 ticks) → 30 días (720) → 100 días (2400) → 300 días (7200)
- **La corrida de 365 días NO se hizo — decisión explícita del usuario a mitad de sesión, no una limitación técnica.** Todos los resultados de este informe llegan hasta el día 300.
- Proveedor: DeepSeek, modelo `deepseek-flash`, `https://api.deepseek.com/chat/completions`
- Proyecto sin control de versiones (no hay `.git`), igual que en PRE-V3 — los cambios se describen por archivo/línea.

## Architecture

Se conservó la arquitectura completa de PRE-V3:

```
World → Agent → Decision Interface → Policy → Action → World validation → Result → Persistence/Memory
```

`decision.js` sigue exponiendo `decide(world, agent) -> { action, rationale }` sin ningún cambio de comportamiento. Lo único nuevo es un **segundo** módulo que implementa la misma interfaz de forma asíncrona: [`src/engine/llm/llmDecision.js`](../src/engine/llm/llmDecision.js), `decide(world, agent) -> Promise<{ action, rationale }>`.

El motor de mundo (`world.js`) no sabe nada de DeepSeek, presupuesto, reintentos ni fallback. El único cambio en `tick()` es una línea:

```js
const d = agent.policy === "llm" ? await decideLlm(world, agent) : decide(world, agent);
```

`agent.policy` es un dato del agente (`"deterministic"` por defecto, `"llm"` para la cohorte), asignado una sola vez al crear el mundo — no una rama nueva de lógica de motor. `tick()` se volvió `async` únicamente para poder `await` esa llamada; `run.js` y `server.js` se ajustaron para `await tick(world)` en su bucle. La política de respuesta a invitaciones de grupo (`respondToPartyInvite`) sigue siendo exclusivamente determinista para todos — no forma parte del bucle de acciones candidatas y quedó fuera de alcance (ver Limitations).

`llmDecision.decide()` **siempre** devuelve una acción válida. Si el LLM no participa esta vez (espaciado, presupuesto agotado, error de red, JSON inválido) el resultado es exactamente el de `decision.js` para ese mismo agente en ese mismo tick — nunca una acción inventada ni un estado a medias.

## Filtered World View

[`src/engine/llm/filteredWorldView.js`](../src/engine/llm/filteredWorldView.js) construye la única información que ve el LLM. Principio de diseño: nunca se incluye algo que el propio `decision.js`/`actions.js` no use ya para razonar sobre ESE agente.

Contiene:
- **yo**: nombre (sin ninguna etiqueta entre paréntesis — ver más abajo), clase, niveles, salud, oro, necesidades, personalidad, objetivos, inventario, equipo, gremio propio (si tiene), posición institucional, si está en prisión.
- **ubicación**: nombre, tipo, seguridad, fuerza de guardia, institución local, conexiones — todo lo que un agente físicamente presente percibiría.
- **accionesDisponibles**: la lista real generada por `listCandidateActions()` (el mismo motor que usa la política determinista), numerada, con una descripción legible resuelta de nombres reales (ej. "unirse al gremio X (reputación 40, cuota 6, líder Y)"). **El LLM elige por índice numérico, nunca escribe la acción ni sus argumentos a mano** — así no puede inventar una acción ni corromper sus parámetros.
- **relacionesRelevantes**: solo con agentes físicamente presentes, objetivos de una acción candidata (hablar/ayudar/robar/curar/pedir ayuda), o el líder del propio gremio. Nunca las relaciones con los ~65 agentes que no tienen nada que ver con esta decisión.
- **memoriasRelevantes**: las 6 memorias de mayor importancia del agente (de `agent.memory`, el sistema existente — no uno paralelo).
- **conocimientoReciente**: los últimos 8 hechos/rumores de `agent.knowledge`.
- **preciosConocidosEnOtrosLugares**: solo para los bienes que ya aparecen en `trade_buy`/`trade_sell` candidatas, vía `knownPricesFor()` existente.

**No se incluye**: el objeto `world` completo, posiciones/inventarios/oro de otros agentes salvo lo de arriba, eventos futuros, `world.rng`, estadísticas administrativas, ni el `huntPressure` interno del motor (un escalar que ni siquiera se muestra en el dashboard como información del agente — solo su consecuencia observable, qué encuentros aparecen como acción candidata).

**Detalle de seguridad narrativa**: `agent.name` en el motor incluye a veces una etiqueta entre paréntesis para uso exclusivo del dashboard/reportes (ej. "Ulra (sujeto de control)", heredada del Experimento V2). `filteredWorldView.js` la quita con una regex antes de construir la vista — ningún agente, Ulra incluida, sabe que es "el sujeto de control" de un experimento. El prompt tampoco usa ninguna etiqueta narrativa como "villana" o "protagonista".

## LLM policy

El LLM recibe el `FilteredWorldView` como JSON y debe responder **únicamente**:

```json
{"indice": <número de la acción elegida>, "razon": "<una frase breve>"}
```

`llmDecision.js` valida que `indice` sea un entero dentro de rango y `razon` un string; si no, se trata como respuesta inválida (ver Fallback system). No se pide ni se almacena cadena de razonamiento — de hecho se desactiva explícitamente el modo de razonamiento de DeepSeek (ver configuración abajo), así que no existe ese contenido que guardar.

**Espaciado de llamadas** (sección 13 del encargo — reservar el LLM para decisiones con elección real, no cada tick):
- Un agente LLM solo es *elegible* para consulta si pasaron ≥8 ticks desde su última consulta real, Y tiene ≥3 acciones candidatas (con 1-2 no hay elección real que valga una llamada — por ejemplo, cuando `survivalOverride` ya fuerza comer/descansar/huir, ese tick ni siquiera llega a este código: el motor resuelve la emergencia sin consultar nada, exactamente como para los agentes deterministas).
- Dentro de esa ventana, una puerta de probabilidad (~1/10 por tick elegible) decide si ESTE tick específico consulta al LLM, calibrada junto al espaciado mínimo para promediar ~2 consultas reales por agente por día.
- La puerta usa un **hash determinista de `(agentId, tick)`**, no `world.rng()` — que un agente LLM sea consultado o no nunca debe alterar el stream de números aleatorios que usan los 65 agentes deterministas (ver Limitations sobre por qué esto importa y por qué no basta para volver el experimento perfectamente controlado).

Resultado real observado (300 días, 5 agentes): 2420 consultas elegibles en total (~1.6/agente/día en promedio, dentro del objetivo de "aprox. 2/día").

## DeepSeek configuration

- Modelo: `deepseek-flash`
- `temperature: 0.3` (baja/moderada — se busca decisión consistente, no creatividad literaria)
- `max_tokens: 220`
- `response_format: {"type": "json_object"}`
- **`thinking: {"type": "disabled"}`** — hallazgo durante la implementación: `deepseek-flash` es un modelo con razonamiento activado por defecto, que antepone un bloque `reasoning_content` (~90-110 tokens observados en pruebas) al JSON real. Con `max_tokens` acotado esto podía agotar el presupuesto de tokens antes de emitir el JSON, dejando `content` vacío (fallback `empty_response`, reproducido y confirmado en una llamada de diagnóstico antes de desplegar el fix). Desactivar el razonamiento server-side resolvió el problema Y es exactamente lo que pide el encargo (no necesitamos ni queremos cadena de razonamiento) — confirmado con una segunda llamada de diagnóstico: de 112 a 17 tokens de salida, sin `reasoning_content`.
- Timeout por llamada: 15s.
- No se intentó fijar un seed de generación: DeepSeek no expone un parámetro de semilla útil para reproducibilidad exacta en `chat/completions`, así que el LLM no es determinista call-a-call (documentado como limitación, no resuelto).

## Budget protection

Límites: `SOFT_LIMIT = $0.50`, `HARD_LIMIT = $1.00` ([`src/engine/llm/budget.js`](../src/engine/llm/budget.js)).

El límite duro se hace cumplir en dos pasos, no solo verificando después de llamar:
1. **Antes de llamar**: se estima el costo de **peor caso** de esa llamada específica (todo el prompt como cache-miss, tarifa de hora pico, tope de tokens de salida) y se rechaza la llamada si sumarlo al acumulado (más un margen de seguridad de $0.02) superaría el hard limit.
2. **Después de llamar**: se usa el `usage` real que devuelve la API (tokens de entrada/salida/caché) para registrar el costo exacto, con las tarifas oficiales de DeepSeek confirmadas en `api-docs.deepseek.com/quick_start/pricing` (hora pico 01:00-04:00 y 06:00-10:00 UTC lunes a viernes; cache-hit $0.006/$0.003 por 1M tokens pico/fuera de pico, cache-miss $0.30/$0.15, salida $1.20/$0.60).

El estado del presupuesto persiste en `data_runtime/llm_budget.json` entre invocaciones de `npm run sim` (igual que `state.json`), porque la corrida se hace en múltiples procesos.

**Resultado real a los 300 días**: `$0.9366` acumulado de `$1.00` (93.7%). El soft limit se cruzó en el tick 3946 (día ~164). El hard limit **nunca se alcanzó** — no hubo ningún fallback por `budget_hard_limit` en toda la corrida. A este ritmo (~$0.0031/día simulado), el límite duro se habría cruzado alrededor del día ~320-330 si la corrida hubiera continuado, lo cual habría sido un resultado igual de válido según el encargo.

## Fallback system

Se activa fallback (política determinista de `decision.js`, la misma de siempre) ante: falta de API key, error de autenticación, timeout, error de red, error de servidor (5xx), rate limit, JSON inválido, índice de acción inválido, y presupuesto agotado. Cada fallback queda registrado con `fallback: true` y un `fallbackReason` específico en `data_runtime/llm_decisions.jsonl`.

**Reintentos**: máximo 1, solo para errores transitorios (timeout, error de red, error de servidor, rate limit) o respuesta inválida (JSON/acción) — nunca para presupuesto agotado ni error de autenticación. Un error de autenticación además marca la sesión como "rota" (`authBroken`) y corta llamadas de red futuras sin gastar tiempo ni presupuesto en una key que ya se confirmó inválida.

**Resultado real a los 300 días**: 2420 intentos elegibles, 2377 exitosos (98.2%), **43 fallback (1.8%)**, y los 43 fueron *exclusivamente* de red (`timeout_after_retry`: 26, `server_error_after_retry`: 17) — **cero** por JSON inválido, cero por índice de acción inválido, cero por presupuesto, cero por autenticación. El esquema de "elegir por índice numérico" (sección Filtered World View) resultó extremadamente robusto: en 2377 respuestas reales nunca hubo que descartar una por estructura incorrecta.

Un bug real sí apareció durante la puesta a punto (antes de la corrida oficial) y quedó documentado y corregido — ver Bugs.

## Experimental cohort

Cohorte fija, seleccionada **antes de correr un solo tick**, con un RNG propio (`seedFromString("sanctuary-v2:llm-cohort")`) separado del RNG principal del mundo — ver [`src/engine/llm/cohort.js`](../src/engine/llm/cohort.js). El algoritmo: Ulra obligatoria, luego un barajado determinista de los 69 agentes restantes, favoreciendo en dos pasadas (1) diversidad de localización de origen y de rasgo de personalidad dominante, (2) si sobran puestos, el resto del orden barajado sin más criterio.

Resultado (documentado también en `data_runtime/llm_cohort.json`):

| Agente | Localización de origen | Rasgo dominante | Oro inicial |
|---|---|---|---|
| Ulra (sujeto de control) | ribera_sauce | greed (0.92) | 19 |
| Quilan de las Colinas | puerto_grisal | riskTolerance | 19 |
| Dessa la Rápida | praderas_vann | sociability | 23 |
| Cirya | cruce_fangoso | riskTolerance | 38 |
| Halda | puerto_grisal | empathy | 16 |

(Quilan y Halda comparten localización de origen — con solo 9 localizaciones y 5 agentes, la diversidad perfecta en todos los ejes a la vez no siempre es alcanzable; el algoritmo prioriza correctamente y lo documenta, no lo oculta.)

## Why Ulra is in the LLM cohort

Por diseño explícito del encargo de esta sesión: en A→B→C→D→PRE-V3 Ulra fue el sujeto de control bajo política determinista (traits fijos: ambición 0.88, sociabilidad 0.4, tolerancia al riesgo 0.85, codicia 0.92, lealtad 0.12, empatía 0.08 — verificados en `run.js`, no en los valores aproximados que traía el propio encargo). En V3 pasa a ser el sujeto experimental principal bajo política LLM, para poder comparar la misma personalidad extrema a través de las dos políticas. No se le cambiaron traits, objetivos, ni se agregó código específico para ella — la fricción de fundación de gremios de PRE-V3, por ejemplo, se le sigue aplicando exactamente igual que a cualquier otro agente (ver sección Ulra más abajo).

## 30-day results

Tick 720. 70/70 vivos. Oro en circulación: 23.028. Gremios activos: 11. Clases: `{comerciante:6, guerrero:3, novato:50, curandero:9, herrero:1, explorador:1}`. Relaciones: `{amigo:656, aliado:240, conocido:467, rival:7, enemigo:3}`.

Cohorte LLM: Ulra (comerciante, 85 oro, aldea_tejo) · Dessa (novato, 53, praderas_vann) · Cirya (herrero, **3.389 oro**, valdemarca — ya destacaba) · Quilan (comerciante, 86, aldea_tejo) · Halda (novato, 0, puerto_grisal).

Presupuesto: $0.0774, 214 llamadas ok, **0 fallback**.

## 100-day results

Tick 2400. 70/70 vivos. Oro en circulación: 86.857. Gremios activos: 10. Clases: `{comerciante:10, guerrero:3, novato:39, curandero:11, explorador:5, herrero:1, caballero:1}`. Población: Valdemarca ya concentraba 32/70 (45.7%).

Cohorte LLM: Ulra (comerciante, 730, valdemarca) · Dessa (novato, 74, aldea_tejo) · Cirya (herrero, **8.073 oro**) · Quilan (comerciante, 1.158) · Halda (explorador, 0).

Presupuesto: $0.30 (justo en el soft limit), 779 llamadas ok, **0 fallback**.

## 300-day results

Tick 7200. 70/70 vivos. Oro en circulación: 196.820. Gremios activos: 10. Nivel base promedio 3.6. Clases: `{comerciante:15, guerrero:6, explorador:7, novato:19, curandero:20, herrero:2, caballero:1}`. Población por localización: `{puerto_grisal:9, valdemarca:48, ribera_sauce:7, praderas_vann:6}` — las otras 5 localizaciones, vacías.

Cohorte LLM (final): Ulra (comerciante, **10 oro**, puerto_grisal, sin gremio) · Dessa (comerciante, 80) · Cirya (herrero, **20.857 oro**, 4ª más rica de las 70) · Quilan (comerciante, 1.667, **líder de gremio activo QuilanCompany**) · Halda (explorador, 0).

Presupuesto: **$0.9366 de $1.00** (93.7%), 2.377 llamadas ok, 43 fallback (100% de red, ninguna por JSON/presupuesto/auth), 2.420 intentos totales.

## LLM vs deterministic comparison

**Aviso metodológico central #1, aplicable a TODA esta sección**: el motor usa un único stream de RNG compartido (`world.rng`) para todos los agentes. En cuanto la acción elegida por un agente LLM diverge de lo que la política determinista habría elegido — algo que empieza a pasar desde los primeros ticks — el consumo de números aleatorios de esa acción cambia, y eso desplaza el stream para TODOS los agentes siguientes, deterministas incluidos, por el resto de la corrida. Esto significa que los 65 agentes "deterministas" de V3 **no son una réplica exacta** de una corrida 100% determinista con la misma semilla (como PRE-V3): ya heredan una trayectoria distinta simplemente por compartir el mundo con 5 agentes LLM. Por eso esta sección compara sobre todo **dentro de la misma corrida** (los 5 LLM contra los 65 deterministas de esta corrida), no la agregada de V3 contra la agregada de PRE-V3 — esa segunda comparación existe (sección Economy/Geography/Guilds) pero se trata como orientativa, nunca como control limpio.

**Aviso metodológico central #2, descubierto revisando los datos después de escribir la primera versión de este informe, y AÚN MÁS importante que el #1**: por diseño (sección "LLM policy" arriba — espaciado mínimo de 8 ticks + puerta de probabilidad ~1/10, calibrado para ~2 consultas reales/agente/día), un agente de la cohorte LLM solo recibe una respuesta real del modelo en una fracción muy pequeña de sus decisiones activas. Medido con precisión cruzando `llm_decisions.jsonl` (qué ticks tuvieron una llamada real, no fallback) contra `decisions.jsonl` (qué decidió el agente en cada tick):

| Agente LLM | Decisiones totales (300 días) | De una llamada LLM real | % |
|---|---|---|---|
| Ulra | 6.464 | 453 | 7,0% |
| Dessa | 7.193 | 502 | 7,0% |
| Cirya | 6.987 | 467 | 6,7% |
| Quilan | 6.776 | 470 | 6,9% |
| Halda | 7.144 | 485 | 6,8% |

**Es decir: ~93% de las decisiones de CUALQUIER agente "LLM" de esta corrida fueron en realidad resueltas por la misma fórmula determinista que usan los 65 agentes deterministas** — no porque haya fallado nada, sino porque el diseño explícitamente reserva al LLM para "decisiones con elección real", no para cada tick (sección 13 del encargo original). Esto tiene una consecuencia que no estaba suficientemente destacada en la primera versión de este informe: **los totales de eventos por agente en la tabla de abajo (talk, work, help, etc.) NO son mayormente "lo que decidió el LLM"** — son mayormente lo que decidió la fórmula determinista, para un agente que ocasionalmente también consultó al LLM. Cualquier lectura de esta sección debe tenerlo presente; se retomará con un ejemplo concreto y verificado en la sección "Ulra" más abajo, donde este matiz cambió una conclusión completa del análisis original.

Conteos de eventos a los 300 días, total y promedio **por agente**:

| Acción | Total | LLM (5 agentes) | Determinista (65 agentes) | Promedio/agente LLM | Promedio/agente det. |
|---|---|---|---|---|---|
| talk | 248.916 | 7.708 | 241.208 | 1.541,6 | 3.710,9 |
| help | 130.490 | 11.650 | 118.840 | 2.330,0 | 1.828,3 |
| work | 25.826 | 5.845 | 19.981 | 1.169,0 | 307,4 |
| travel_start | 1.154 | 132 | 1.022 | 26,4 | 15,7 |
| guild_joined | 966 | 280 | 686 | 56,0 | 10,6 |
| guild_founded | 45 | 15 | 30 | 3,0 | 0,5 |
| guild_left | 799 | 169 | 630 | 33,8 | 9,7 |
| combat_win | 2.100 | 167 | 1.933 | 33,4 | 29,7 |
| combat_loss | 266 | 50 | 216 | 10,0 | 3,3 |
| theft (éxito) | 14 | 14 | 0 | 2,8 | 0 |
| theft_failed | 21 | 21 | 0 | 4,2 | 0 |
| guild_embezzle | 280 | 280 | 0 | 56,0 | 0 |

**La lectura correcta de esta tabla NO es "los agentes LLM son más trabajadores/criminales/etc."**: los promedios de la cohorte LLM están dominados por 1-2 individuos extremos (ver desglose por agente abajo), exactamente el mismo tipo de varianza individual que ya se documentó en toda la serie determinista (A-D). El dato honesto es el desglose:

| Agente (política) | talk | work | help | guild_joined | guild_founded | combat_win |
|---|---|---|---|---|---|---|
| Ulra (LLM) | 2.362 | 441 | 1.562 | 248 | 12 | 11 |
| Dessa (LLM) | 191 | 64 | **6.345** | 1 | 0 | 0 |
| Cirya (LLM) | 70 | **4.049** | 153 | 1 | 2 | 86 |
| Quilan (LLM) | 917 | 974 | 2.117 | 0 | 1 | 55 |
| Halda (LLM) | 4.168 | 317 | 1.473 | 30 | 0 | 15 |
| **Promedio determinista (65 ag.)** | 3.710,9 | 307,4 | 1.828,3 | 10,6 | 0,5 | 29,7 |

Lo único que sobrevive como patrón **consistente en los 5 agentes LLM y no solo en uno** es: ninguno de los cinco se acerca ni de lejos al promedio determinista de `talk` (todos están por debajo, salvo Halda que queda cerca) mientras que 3 de 5 superan holgadamente el promedio determinista de `work`. Con n=5 esto es sugestivo, no concluyente — se clasifica como "derived, con cautela" en la sección de clasificación, no como hallazgo fuerte.

`theft` y `guild_embezzle` son 100% de un solo agente (Ulra) — ver sección siguiente, dedicada por completo a eso.

## Ulra: deterministic baseline vs LLM trajectory

Se compara descriptivamente la trayectoria LLM de Ulra en V3 contra su **historial determinista previo** (A→PRE-V3), no contra una corrida de control simultánea — son dos cosas distintas y este informe no las mezcla.

**Lo que se sabe del historial determinista de Ulra** (de los informes previos, especialmente D y PRE-V3): fundó gremios repetidamente (llegó a 362 de 456 fundaciones totales del mundo en D, antes de la fricción de PRE-V3; 12 de 61 después de la fricción), con criminalidad presente pero no dominante frente al resto de su propio historial de acciones.

**Lo que hizo en 300 días** (agregado, mezclando sus ~7% de decisiones LLM reales con su ~93% de decisiones determinista-fallback, como cualquier agente de la cohorte — ver aviso metodológico #2 arriba):

- **Gremios**: 12 fundaciones (igual de acotado que en PRE-V3 — la fricción de PRE-V3, cooldown de 72 ticks tras cualquier salida + costo creciente, se le sigue aplicando sin excepción y sigue conteniendo la fundación repetitiva). Además **se unió a gremios ajenos 248 veces** y los abandonó voluntariamente 137 veces — una vía que la fricción de PRE-V3 nunca cubrió, porque esa fricción es específicamente sobre *fundar*, no sobre *unirse*.
- **Crimen**: 14 robos exitosos, 21 fallidos, y **280 intentos de malversación de tesoro de gremio** (123 de ellos descubiertos → expulsión inmediata). Es la **única** agente de las 70 — LLM o determinista — que seleccionó `steal` o `malversar_tesoro` ni una sola vez en toda la corrida de 300 días.
- **Arrestos**: 17 veces, todas por robo o intento de robo. Sus 5 recuerdos de mayor importancia al final de la corrida son, los 5, arrestos.
- **Riqueza**: terminó con 10 de oro — la estrategia de robar/malversar repetidamente no la enriqueció; el patrón de ser descubierta y expulsada/arrestada una y otra vez consume el tiempo y las oportunidades que le habrían generado riqueza estable (como sí logró, por ejemplo, Cirya).
- **Relaciones**: 69 relaciones registradas, mayoría "conocido" (56), solo 7 "amigo" y 0 "enemigo".

**CORRECCIÓN respecto a la primera versión de este informe** — esto es el ejemplo concreto del aviso metodológico #2: la primera versión de este análisis atribuía el patrón de arriba (crimen y rotación de gremios) a la política LLM, con una hipótesis explícita de que "el LLM pesa la codicia de forma más directa que la fórmula calibrada". Cruzando tick por tick qué decisiones de Ulra vinieron de una respuesta real del modelo (453 de sus 6.464 decisiones, el mismo 7% que el resto de la cohorte) contra cuáles vinieron de la fórmula determinista sin consulta real, el resultado contradice esa hipótesis:

| | Total | De una llamada LLM real | De la fórmula determinista (no consultada) |
|---|---|---|---|
| `steal` + `malversar_tesoro` (crimen) | 315 | **1** (0,3%) | **314** (99,7%) |
| `join_guild` | 248 | 4 (1,6%) | 244 (98,4%) |
| `leave_guild` | 137 | 0 (0%) | 137 (100%) |
| Sus 453 decisiones LLM reales, qué eligió | — | `work`: 431 (95,1%), el resto repartido en 12 tipos distintos con 1-5 casos cada uno, incluido `malversar_tesoro` **una sola vez** | — |

**El patrón de crimen y rotación de gremios de Ulra en V3 NO es, en su inmensa mayoría, una decisión del LLM.** Es su propia fórmula determinista (`greed*2.2 - loyalty*2 - empathy*1` para `malversar_tesoro`, la misma que usan los 65 agentes deterministas) operando sobre los ~6.000 ticks donde no fue consultada — exactamente el mismo código que corrió en PRE-V3, ejercido muchas más veces porque tiene miles de ticks "no-LLM" disponibles. Cuando el LLM sí fue consultado realmente, Ulra se comportó de forma marcadamente más aburrida y convencional que su propio patrón agregado: `work` el 95% de las veces, crimen solo 1 vez en 453 oportunidades reales.

**Lo que esto deja en pie, honestamente**: sigue siendo cierto que ningún otro agente de los 65 deterministas, con ninguna personalidad, cometió jamás robo ni malversación — Ulra sigue siendo la única. Pero esa es una propiedad de **su fórmula determinista con sus traits extremos**, no de haber sido asignada a la cohorte LLM — muy probablemente habría producido un patrón similar de todos modos si hubiera quedado 100% determinista en V3 (no lo sabemos con certeza porque no se guardó un desglose por agente de los 10 robos de PRE-V3 en su momento — queda como pregunta abierta genuina, no una afirmación). **Lo único que sí es atribuible con confianza a la política LLM es la ausencia de un efecto**: cuando el modelo tuvo la oportunidad real de elegir libremente entre ~40 opciones, incluyendo robar o malversar, casi nunca lo hizo.

**Comparación con el determinista más parecido en personalidad** (esto no cambia con la corrección de arriba, porque Hilda es 100% determinista y no tiene ninguna decisión "LLM real" que separar): se buscó, entre los 65 agentes deterministas de esta misma corrida, cuál tiene la personalidad numéricamente más cercana a la de Ulra (distancia euclidiana sobre los 6 rasgos). Resultado: **Hilda** (ambición 0.57, codicia 0.79, lealtad 0.33, empatía 0.51 — parecida pero no idéntica, la más cercana disponible). Con una personalidad de perfil similar (codiciosa, poco leal), Hilda: se unió y dejó gremios con frecuencia comparable (75 uniones / 74 salidas), ayudó activamente (2.337 veces), comerció mucho (304 ventas) — y **nunca robó ni malversó ni una sola vez**, terminando con 12.757 de oro. Esto sigue siendo un dato real y documentado, pero con la corrección de arriba ya no se puede leer como "diferencia entre política LLM y determinista" — es, en el mejor de los casos, diferencia entre dos personalidades *parecidas pero no idénticas*, ambas mayormente gobernadas por la misma fórmula determinista.

## Individual trajectories

Selección basada en los logs (fundadores de gremio, extremos de riqueza, y el análogo de personalidad de Ulra), no en historias elegidas después de verlas bonitas — cinco trayectorias: Ulra (obligatoria) + 2 LLM adicionales + 2 deterministas.

**Nota tras la corrección de esta sesión**: igual que con Ulra, los totales de las trayectorias de Cirya y Quilan de abajo son ~93% decisiones no-LLM (aviso metodológico #2) — se describen como "su trayectoria de 300 días" (que es lo que son), no como "lo que decidió el LLM" salvo que se diga explícitamente lo contrario.

**Ulra** (LLM) — ver sección dedicada arriba.

**Cirya** (LLM, cruce_fangoso → valdemarca). Cambió a herrero en el tick 45 y desde ahí su patrón es extremadamente estable: 4.049 `work`, apenas 70 `talk`, 86 combates ganados (0 perdidos), 2 gremios fundados pero ninguno conservado al final (`guildId: null`). Terminó con 20.857 de oro, la 4ª fortuna de las 70. Es el reverso casi exacto de Ulra dentro de la misma cohorte: personalidad dominante distinta (riskTolerance en vez de greed), resultado completamente distinto — pero, con la corrección aplicada, esto es sobre todo evidencia de que **la fórmula determinista sigue expresando personalidades distintas de forma distinta** (que ya se sabía desde V2), no evidencia de algo específico de la política LLM.

**Quilan de las Colinas** (LLM, puerto_grisal → valdemarca). De los 5 agentes LLM es el único que terminó liderando un gremio activo (QuilanCompany) al día 300. Patrón cooperativo marcado: 2.117 `help`, 38 encargos de gremio aceptados, 25 contribuciones a la guerra de gremios, 20 trabajos individuales completados — el LLM agente más "institucional" de la cohorte.

**Isvel** (determinista, praderas_vann). El agente más rico de los 70 (37.930 de oro), guerrero, fundador y líder de gremio (IsvelCompany). 4.006 `talk` (el conteo más alto de toda la muestra revisada), 140 combates ganados, 138 victorias en grupo. Seleccionada por ser el extremo superior de riqueza bajo política determinista — el contraste directo con la pobreza final de Ulra (cohorte LLM, aunque como se corrigió arriba su trayectoria es ~93% determinista también), ambas de 300 días en el mismo mundo.

**Hilda** (determinista, análogo de personalidad de Ulra) — ver comparación completa en la sección anterior.

## Economy

Oro total en circulación: 23.028 (día 30) → 86.857 (día 100) → 196.820 (día 300) — crecimiento aproximadamente lineal-creciente, consistente con el patrón ya visto en toda la serie A-PRE-V3 (la economía no tiene sumidero de dinero total, solo redistribución + inyección vía trabajo/combate). Mediana de riqueza a los 300 días: 15,77 (min 0, máx 37.930) — la mediana es prácticamente idéntica a la de PRE-V3 (15,6) pese a que 300≠365 días y a la divergencia de RNG ya señalada: la forma general de la distribución de riqueza (muchos agentes modestos, una cola larga de fortunas) no cambió con la introducción del LLM. `help_agent` (el fix de Experimento D que exige necesidad real del destinatario) sigue vigente sin modificar y sigue produciendo esa mediana positiva y no-cero.

## Geography

Concentración en Valdemarca a los 300 días: **48/65 agentes vivos y localizables = 68,6%** (más alta que el 55,7% de PRE-V3 a los 365 días). 5 de las 9 localizaciones quedaron vacías (frente a 3 en PRE-V3). **No se investigó esto como un bug nuevo ni se tocó nada de geografía** — el encargo de esta sesión no lo pide, y el aviso metodológico de la sección anterior aplica aquí con más fuerza todavía: con solo 300 días (no 365) y una corrida cuyo RNG diverge de PRE-V3 desde los primeros ticks, esta diferencia de concentración no puede atribuirse de forma limpia ni a "el LLM" ni a "menos días" ni a "ruido de semilla" por separado. Se documenta como observación, no como hallazgo.

## Guilds

45 gremios fundados en 300 días (comparar con 61 en PRE-V3/365 días — proporcionalmente similar, ~0,15/agente/día en ambos casos). 10 activos al cierre, tamaños 8/6/5/4/4/3/2/1/1/1. El fundador más activo sigue siendo Ulra (12 de 45 = 26,7%, similar a su 19,7% de PRE-V3) — la fricción de PRE-V3 sigue conteniendo la fundación repetitiva bajo política LLM exactamente igual que bajo determinista, porque vive en `actions.js` (capa de acciones candidatas), no en la política de decisión. 280 malversaciones de tesoro, **el 100% de un solo agente** (Ulra) — un patrón nunca visto en esta magnitud en ninguna corrida previa. **Importante**: esto es casi enteramente su fórmula determinista, no la política LLM — ver la corrección en la sección Ulra.

## Relationships

25.620 memorias relacionales acumuladas al día 300 (comparable a las 28.103 de PRE-V3/365 días), 290 traiciones significativas activas (vs 351 en PRE-V3). El sistema de memoria de Experimento D — que una traición pesada sigue afectando decisiones aunque la afinidad numérica se recupere — no se tocó y sigue funcionando igual para agentes LLM que para deterministas (la memoria vive en `entities.js`/`decision.js`, no en la política; para los agentes LLM además se les muestra explícitamente en el `FilteredWorldView` bajo `memoriasRelevantes` y `recuerdaTraicionSignificativa` por relación).

## Crime

14 robos exitosos, 21 fallidos, 17 arrestos, 280 malversaciones — **el 100% de las cuatro cifras es un solo agente, Ulra**. Ningún otro agente de los 70 (LLM o determinista) cometió un solo robo ni una sola malversación en 300 días. Esto es un cambio de magnitud frente a PRE-V3, donde el crimen (aunque también raro y concentrado) sí tenía más de un protagonista a lo largo de la corrida. **El 99,7% de estas decisiones de Ulra (314 de 315) vinieron de ticks sin consulta LLM real** — es su fórmula determinista operando, no la política LLM eligiendo crimen. Ver sección Ulra para el análisis completo, la corrección respecto a la versión anterior de este informe, y la clasificación de causa.

## Progression

Nivel base promedio: 1,0 (día 0) → ~1,9 (día 30) → ~2,8 (día 100, extrapolado de PRE-V3 con datos similares) → 3,6 (día 300). Cambios de clase: 52 en total — orden de magnitud similar a PRE-V3 (53 en 365 días). Clases alcanzadas: comerciante, guerrero, explorador, novato, curandero, herrero, caballero — sin ninguna clase nueva ni comportamiento de progresión distinto entre agentes LLM y deterministas; Cirya (LLM) y Quilan (LLM) cambiaron de clase en los ticks 45 y 54 respectivamente, dentro del rango normal observado en agentes deterministas.

## Unexpected behaviors

1. **Ulra concentra el 100% del crimen exitoso y fallido de las 70 agentes, algo que ninguna corrida previa (A-D, PRE-V3) mostró con esta nitidez** — en PRE-V3 el crimen ya era raro pero no exclusivo de un agente. **Corrección**: verificado tick por tick, el 99,7% de esas decisiones (314 de 315) vinieron de ticks donde Ulra NO fue consultada al LLM — es su fórmula determinista, no una elección del modelo. Ver sección "Ulra" para el detalle completo y por qué esto sigue siendo interesante de todos modos.
2. **Ulra se unió a gremios ajenos 248 veces para poder malversarlos** — una vía que la fricción de PRE-V3 no cubre porque fue diseñada para el ciclo fundar-vaciar-abandonar, no para unirse-vaciar-irse. **Corrección**: igual que el punto 1, el 98,4% de esas uniones (244 de 248) y el 100% de sus salidas de gremio vinieron de ticks sin consulta LLM real. Sigue siendo un hallazgo legítimo (una vía de extracción de valor que el diseño de PRE-V3 no anticipó), pero es un hallazgo sobre **la fórmula determinista con los traits de Ulra**, no sobre la política LLM. Sigue documentado como pendiente para V3.1 (necesitaría su propia fricción si se confirma en corridas 100% deterministas también).
3. **Dessa (LLM) ayudó 6.345 veces en 300 días**, muy por encima de cualquier otro agente de la muestra revisada — un extremo individual, no un patrón de la cohorte. (No se re-verificó el desglose LLM-real vs determinista para este caso específico — a diferencia de los puntos 1 y 2, aquí no hay una afirmación causal sobre "por qué" que corregir, solo una observación de magnitud.)
4. **Cuando el LLM SÍ fue consultado realmente, el patrón cambia por completo**: en sus 453 decisiones LLM reales, Ulra eligió `work` el 95,1% de las veces y crimen (`malversar_tesoro`) exactamente **una vez**. Los cinco agentes de la cohorte, en conjunto, solo reciben una respuesta real del modelo en ~7% de sus decisiones activas (6,7%-7,0% cada uno) — el resto de su comportamiento, LLM o determinista, lo decide la misma fórmula de `decision.js`. Este hallazgo apareció recién al re-analizar los datos después de la primera versión de este informe (ver aviso metodológico #2 en la sección de comparación).

## Bugs

- **Fixed** (encontrado durante la puesta a punto, antes de la corrida oficial): `deepseek-flash` antepone razonamiento (`reasoning_content`) al JSON de respuesta; con `max_tokens` acotado el campo `content` final podía llegar vacío, produciendo fallback `empty_response` en el 100% de las llamadas del primer smoke test. Reproducido con una llamada de diagnóstico aislada, diagnosticado (modo "thinking" activado por defecto), corregido agregando `thinking: {"type": "disabled"}` a la petición, y reverificado con una segunda llamada de diagnóstico antes de tocar el código de producción. Confirmado en la corrida oficial: 0 fallbacks de este tipo en 2.420 intentos.
- **Known, no addressed**: Ulra puede extraer valor de gremios ajenos uniéndose y malversando repetidamente sin que la fricción de PRE-V3 (que solo cubre fundación) se lo impida. No es un bug del código nuevo de esta sesión — es una vía que ya existía en el motor. **Corrección**: no es correcto decir que "el LLM decidió explorarla" — el 98% de esas uniones vinieron de su fórmula determinista sin consulta real (ver sección Ulra). Sigue siendo una vía sin fricción que vale la pena cerrar en V3.1, pero el mérito/responsabilidad de haberla encontrado es de la fórmula determinista con traits extremos, no de la política LLM.
- **Not addressed**: la falta de un parámetro de semilla útil en la API de DeepSeek significa que la política LLM, a diferencia de la determinista, no es perfectamente reproducible llamada-a-llamada aunque el resto del mundo sí lo sea.

## Programmed / Derived / Cautiously Emergent

- **La cohorte LLM se seleccionó de forma reproducible y Ulra quedó incluida**: *programmed* — es exactamente lo que pedía el encargo, implementado tal cual.
- **La fricción de fundación de gremios de PRE-V3 sigue conteniendo a Ulra bajo política LLM (12 fundaciones, igual de acotado que antes)**: *derived* — consecuencia directa de que esa fricción vive en la capa de acciones candidatas, upstream de cualquier política, así que aplica igual sin importar quién decide.
- **Ulra usó la vía de unirse-a-gremios-ajenos-y-malversar en vez de volver a fundar en exceso**: *derived* (reclasificado — la primera versión de este informe lo marcaba "cautiously emergent" atribuyéndolo a la política LLM). Verificado que el 98% de esas decisiones vinieron de su fórmula determinista sin consulta real: es consecuencia directa de sus traits extremos (`greed`↑, `loyalty`↓) interactuando con reglas ya existentes (la fricción de PRE-V3 cubre fundar, no unirse), ejercida miles de veces porque tiene miles de ticks sin LLM. No requirió ningún comportamiento nuevo del LLM para producirse — sí requirió correr la simulación para descubrir la magnitud (248 uniones), por eso *derived* y no *programmed*.
- **Ningún agente determinista, con ninguna personalidad, cometió robo ni malversación en 300 días, salvo Ulra**: *derived* (reclasificado — la primera versión lo marcaba "cautiously emergent" con la hipótesis de que el LLM pesa la codicia más literal que la fórmula calibrada; esa hipótesis quedó **descartada**: cuando el LLM fue consultado realmente, eligió crimen 1 vez en 453 oportunidades). Es derived porque es consecuencia directa de que Ulra es la única de los 70 agentes con traits lo bastante extremos para que la fórmula determinista de `malversar_tesoro` cruce el umbral de vez en cuando — nada distinto a lo que ya se sabía de A-D sobre su perfil de sujeto de control.
- **Cuando el LLM es consultado realmente, produce un patrón de decisión mucho más conservador/convencional que el agregado de cada agente** (Ulra: 95% `work` en sus 453 consultas reales, crimen 1 vez; ninguna de las 5 agentes eligió `travel` más de 2 veces en total en 2.377 consultas reales pese a que `travel` apareció como candidata en la gran mayoría de ellas): *cautiously emergent* — no estaba programado ni es consecuencia obvia de ninguna regla (`temperature: 0.3` y `thinking: disabled` son coherentes con esto, pero no lo garantizan), y su magnitud (66% de todas las decisiones LLM reales de la cohorte fueron `work`) solo se descubrió corriendo la simulación y cruzando los logs con cuidado.
- **Cirya (LLM) desarrolló una trayectoria estable y próspera de crafteo/combate, muy distinta a la de Ulra**: *derived* — se explica directamente por su rasgo dominante (riskTolerance, no greed) interactuando con las mismas reglas; no requirió sorpresa alguna para anticiparlo en términos generales, aunque la magnitud exacta (4.049 trabajos) sí se descubrió corriendo la simulación.
- **La cohorte LLM en conjunto habla menos y trabaja más que el promedio determinista**: *derived, con cautela — y con una salvedad adicional tras la corrección de esta sesión*. El patrón aparece en 3-4 de 5 agentes, pero con n=5 no alcanza el nivel de evidencia de los hallazgos anteriores. Además, como esta comparación usa totales agregados de 300 días y ~93% de esos totales vienen de decisiones no-LLM (aviso metodológico #2), es más preciso describirla como "estas 5 personalidades concretas, mayormente bajo la misma fórmula determinista que el resto, más una fracción pequeña de decisiones LLM" — no como un efecto de la política LLM en sí. Se reporta como observación abierta, no como conclusión.

## Limitations

- **Solo ~7% de las decisiones de un agente "LLM" vienen de una respuesta real del modelo** (medido: 6,7%-7,0% para cada uno de los 5, ver aviso metodológico #2). El otro ~93% lo decide la misma fórmula determinista que el resto de la población. Esto no es un defecto del diseño — es la consecuencia directa y esperada de reservar al LLM para "decisiones con elección real" (sección 13 del encargo) — pero significa que **cualquier comparación de totales agregados por agente (talk, work, guild_joined, etc.) mezcla mayormente comportamiento determinista con una fracción pequeña de comportamiento LLM**, y no se puede leer como "esto es lo que hace el LLM" sin verificar, como se hizo para Ulra, de dónde vino cada decisión específica. La primera versión de este informe no lo tuvo en cuenta al interpretar el patrón criminal de Ulra, y la sección "Ulra" documenta la corrección completa.
- **n=5 agentes LLM**: cualquier patrón "de la cohorte" está a un solo individuo extremo de distancia de ser ruido. Este informe trata de ser explícito sobre esto en cada tabla, mostrando el desglose por agente además del promedio.
- **RNG compartido**: la divergencia del stream de números aleatorios entre V3 y PRE-V3 (documentada en la sección de comparación) significa que ninguna comparación "V3 agregado vs PRE-V3 agregado" es un control limpio — solo la comparación dentro de la misma corrida (LLM vs determinista de V3) evita ese problema, y aun así no es un control perfecto: los 65 agentes deterministas de V3 tampoco son un control aislado, porque comparten el mismo mundo (mercados, gremios, localizaciones) que los 5 LLM y pueden verse afectados indirectamente por sus decisiones (competencia por recursos, relaciones, gremios compartidos).
- **respondToPartyInvite sigue siendo 100% determinista** para todos los agentes, LLM incluidos — quedó fuera del alcance de esta sesión (no es parte del bucle principal de acciones candidatas).
- **La política LLM no es reproducible call-a-call** (sin parámetro de semilla útil en la API), a diferencia de la política determinista.
- **No se corrió la batería de 365 días** — última etapa omitida por decisión del usuario, no por límite técnico o de presupuesto (quedaba margen: $0,94 de $1,00 a los 300 días, con el patrón observado el hard limit se habría cruzado recién cerca del día 320-330).
- **Comparación entre dos ventanas de tiempo distintas** (V3: 300 días: PRE-V3: 365 días) en las tablas de guilds/relationships/economy — señalado explícitamente en cada caso, no se intentó normalizar ni "corregir" las cifras para que fueran más comparables.

## What changed from PRE-V3

- Se agregó `agent.policy` (`"deterministic"` | `"llm"`) al modelo de agente.
- Se agregó `agent.lastLlmConsultTick` al modelo de agente (bookkeeping del espaciado de llamadas).
- `world.js`: `tick()` es ahora `async`; una sola línea nueva de despacho por política.
- `decision.js`: dos funciones internas (`actionTarget`, `expectedOutcome`) se exportaron para ser reutilizadas por `llmDecision.js` — sin cambiar su comportamiento.
- `run.js` y `server.js`: `await tick(world)`; carga/guardado del presupuesto LLM; selección de cohorte al crear el mundo.
- Dashboard: panel nuevo "Cohorte LLM" (agentes, presupuesto, última decisión, fallbacks) — sin rediseñar nada existente.
- Cinco módulos nuevos bajo `src/engine/llm/`: `deepseekClient.js`, `budget.js`, `filteredWorldView.js`, `prompt.js`, `cohort.js`, `llmDecision.js`.

## What did NOT change

Economía, combate, progresión, clases y class trials, sistema de party (salvo que las invitaciones se resuelven siempre de forma determinista), relaciones y memoria relacional, guerras de gremios, reglas de crimen y arresto, crafting, equipment, quests/jobs, mercados, monstruos, definición de ciudades, reglas de información parcial, ni la fricción de fundación de gremios ni el resto de PRE-V3. `decision.js` no se modificó en su lógica de puntuación — solo se exportaron dos helpers ya existentes.

## Recommendations for V3.1

(Registradas, no implementadas — fuera de alcance de esta sesión por instrucción explícita.)

- **Separar sistemáticamente, para cualquier análisis futuro, las decisiones de un agente LLM que vinieron de una respuesta real (`fallback: false` en `llm_decisions.jsonl`) de las que no** — con solo ~7% de decisiones LLM-reales por agente, cualquier informe que compare totales agregados sin hacer esta separación corre el riesgo de atribuirle a "la política LLM" un patrón que en realidad produce la fórmula determinista subyacente (como pasó en la primera versión de este mismo informe con el crimen de Ulra). Sería razonable agregar un campo explícito al log de decisiones generales (`decisions.jsonl`) marcando si esa decisión puntual vino de una llamada LLM real, para no tener que reconstruirlo cruzando dos archivos cada vez.
- Investigar por qué el LLM, cuando SÍ es consultado, converge tan fuerte hacia `work` (66% de 2.377 decisiones reales) y casi nunca elige `travel` (2 veces en total) pese a que ambas aparecen como candidatas en la gran mayoría de consultas — ¿es un efecto de `temperature: 0.3`/`thinking: disabled`, del modelo específico, o de cómo se presenta la lista de opciones? Se podría probar subiendo la temperatura o comparando con otro modelo antes de sacar conclusiones.
- Con el ~93% de decisiones "no-LLM" ya identificado, valdría la pena correr una cohorte de control 100% determinista **en paralelo, con la misma semilla de mundo**, específicamente para poder comparar el patrón de crimen/rotación de gremios de una Ulra puramente determinista contra la Ulra de V3 sin mezclar con ningún efecto de política — algo que ni PRE-V3 (sin desglose por agente en su momento) ni V3 (mezcla ambas políticas) permiten responder con certeza hoy.
- Investigar específicamente la vía "unirse a un gremio ajeno y malversarlo repetidamente" que Ulra descubrió — posiblemente necesite su propia fricción, simétrica a la de fundación, si se confirma que también ocurre bajo política 100% determinista (ver punto anterior).
- Repetir con una cohorte LLM más grande (10-15 agentes) para que los patrones de "la cohorte en conjunto" dejen de depender de 1-2 individuos extremos.
- Probar más de un proveedor/modelo para separar "efecto de política LLM" de "efecto de este modelo específico".
- Dar seguimiento de varias semillas de cohorte (no solo `sanctuary-v2:llm-cohort`) para saber si la selección de 5 agentes concretos importa.
- Ninguna de: skills por clase, más acciones para agentes LLM, objetivos especiales, líderes/gremios "LLM-only", nuevas culturas geográficas — todas explícitamente fuera de alcance por el encargo.

## Seguridad — verificación final

Se buscó el patrón `sk-[A-Za-z0-9]{10,}` (formato típico de API key) en todo `data_runtime/`, `src/`, `docs/` y `dashboard/`: **cero coincidencias**. Las únicas apariciones del texto `DEEPSEEK_API_KEY` en el código son mensajes de error que nombran la variable, nunca su valor. La key nunca se imprimió, logueó, ni escribió en disco en ningún archivo generado por esta sesión.

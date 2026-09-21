# STEP 7 — Muerte por hambre

Ejecutado con el protocolo `sanctuary-step` (skill de Claude Code), con un propósito doble:
observar el mecanismo de mortalidad por hambre, y poner a prueba el propio proceso
`sanctuary-step` + `scope-guard`. Este informe cubre ambas cosas por separado.

---

## 1. Diseño aprobado (Fase A)

- **Hipótesis**: la muerte por hambre interactúa con la mortalidad de STEP 6 sin producir
  una cascada masiva, porque `survivalOverride` ya fuerza comer/viajar antes de que el
  hambre llegue a niveles críticos.
- **Intervención**: eliminar el floor `Math.max(1, ...)` del daño por hambre en
  `decayNeeds` (`world.js`), enrutando la muerte vía `handleDeath(world, agent, { cause:
  "hambre", killer: null })`.
- **Archivos permitidos**: `src/engine/world.js`; `src/engine/actions.js` (solo si hacía
  falta soportar `killer: null`); `src/engine/tests/mortality.test.js` (solo para
  actualizar T8). Ampliado durante la ejecución, con aprobación explícita, para incluir
  este archivo (`docs/REPORT_STEP7_HAMBRE.md`) — ver sección 4.
- **Archivos prohibidos**: todo lo demás, en particular `progression.js`, `guilds.js`,
  `economy.js`, `geo.js`, cualquier sistema de combate, el floor de combate (ya removido
  en STEP 6), reglas de destino/renacimiento, `data_runtime/`, `data_runtime_step5/`.
- **Seed / duración**: `2789489010`, 300 días (7200 ticks) — misma seed que STEP 5 y STEP 6.

## 2. Auditoría previa (Fase B)

Revisando el código real (no la memoria de STEP 6):

- `handleDeath` (`actions.js`) ya normaliza `killer` con `killer || null` — **no hizo
  falta tocar `actions.js`**. El archivo condicionalmente permitido quedó sin usar.
- El tick loop llama `decayNeeds(agent)` y sigue procesando al agente en la misma
  iteración (prisión, incapacitación, invites, `decide()`/`execute()`) salvo que se corte
  explícitamente — el mismo patrón que STEP 6 ya estableció para combate
  (`handleDeath(...)` seguido de `return`/`continue`). Había que replicar ese corte para
  el camino de hambre; no estaba explicitado en el diseño, pero es mecánico (misma regla
  ya aprobada, aplicada a un nuevo punto de entrada), no una decisión científica nueva.
- `rebirthDestination` y el reset de `needs` en `handleDeath` ya son agnósticos a
  `cause` — se reutilizan sin cambios. Buen dato de diseño retroactivo: STEP 6 generalizó
  correctamente sin que hiciera falta tocarlo.
- **Gap no detectado en esta fase** (ver sección 5.3): los `criterios de éxito` pedían
  observar "gold del agente en el momento de la muerte por hambre" y "estado/necesidades
  al morir", pero el schema de `deathHistory` heredado de STEP 6 (`tick, location, cause,
  killer, lifeNumberBefore, baseLevel, jobId, guildId`) no captura `gold` ni `needs` en
  el momento de la muerte. Esto debería haberse detectado acá, antes de correr la
  simulación — no se detectó.

## 3. Implementación (Fase C) y tests (Fase D)

Cambios reales:

- `world.js`: `agent.stats.health -= 1` sin floor en `decayNeeds`; nuevo bloque
  `if (agent.stats.health <= 0) { handleDeath(world, agent, { cause: "hambre", killer:
  null }); continue; }` inmediatamente después del clamp de `maxHealth`, antes de
  cualquier otro procesamiento del agente.
- `actions.js`: **sin cambios** (confirmado por `scope-guard` vía `git diff`).
- `mortality.test.js`: T8 rediseñado — de "el hambre no mata" a "el hambre sostenida
  mata, registra `cause: "hambre"`, `killer: null`, y decrementa `lives`". El setup
  fuerza `hunger = 1` antes de cada tick para aislar el mecanismo del comportamiento
  emergente de `decision.js`.

Suite completa (`craft_instance`, `economic_pressure`, `embezzlement_friction`,
`equipment_maintenance`, `geography`, `mortality`) — **todos PASS, sin regresiones**.

`scope-guard` auditó el resultado usando `git diff` real (el repo sí tenía `.git`
inicializado, contra una premisa incorrecta que yo mismo le di — ver sección 5.1) y
devolvió veredicto **DENTRO DE ALCANCE**, sin desviaciones bloqueantes.

## 4. Simulación (Fase E)

- Seed `2789489010`, 300 días, 70 agentes — sin cambios respecto a STEP 6.
- `DEEPSEEK_API_KEY` seguía presente en este entorno; se ocultó explícitamente para el
  subproceso de la simulación, replicando las condiciones 100% fallback de STEP 5/6 (0
  llamadas reales de 2407 intentos).
- El `data_runtime/` de STEP 6 se archivó como `data_runtime_step6/` (mismo patrón
  no-destructivo usado entre STEP 5 y STEP 6) antes de generar el nuevo estado.
- Corrida completa en 3m57s, sin excepciones.

## 5. Análisis (Fase F)

### 5.1 Resultado de mortalidad

| | STEP 6 (combate solo) | STEP 7 (combate + hambre) |
|---|---|---|
| Muertes totales | 10 | 16 |
| Muertes por combate | 10 | 8 |
| Muertes por hambre | — | 8 |
| Muertes permanentes | 0 | 0 |
| Agentes con ≥2 muertes | 2 | 5 |
| Oro perdido a la muerte (acumulado) | 25.418 | 67.371 |
| Inventario perdido (unidades) | 1.003 | 1.723 |
| Equipo perdido (slots) | 3 | 10 |

**Nota de comparación honesta**: no es una comparación limpia tick a tick — la
mortalidad por hambre cambia decisiones desde el primer día, así que el RNG diverge
de STEP 6 casi de inmediato (ver también combate: bajó de 10 a 8 muertes, no por una
regla nueva sobre combate sino por la divergencia acumulada). Las cifras muestran orden
de magnitud, no una relación causal aislada.

### 5.2 Efectos esperados vs. secundarios

**Esperado** (hipótesis confirmada en esta corrida): no hubo cascada masiva. 8 muertes
por hambre en 300 días sobre 70 agentes es una tasa baja, comparable en magnitud a las
muertes por combate. `survivalOverride` parece cumplir su función mitigadora la mayoría
de las veces.

**Efecto secundario no anticipado en la hipótesis**: la hipótesis hablaba de "sin cascada
masiva" en términos agregados, pero la corrida muestra un patrón de **individuos
repetidores**: `agent_42` (Quilan de las Colinas) murió de hambre dos veces en solo 645
ticks (~27 días), y `agent_31` (Isvel el Audaz) dos veces en 186 ticks (~7.75 días) — y
`agent_42` terminó la simulación con `hunger = 1.00` (máximo) y `lives = 1`, es decir, a
un evento de morir permanentemente. Esto sugiere que, para un subconjunto pequeño de
agentes, el hambre no es un riesgo parejo y raro sino una trampa que se repite — un
patrón que la hipótesis, formulada en términos agregados, no predecía ni descartaba.

**Geografía de causas, no anticipada explícitamente pero coherente**: las 8 muertes por
combate ocurren en zonas de monstruos (`bosque_umbrio`, `cruce_fangoso`); las 8 muertes
por hambre ocurren en asentamientos con mercado (`aldea_tejo`, `valdemarca`,
`cruce_fangoso`) — nunca en zonas salvajes sin mercado. Tiene sentido mecánico (el hambre
se acumula mientras el agente hace otra cosa en un lugar poblado, sin plata para comer)
pero es un dato nuevo, no pedido explícitamente por los criterios de éxito.

**Un caso de causas mixtas**: `agent_61` (Morden) murió primero por combate (tick 1342)
y después por hambre (tick 4831) — el único caso observado de un agente afectado por
ambas causas de muerte en la corrida.

### 5.3 Anomalías / limitaciones

- **Ninguna inconsistencia de estado**: `deathHistory` total (16) = `world.stats.deaths`
  (16) = eventos `rebirth`+`permanent_death` (16+0). Ningún agente permanentemente
  muerto actuó. Ningún renacimiento coincide con el lugar de la muerte. Sin oro
  negativo. Suite de tests en verde.
- **Gap real de instrumentación (no corregido en esta corrida)**: dos de los
  observables pedidos en el diseño — "gold del agente en el momento de una muerte por
  hambre" y "estado/necesidades relevantes del agente al morir" — **no se pueden
  responder** con los datos ya generados, porque `deathHistory` (schema heredado de
  STEP 6) no guarda `gold` ni `needs` en el momento de la muerte, solo en el estado
  final del agente. Como proxy imperfecto, el gold/hunger *actual* (fin de la
  simulación) de los agentes que murieron de hambre en algún momento:

  | Agente | Gold final | Hunger final | Vidas restantes |
  |---|---|---|---|
  | Jorun | 4793 | 0.34 | 2 |
  | Quilan de las Colinas | 2664 | **1.00** | 1 |
  | Lyssa | 86 | 0.02 | 2 |
  | Elsvet la Gris | 5 | 0.26 | 2 |
  | Isvel el Audaz | 84 | 0.58 | 1 |
  | Morden | 793 | 0.06 | 1 |

  No hay un patrón claro de pobreza sostenida (Jorun tiene 4793 de oro y ya se recuperó
  del todo). No se puede confirmar ni descartar la relación hambre↔`gold=0` que pedía el
  diseño — queda sin resolver.
- **"Agentes que pasaron por hambre alta antes de morir por otra causa"**: el sistema no
  registra trayectoria de hambre en el tiempo, solo el estado en cada muerte — el diseño
  ya anticipaba esta posibilidad ("si el sistema conserva información suficiente"). No la
  conserva. El caso más cercano observable es el de causas mixtas de la sección 5.2
  (Morden), que es la dirección inversa (combate → hambre, no hambre → otra causa).

## 6. Veredicto (Fase G)

**HIPÓTESIS APOYADA, CON MATIZ**

En términos agregados, la hipótesis se sostiene: no hubo cascada masiva de muertes por
hambre (8 en 300 días sobre 70 agentes es una tasa baja, del mismo orden que combate).
Pero la hipótesis estaba formulada solo en términos agregados, y la corrida reveló un
patrón que esa formulación no cubría: un subconjunto de agentes (2 de 70, en esta seed)
muriendo de hambre repetidamente en ventanas cortas. Marcar esto como "hipótesis apoyada"
sin el matiz sería subreportar lo que se observó.

## 7. Sobre el propio proceso `sanctuary-step` (propósito metodológico de este Step)

### 7.1 Fricciones y ambigüedades encontradas

1. **Premisa incorrecta sobre el estado del repo.** Le dije a `scope-guard` que el repo
   "todavía NO tiene `.git` inicializado" — era falso (ya existe `c315fc7 "Initial
   SANCTUARY baseline after Step 6"`, sincronizado con un remoto). `scope-guard` no
   confió ciegamente en esa premisa: verificó con `git status`/`git diff` reales y lo
   señaló explícitamente en su reporte como una contradicción. **Esto es exactamente el
   tipo de error que el proceso está diseñado para atrapar, y lo atrapó** — un dato
   positivo real, no anecdótico.
2. **Zona gris entre "mecánico" y "decisión de diseño no contemplada" (regla 6).**
   Agregar el corte `continue` tras una muerte por hambre en el tick loop no estaba en
   el texto de la intervención aprobada. Lo clasifiqué como mecánico (mismo patrón ya
   aprobado en STEP 6) y seguí sin detenerme, pero fue un juicio mío, no una regla
   binaria del proceso — otra persona ejecutando el mismo protocolo podría haber
   interpretado que ameritaba parar y preguntar.
3. **Tensión estructural real entre el protocolo genérico y el alcance específico de un
   Step**: la Fase H de `sanctuary-step` exige un reporte en `docs/`, pero el diseño de
   Fase A de STEP 7 no incluía ningún archivo de `docs/` en la lista de permitidos. Esto
   no es un error de quien escribió el diseño de STEP 7 — es que el skill genérico
   (`sanctuary-step`) y el mecanismo de alcance por Step (`archivos permitidos`) no están
   coordinados entre sí: nada obliga a que la lista de permitidos de un Step incluya
   automáticamente el archivo de reporte que el propio protocolo va a pedir en Fase H.
   Tuve que parar y preguntar (ver más abajo) en vez de decidirlo solo.
4. **Gap de instrumentación no atrapado en Fase B** (ya descrito en 5.3): la Fase B del
   protocolo pide "verificar que la intervención ataque el mecanismo planteado", pero no
   pide explícitamente "verificar que la instrumentación existente pueda responder los
   criterios de éxito declarados en Fase A". Ese chequeo faltante dejó pasar un gap real
   que solo se descubrió en Fase F, después de correr la simulación de 4 minutos — más
   caro de descubrir tarde que si Fase B lo hubiera exigido explícitamente.

### 7.2 Momentos de parada real

- Una vez: por la tensión de Fase H/alcance descrita en el punto 3. Fue la única vez que
  el proceso me obligó a devolver la decisión al usuario en lugar de decidir solo.
- `scope-guard` no encontró ninguna desviación de alcance real (0 hallazgos 🔴, 0 🟡) —
  solo observaciones fuera de checklist (un comentario ahora desactualizado en
  `actions.js` que no me correspondía tocar, y archivos `.claude/` ajenos al diff).

### 7.3 Tiempo/esfuerzo aproximado

Fase A ya venía completa (pegada por el usuario) — cero fricción ahí. Fase B tomó 3
lecturas de código dirigidas (decayNeeds, handleDeath, el tick loop completo) antes de
tocar un archivo; encontró 2 datos útiles (actions.js innecesario, patrón de corte a
replicar) y no encontró el gap de instrumentación de 7.1.4. Fase C fueron 3 ediciones
puntuales. Entre diseño aprobado y primera línea de código: bajo, del orden de minutos
de lectura dirigida, no de exploración abierta — el beneficio más claro y menos
ambiguo del protocolo en esta corrida.

### 7.4 Respuesta a la pregunta original

*¿El sistema de experimentación reduce errores y mantiene disciplina sin volver lento el
desarrollo?*

Con una sola corrida no se puede generalizar, pero esta corrida da una respuesta parcial
y matizada: **sí redujo errores concretos** (la premisa falsa sobre git fue atrapada; el
patrón de corte de STEP 6 se replicó correctamente por el hábito de leer el código real
en vez de asumir) **y no fue notablemente lento** (Fases A-D fueron rápidas). Pero
**no es infalible ni completo**: dejó pasar un gap de instrumentación real hasta después
de correr la simulación, y tiene al menos una zona gris genuina (mecánico vs. decisión de
diseño) que dependió de mi criterio en el momento, no de una regla del protocolo. El
proceso da disciplina real, no garantías — y el propio `sanctuary-step` podría mejorarse
agregando un chequeo explícito de "¿la instrumentación actual puede responder los
criterios de éxito de Fase A?" en su Fase B.

---

*Datos crudos de esta corrida en `data_runtime/` (STEP 7). Baseline de STEP 6 preservado
en `data_runtime_step6/`. Baseline de STEP 5 preservado en `data_runtime_step5/`.*

# STEP 8 — ¿La mortalidad compone?

Protocolo `sanctuary-step` completo (Fases A-H), incluida la nueva Observability
Audit introducida a raíz de STEP 7. Step puramente observacional: cero cambios
de motor, reglas, balance o mecánicas — solo instrumentación de análisis externa
y un parámetro CLI aditivo para poder correr distintas seeds.

---

## 1. Pregunta e hipótesis (Fase A)

**Pregunta**: ¿la mortalidad en SANCTUARY es aproximadamente *memoryless*
respecto al historial previo del agente, o haber muerto antes aumenta
sistemáticamente su riesgo futuro de volver a morir?

- **H0**: la muerte anterior no altera sistemáticamente el riesgo futuro.
- **H1**: existe dependencia histórica — mayor tasa de mortalidad posterior,
  y/o una ventana de riesgo elevado tras el rebirth.

Diseño completo, ajustes metodológicos (elegibilidad temporal del null model,
consistencia entre seeds como criterio operativo no universal, comparación
contra la distribución nula completa para Δticks) y aprobación: en el
intercambio de diseño previo a este reporte. No se repiten acá.

## 2. Cambios implementados (Fase C)

- **`src/sim/run.js`**: 2 líneas. `SEED_LABEL` ahora lee `process.argv[3]` con
  default `"sanctuary-v2"`; `SEED` deriva de `SEED_LABEL` en vez de un literal
  duplicado. Comportamiento por default verificado idéntico al de STEP 5/6/7
  (`seedFromString("sanctuary-v2") = 2789489010`), tanto por cálculo
  independiente como por auditoría de `scope-guard`.
- **`analyze_step8_recurrence.mjs`** (nuevo, raíz del repo): lee los 5
  `data_runtime_step8_*/state.json`, implementa el null model de permutación
  documentado (ver sección 4), no toca nada del motor.
- **Cero cambios en `src/engine/`**, `deathHistory`, tests, economía,
  progresión, combate, hambre, geografía o `world_seed.json`.

`scope-guard` auditó el diff de `run.js` de forma aislada y lo confirmó dentro
de alcance. También marcó (correctamente, con la información que tenía) una
modificación pendiente de commit de `.claude/skills/sanctuary-step/SKILL.md`
como fuera de alcance — ese cambio pertenece a una tarea previa ya aprobada y
cerrada (la mejora del propio protocolo, motivada por STEP 7), no a STEP 8.
Ver sección 7.1 para el detalle de esta limitación del método de auditoría.

## 3. Simulaciones (Fase E)

5 seeds, 600 días (14.400 ticks) cada una, mismas reglas en las cinco
(motor de STEP 7: combate + hambre como causas de muerte):

| Seed | Label | seedNumber | Duración corrida |
|---|---|---|---|
| a | `sanctuary-v2` | 2789489010 | 7m35s |
| b | `sanctuary-v2-step8-b` | 3240097812 | 6m53s |
| c | `sanctuary-v2-step8-c` | 4218807298 | 7m30s |
| d | `sanctuary-v2-step8-d` | 1662751129 | 7m38s |
| e | `sanctuary-v2-step8-e` | 2641446303 | 7m39s |

`DEEPSEEK_API_KEY` seguía presente en el entorno; se ocultó para las 5
corridas, replicando el fallback 100% determinista de STEP 5/6/7. Cada corrida
se archivó en `data_runtime_step8_{a..e}/` antes de la siguiente. El
`data_runtime/` de STEP 7 se preservó en `data_runtime_step7/`.

**Nota**: 600 días produjo, por primera vez desde STEP 6, muertes
permanentes reales (20 en total sobre 350 agentes-corrida) — a 300 días
(STEP 6 y 7) nunca se había observado ninguna.

## 4. Null model (documentado antes de la primera simulación)

Por cada seed: se fija la lista real de `(tick, cause)` de `deathHistory`
(representa el riesgo ambiental real del mundo), y se reasigna al azar, en
orden cronológico, **a qué agente le toca cada evento** — respetando que un
agente no puede acumular más de 3 asignaciones por réplica (el mismo techo
real de `lives`), ni recibir dos eventos en el mismo tick exacto. Dos
variantes: uniforme y ponderada por `riskTolerance + greed` (rasgos fijos
desde el nacimiento). 10.000 réplicas por combinación seed × variante ×
vista-de-causa (todas / hambre / combate), usando el RNG determinista del
propio motor (`makeRng`, seed fijo `1337` para la herramienta de análisis en
sí — reproducible, no la seed de la simulación).

**Limitación declarada**: el null no verifica si un agente específico podía
realmente estar en condiciones de recibir ese evento en particular (viajando,
preso, etc. — el motor real sí distingue esto para combate). Se trata a
cualquier agente no-permanentemente-muerto-en-esa-réplica como elegible para
cualquier evento. Es una simplificación explícita, no oculta.

## 5. Resultados (Fase F)

### 5.1 Recurrencia de muertes (Metric A) — Direct observation

| Seed | Muertes | Permanentes | Agentes ≥2 | Agentes ≥3 |
|---|---|---|---|---|
| a | 31 | 5 | 7 | 5 |
| b | 43 | 8 | 14 | 8 |
| c | 31 | 3 | 7 | 3 |
| d | 30 | 3 | 7 | 3 |
| e | 16 | 1 | 3 | 1 |
| **Total** | **151** | **20** | **38** | **20** |

(Los "agentes ≥3" coinciden exactamente con "permanentes" en cada seed — 20=20
— validación cruzada de que el conteo manual y `world.stats.permanentDeaths`
son consistentes.)

### 5.2 Percentil del conteo observado dentro del null — Direct observation

Percentil de "agentes con ≥2 muertes" dentro de la distribución nula de
permutación (10.000 réplicas), uniforme / ponderada:

| Seed | Todas las causas | Hambre | Combate |
|---|---|---|---|
| a | 94.8 / 94.1 | 98.6 / 98.3 | 97.4 / 97.2 |
| b | 100.0 / 99.9 | 98.4 / 97.9 | 100.0 / 100.0 |
| c | 94.8 / 93.9 | 97.0 / 96.5 | 98.6 / 98.4 |
| d | 96.7 / 95.5 | 99.1 / 98.8 | 99.8 / 99.8 |
| e | 97.4 / 96.8 | 99.7 / 99.7 | 85.2 / 84.5 |

**Consistencia entre seeds** (criterio operativo aprobado: ≥4/5, umbral por
seed = percentil ≥95 en ambos nulls):

- **Todas las causas pooled**: **3/5** (b, d, e) — **no llega** al criterio
  de ≥4/5. Por el ajuste metodológico 2, esto **no se interpreta como H0**:
  se reporta como señal inconsistente en la vista agregada.
- **Hambre por separado**: **5/5** — las cinco seeds superan 95 en ambos
  nulls. Consistente.
- **Combate por separado**: **4/5** (falla solo seed e, con 85.2/84.5) —
  llega justo al criterio.

**Hallazgo no anticipado en el diseño**: separar por causa (tal como pedía
la Fase A) revela una señal más consistente que la vista agregada — mezclar
combate y hambre en una sola tasa diluye el patrón en vez de reforzarlo. Esto
valida en retrospectiva la instrucción de no mezclar causas.

### 5.3 Δticks entre muertes consecutivas — Direct observation, con matiz importante

Percentil de la *mediana* observada de Δticks dentro de la distribución nula
completa (no solo comparación de medianas — cumpliendo el ajuste 3):

| Seed | Todas | Hambre | Combate |
|---|---|---|---|
| a | 51.9 | 62.6 | 43.3 |
| b | **18.4** | 45.9 | **12.4** |
| c | 30.1 | 25.8 | 30.3 |
| d | 46.1 | 61.5 | 26.7 |
| e | 43.2 | 79.3 | **9.7** (n=1) |

Si hubiera dependencia histórica aguda (morir aumenta el riesgo *inmediato*),
esperaríamos percentiles sistemáticamente bajos (repeticiones más rápidas que
el azar). **No es lo que se observa de forma consistente**: la mayoría de los
valores caen entre 25 y 65 — centro de la distribución nula, no en la cola
baja. Solo b-combate (12.4) y e-combate (9.7, con una sola observación) se
acercan a una cola baja clara; a-hambre (62.6), d-hambre (61.5) y e-hambre
(79.3) están del lado *opuesto* (repeticiones más lentas que el azar). Los
percentiles de cada delta individual (reporte completo en
`data_runtime_step8_analysis.json`) están dispersos por todo el rango 0-100,
sin agruparse cerca de 0.

**Esto es Proxy... no — es Direct observation, pero con una lectura
importante**: la señal de *conteo* (más agentes de lo esperable con ≥2
muertes) **no viene acompañada** de una señal de *timing* (repeticiones más
rápidas de lo esperable). Una diferencia chica y sin dirección consistente no
se trata como evidencia de H1, tal como pedía el ajuste 3.

### 5.4 Confusores (heterogeneidad vs. historia)

El null **ponderado** por `riskTolerance + greed` no reduce meaningfully el
percentil observado respecto al uniforme (diferencias de <2 puntos en casi
todos los casos: ver tabla 5.2). Esto sugiere que, si hay heterogeneidad fija
detrás del exceso de recurrencia, **no es (mayormente) explicable por esos
dos rasgos de personalidad específicos** — podría deberse a otros factores no
controlados en este Step (clase/oficio, ubicación de origen, riqueza
temprana, membresía de guild) o a un efecto genuinamente ligado al historial,
pero más lento/estructural que agudo (compatible con la ausencia de señal en
Δticks: por ejemplo, la pérdida repetida de nivel de oficio/oro en cada
rebirth podría elevar el riesgo de forma sostenida en vez de en una ventana
corta inmediata — no distinguible con los datos de este Step).

### 5.5 Unanswered / not-observable

- `gold`/`needs` al momento de una muerte por hambre: confirmado
  `NOT_OBSERVABLE` en la Observability Audit de Fase A — no se intentó
  responder, no se fuerza ningún proxy.
- Inventario/equipo exactos al morir, afinidad histórica con otros agentes:
  `NOT_OBSERVABLE`, sin intento de reconstrucción — quedan fuera del alcance
  de este Step tal como se declaró de antemano.

## 6. Veredicto (Fase G)

**RESULTADO MIXTO.**

No es `HIPÓTESIS APOYADA`: la vista agregada (todas las causas) no alcanza el
criterio de consistencia de 4/5 seeds, y la señal de timing (Δticks) no
corrobora la de conteo — no hay evidencia clara de un efecto *agudo* de
"haber muerto aumenta el riesgo inmediato".

No es `HIPÓTESIS NO APOYADA`: separado por causa, la señal de recurrencia
(conteo) es consistente y fuerte (5/5 en hambre, 4/5 en combate, con
percentiles mayormente ≥97), y sobrevive casi sin cambio bajo el null
ponderado por personalidad — no es un artefacto trivial de heterogeneidad de
riskTolerance/greed.

No es `RESULTADO INCONCLUSO`: no falta volumen ni instrumentación para
responder la pregunta central (ningún criterio `critical` quedó
`NOT_OBSERVABLE`) — el resultado es genuinamente mixto, no indeterminado por
falta de datos.

**Lectura honesta**: hay más agentes de los que el azar puro explicaría
concentrando múltiples muertes — especialmente dentro de cada causa por
separado — pero esa concentración no se manifiesta como "muertes repetidas
más rápido de lo normal" tras un rebirth. Esto apunta más hacia
**heterogeneidad persistente entre agentes** (algunos son, por razones que no
cambian rápido en el tiempo, más propensos a morir de nuevo) que hacia un
mecanismo agudo de "la muerte en sí misma dispara más riesgo inmediato" — sin
poder descartar del todo esta última con los datos disponibles. **No se
demuestra un "poverty trap" agudo. Tampoco se descarta un efecto más lento y
estructural.** Un futuro Step, si se decide perseguir esto, debería mirar
riesgo acumulado en ventanas más largas (no solo Δticks entre eventos) y
controlar por clase/oficio/riqueza inicial, no solo por rasgos de
personalidad.

## 7. Sobre el proceso (continuación del propósito metodológico de STEP 7)

### 7.1 Limitación real de `scope-guard` encontrada

`scope-guard` marcó el working tree como `FUERA DE ALCANCE` por un cambio en
`.claude/skills/sanctuary-step/SKILL.md` que pertenece a una tarea previa, ya
aprobada y cerrada, que nunca se commiteó (por instrucción explícita del
usuario, igual que en este Step). Auditar contra `git diff`/`git status` al
último commit no puede distinguir "cambio de un Step ya aprobado, pendiente
de commit" de "cambio de este Step" cuando ninguno de los dos commitea. El
diff aislado de `run.js` (lo único que sí cambió en STEP 8) fue confirmado
limpio por el mismo subagente. Esto es un hallazgo genuino sobre el método,
no un error de juicio del subagente — hizo lo correcto con la información
que tenía.

### 7.2 La Observability Audit (mejora introducida tras STEP 7) se usó de verdad

Al aplicarla a "gold al morir de hambre", una relectura cuidadosa del código
(no de memoria) reveló una asimetría que el diseño original de STEP 7 no
había notado: `decision.js` solo registra hambre/oro/salud numéricos cuando
`decide()` corre libremente; en los ticks donde `survivalOverride` fuerza una
acción — que son casi todos los ticks previos a una muerte por hambre — el
motor guarda un string genérico sin números. Combate, en cambio, sí conserva
esos números porque nunca puede ocurrir en un tick `forced`. El criterio
había sido preclasificado como posible `PROXY_ONLY`; la verificación directa
del código lo bajó a `NOT_OBSERVABLE` específicamente para hambre. Sin la
Observability Audit como paso explícito, esto se habría descubierto recién
en Fase F otra vez — exactamente el fallo que la auditoría se creó para
evitar.

### 7.3 Tiempo/esfuerzo

Fase A-B (diseño + verificación de observabilidad): la mayor parte del
esfuerzo de este Step, con dos idas y vueltas de aprobación. Fase C
(implementación): trivial, 2 líneas. Fase E (5 simulaciones × ~7.5 min):
~38 minutos de cómputo, sin intervención. Fase F (análisis): la construcción
del script de permutación fue lo segundo más laborioso, pero enteramente
mecánico una vez que el diseño del null model (Fase A/ajuste 1) ya estaba
resuelto en prosa — la implementación no requirió ninguna decisión nueva.

---

*Datos crudos en `data_runtime_step8_{a..e}/` (por seed) y
`data_runtime_step8_analysis.json` (resumen completo con todos los
percentiles y deltas). Baselines previos preservados en
`data_runtime_step5/`, `data_runtime_step6/`, `data_runtime_step7/`.*
